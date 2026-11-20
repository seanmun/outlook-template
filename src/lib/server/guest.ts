import { createHash, randomUUID } from "node:crypto";
import type { GuestKeys } from "./repo";

/**
 * Who a visitor without an account is, for counting their AI requests and nothing else.
 *
 * The browser is known by a random id kept in a cookie. It says nothing about the person; clearing
 * cookies gives a new one, which is why the network address is counted as well. The address itself
 * is never stored: it is scrambled together with the date, so the same address gives a different
 * value each day and yesterday's cannot be matched to today's.
 */
export const GUEST_COOKIE = "os_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Guest {
  keys: GuestKeys;
  /** The Set-Cookie value to send back when the browser had no id yet, otherwise null. */
  setCookie: string | null;
}

export function guestFrom(req: Request, now = new Date()): Guest {
  const cookies = req.headers.get("cookie") ?? "";
  const found = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${GUEST_COOKIE}=`))?.slice(GUEST_COOKIE.length + 1);
  const known = found && UUID.test(found) ? found : null;
  const browser = known ?? randomUUID();
  // Vercel puts the visitor's address in these headers itself; a visitor cannot forge them there.
  const address = (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "unknown";
  const network = createHash("sha256").update(`${now.toISOString().slice(0, 10)}|${address}`).digest("hex").slice(0, 40);
  const secure = (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")) === "https";
  return { keys: { browser, network }, setCookie: known ? null : `${GUEST_COOKIE}=${browser}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
}

/** The same response with the guest cookie added, when there is one to add. */
export function withGuestCookie(res: Response, guest: Guest | null): Response {
  if (guest?.setCookie) res.headers.append("Set-Cookie", guest.setCookie);
  return res;
}
