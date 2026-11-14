/**
 * Support tickets. A visitor fills in the form on /support and the ticket is posted to a Telegram
 * group. Open to everyone on purpose: someone who cannot sign in must still be able to ask for help.
 * Spam is held back by a hidden trap field, size limits, and a limit per visitor and overall.
 */
import { z } from "zod";
import { errorResponse, json } from "./handlers";

import { MAX_SUPPORT_MESSAGE, MAX_SUPPORT_SCREENSHOTS, MAX_SUPPORT_SCREENSHOT_BYTES, SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABEL as CATEGORY_LABEL, type SupportCategory } from "@/lib/support-options";

const MAX_EMAIL = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCREENSHOT_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

const CATEGORY_MARK: Record<SupportCategory, string> = { bug: "🐛", outlook: "📨", account: "👤", other: "💬" };

const BodySchema = z.object({
  category: z.unknown().optional(),
  message: z.unknown().optional(),
  email: z.unknown().optional(),
  /** The trap: hidden from people, so only a bot fills it in. */
  website: z.unknown().optional(),
  screenshots: z.unknown().optional(),
});

export interface SupportTelegram {
  token: string;
  chatId: string;
}

export function supportTelegram(): SupportTelegram | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

/** Counts recent tickets in memory. Good enough to stop one visitor flooding the group. */
export class SupportLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly perMinute = 3,
    private readonly perHour = 10,
    /** Across all visitors, so the group cannot be flooded from many addresses at once. */
    private readonly totalPerHour = 60,
  ) {}

  /** True when this visitor may send a ticket now; the ticket is then counted. */
  take(who: string, now = Date.now()): boolean {
    const hourAgo = now - 60 * 60 * 1000;
    let total = 0;
    for (const [key, times] of this.hits) {
      const recent = times.filter((t) => t > hourAgo);
      if (recent.length) this.hits.set(key, recent);
      else this.hits.delete(key);
      total += recent.length;
    }
    if (total >= this.totalPerHour) return false;
    const mine = this.hits.get(who) ?? [];
    if (mine.length >= this.perHour) return false;
    if (mine.filter((t) => t > now - 60 * 1000).length >= this.perMinute) return false;
    this.hits.set(who, [...mine, now]);
    return true;
  }
}

const sharedLimiter = new SupportLimiter();

export interface SupportDeps {
  telegram: SupportTelegram | null;
  /** Who is asking, for the limit: their network address. */
  who: string;
  browser?: string;
  limiter?: SupportLimiter;
  fetch?: typeof fetch;
  now?: () => Date;
}

const UNAVAILABLE = "Support is not available right now. Please try again later.";
const FAILED = "That did not send. Please try again in a minute.";

export async function submitSupport(raw: unknown, deps: SupportDeps): Promise<Response> {
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "Please describe the problem.");
  const body = parsed.data;

  // A bot filled in the trap. Say "sent" so it does not try again, and send nothing.
  if (body.website) return json({ ok: true });

  const category: SupportCategory = SUPPORT_CATEGORIES.includes(body.category as SupportCategory) ? (body.category as SupportCategory) : "other";
  const message = (typeof body.message === "string" ? body.message : "").trim().slice(0, MAX_SUPPORT_MESSAGE);
  const email = (typeof body.email === "string" ? body.email : "").trim();
  if (!message) return errorResponse(400, "Please describe the problem.");
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return errorResponse(400, "Please add a valid email address so we can reply.");

  // Pictures that are the wrong kind or too big are left out; they never stop the ticket.
  const shots: { bytes: Uint8Array<ArrayBuffer>; mime: string }[] = [];
  if (Array.isArray(body.screenshots)) {
    // Look at a few more than the limit so one bad entry does not cost a good picture.
    for (const s of body.screenshots.slice(0, MAX_SUPPORT_SCREENSHOTS * 3)) {
      if (shots.length >= MAX_SUPPORT_SCREENSHOTS) break;
      if (typeof s !== "string") continue;
      const m = SCREENSHOT_RE.exec(s);
      if (!m) continue;
      const buf = Buffer.from(m[2], "base64");
      if (buf.length === 0 || buf.length > MAX_SUPPORT_SCREENSHOT_BYTES) continue;
      shots.push({ bytes: new Uint8Array(buf), mime: `image/${m[1]}` });
    }
  }

  if (!deps.telegram) {
    console.error("support: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set");
    return errorResponse(503, UNAVAILABLE);
  }
  if (!(deps.limiter ?? sharedLimiter).take(deps.who)) return errorResponse(429, "Too many messages in a short time. Please wait a while and try again.");

  const send = deps.fetch ?? fetch;
  const { token, chatId } = deps.telegram;
  const browser = (deps.browser ?? "").slice(0, 300);
  // Plain text, no formatting marks: whatever the visitor types arrives exactly as typed.
  const text = [
    `${CATEGORY_MARK[category]} OUTLOOKSUCKS SUPPORT TICKET`,
    "From the form at outlooksucks.email/support",
    "",
    `Type: ${CATEGORY_LABEL[category]}`,
    `From: ${email}`,
    "",
    message,
    ...(shots.length ? ["", `📎 ${shots.length} screenshot${shots.length === 1 ? "" : "s"} below`] : []),
    "",
    ...(browser ? [`Browser: ${browser}`] : []),
    `Time: ${(deps.now?.() ?? new Date()).toISOString()}`,
  ].join("\n");

  try {
    const res = await send(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.error("support: Telegram refused the ticket", res.status);
      return errorResponse(502, FAILED);
    }
  } catch {
    // Never log the error itself: it can carry the request address, which holds the bot token.
    console.error("support: could not reach Telegram");
    return errorResponse(502, FAILED);
  }

  // The ticket is already delivered, so a picture that fails is logged and skipped.
  for (let i = 0; i < shots.length; i++) {
    try {
      const { bytes, mime } = shots[i];
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("caption", `Screenshot ${i + 1} of ${shots.length} from ${email}`.slice(0, 1000));
      form.append("photo", new Blob([bytes], { type: mime }), `screenshot-${i + 1}.${ext}`);
      const res = await send(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
      if (!res.ok) console.error(`support: screenshot ${i + 1} was refused`, res.status);
    } catch {
      console.error(`support: screenshot ${i + 1} failed`);
    }
  }

  return json({ ok: true });
}
