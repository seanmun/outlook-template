/**
 * Short notices to the maintainer's Telegram group: a new account, or something going wrong.
 * Same bot and group as the support form. Nothing here ever throws or blocks the visitor: if
 * Telegram is not set up or cannot be reached, the notice is simply not sent.
 *
 * Safe to load anywhere on the server, including the early start-up file, so it uses nothing
 * but fetch.
 */
export interface TelegramTarget {
  token: string;
  chatId: string;
}

export function telegramTarget(): TelegramTarget | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

/** Telegram refuses messages longer than this. */
const MAX_TELEGRAM_TEXT = 4096;

/** Blanks out anything that looks like a key or sign-in token before it is sent or logged. */
export function scrub(text: string): string {
  return text
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[hidden]")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}/g, "[hidden]")
    .replace(/\b(sk|pk|whsec|sb_secret|sb_publishable)[-_][A-Za-z0-9_-]{8,}/g, "[hidden]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[hidden]")
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [hidden]");
}

export interface AlertDeps {
  telegram?: TelegramTarget | null;
  fetch?: typeof fetch;
  now?: () => Date;
  limiter?: AlertLimiter;
}

/** Sends plain text to the group. True when Telegram accepted it. Never throws. */
async function send(text: string, deps: AlertDeps): Promise<boolean> {
  const target = deps.telegram === undefined ? telegramTarget() : deps.telegram;
  if (!target) return false;
  try {
    const res = await (deps.fetch ?? fetch)(`https://api.telegram.org/bot${target.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: target.chatId, text: text.slice(0, MAX_TELEGRAM_TEXT), disable_web_page_preview: true }),
    });
    if (!res.ok) console.error("alert: Telegram refused the message", res.status);
    return res.ok;
  } catch {
    // Never log the error itself: it can carry the request address, which holds the bot token.
    console.error("alert: could not reach Telegram");
    return false;
  }
}

const stamp = (deps: AlertDeps) => `Time: ${(deps.now?.() ?? new Date()).toISOString()}`;
const cut = (value: unknown, max: number) => scrub(typeof value === "string" ? value : value == null ? "" : String(value)).slice(0, max);

/* ---------------- New accounts ---------------- */

export interface SignupAlert {
  email?: string | null;
  name?: string | null;
  /** How they signed up, e.g. "email" or "google". */
  method?: string | null;
}

export async function alertSignup(signup: SignupAlert, deps: AlertDeps = {}): Promise<boolean> {
  const lines = ["🎉 OUTLOOKSUCKS NEW SIGNUP", "", `User: ${cut(signup.email, 200) || "(no email given)"}`];
  if (signup.name) lines.push(`Name: ${cut(signup.name, 120)}`);
  if (signup.method) lines.push(`Signed up with: ${cut(signup.method, 60)}`);
  lines.push("", stamp(deps));
  return send(lines.join("\n"), deps);
}

/* ---------------- Verification emails ---------------- */

/** The parts of Clerk's "an email was created" report that are safe to pass on. */
export interface SentEmail {
  /** Clerk's name for the kind of email, e.g. "verification_code" or "magic_link_sign_up". */
  slug?: string | null;
  to?: string | null;
  /** Set when the email went to someone who already has an account. */
  userId?: string | null;
  status?: string | null;
  /** False when Clerk is set up to leave the sending to us, which nothing here does. */
  deliveredByClerk?: boolean | null;
  /** Clerk's reason for refusing to send, e.g. an address that bounced before. */
  suppressionReason?: string | null;
}

/**
 * Tells the group when Clerk sends a sign-up email (the code or link that proves an address), so a
 * visitor who says "I never got it" can be checked: sent and lost on the way, or never sent at all.
 * A "new signup" notice follows when they finish. An email Clerk did not send is always reported.
 *
 * Emails to people who already have an account (sign-in codes) and invitations are left out, to
 * keep the group quiet. Only the address and kind are passed on, never the subject or the body:
 * both can hold the code or link itself.
 */
export async function alertVerificationEmail(email: SentEmail, deps: AlertDeps = {}): Promise<boolean> {
  const slug = (email.slug ?? "").toLowerCase();
  const notSent = !!email.suppressionReason || email.deliveredByClerk === false || /fail|bounc|reject|suppress/i.test(email.status ?? "");
  const forSignup = !email.userId && !slug.includes("invitation") && !slug.includes("sign_in");
  if (!notSent && !forSignup) return false;
  const lines = [notSent ? "\u26a0\ufe0f OUTLOOKSUCKS EMAIL NOT SENT" : "\ud83d\udce7 OUTLOOKSUCKS SIGN-UP EMAIL SENT", "", `To: ${cut(email.to, 200) || "(no address given)"}`];
  if (slug) lines.push(`Kind: ${cut(slug, 80)}`);
  if (email.status) lines.push(`Status: ${cut(email.status, 60)}`);
  if (email.suppressionReason) lines.push(`Reason: ${cut(email.suppressionReason, 200)}`);
  if (email.deliveredByClerk === false) lines.push("Clerk is set to not send this email itself.");
  lines.push("", notSent ? "This person will not get the email." : "A NEW SIGNUP message follows when they finish. If none comes, the email may not have reached them.", "", stamp(deps));
  return send(lines.join("\n"), deps);
}

/* ---------------- Guest AI ceiling ---------------- */

/** Tells the group that visitors without an account have used up the day's AI requests. Sent once, by the request that takes the last one. */
export async function alertGuestAiCap(total: number, deps: AlertDeps = {}): Promise<boolean> {
  return send(["\u26a0\ufe0f OUTLOOKSUCKS GUEST AI LIMIT REACHED", "", `Visitors without an account have used all ${total} AI requests for today.`, "Until midnight UTC they are asked to create an account. Signed-in people are not affected.", "", stamp(deps)].join("\n"), deps);
}

/* ---------------- Errors ---------------- */

/** Stops one broken thing from filling the group: the same error once in ten minutes, and a ceiling per hour. */
export class AlertLimiter {
  private readonly last = new Map<string, number>();
  private sent: number[] = [];
  constructor(
    private readonly repeatAfterMs = 10 * 60 * 1000,
    private readonly perHour = 20,
  ) {}

  take(key: string, now = Date.now()): boolean {
    this.sent = this.sent.filter((t) => t > now - 60 * 60 * 1000);
    for (const [k, t] of this.last) if (t <= now - this.repeatAfterMs) this.last.delete(k);
    if (this.last.has(key) || this.sent.length >= this.perHour) return false;
    this.last.set(key, now);
    this.sent.push(now);
    return true;
  }
}

const sharedLimiter = new AlertLimiter();

export type ErrorKind = "server" | "browser" | "download" | "ai";
const KIND_LABEL: Record<ErrorKind, string> = { server: "Server", browser: "In a visitor's browser", download: "Download", ai: "AI" };

export interface ErrorAlert {
  kind: ErrorKind;
  message: unknown;
  /** The page or action where it happened. */
  where?: string | null;
  details?: unknown;
}

/** True when a notice was sent. Repeats of the same error are skipped for a while. */
export async function alertError(error: ErrorAlert, deps: AlertDeps = {}): Promise<boolean> {
  if ((deps.telegram === undefined ? telegramTarget() : deps.telegram) === null) return false;
  const message = cut(error.message, 600) || "No message";
  const where = cut(error.where, 200);
  if (!(deps.limiter ?? sharedLimiter).take(`${error.kind}|${where}|${message}`, (deps.now?.() ?? new Date()).getTime())) return false;
  const lines = ["❌ OUTLOOKSUCKS ERROR", "", `Type: ${KIND_LABEL[error.kind]}`, `Message: ${message}`];
  if (where) lines.push(`Where: ${where}`);
  const details = cut(error.details, 800);
  if (details) lines.push(`Details: ${details}`);
  lines.push("", stamp(deps));
  return send(lines.join("\n"), deps);
}

/** The words of whatever was thrown, without its stack. */
export function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name === "Error" ? "" : `${err.name}: `}${err.message}`;
  return typeof err === "string" ? err : "Unknown error";
}
