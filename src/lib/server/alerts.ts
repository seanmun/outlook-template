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
