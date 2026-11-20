import { describe, expect, it } from "vitest";
import { GUEST_COOKIE, guestFrom, withGuestCookie } from "./guest";

const req = (headers: Record<string, string>, url = "https://www.outlooksucks.email/api/ai") => new Request(url, { method: "POST", headers });
const DAY = new Date("2026-11-20T10:00:00Z");

describe("guest identity for AI counting", () => {
  it("gives a new browser an id in a cookie and reuses it afterwards", () => {
    const first = guestFrom(req({ "x-real-ip": "203.0.113.7" }), DAY);
    expect(first.setCookie).toMatch(new RegExp(`^${GUEST_COOKIE}=${first.keys.browser}; Path=/; Max-Age=\\d+; HttpOnly; SameSite=Lax; Secure$`));
    const again = guestFrom(req({ "x-real-ip": "203.0.113.7", cookie: `other=1; ${GUEST_COOKIE}=${first.keys.browser}` }), DAY);
    expect(again.keys.browser).toBe(first.keys.browser);
    expect(again.setCookie).toBeNull();
  });

  it("ignores a cookie that is not one of our ids", () => {
    const g = guestFrom(req({ cookie: `${GUEST_COOKIE}=../../etc/passwd` }), DAY);
    expect(g.keys.browser).toMatch(/^[0-9a-f-]{36}$/);
    expect(g.setCookie).not.toBeNull();
  });

  it("never keeps the network address itself, and scrambles it differently each day", () => {
    const a = guestFrom(req({ "x-real-ip": "203.0.113.7" }), DAY).keys.network;
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toContain("203");
    expect(guestFrom(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), DAY).keys.network).toBe(a);
    expect(guestFrom(req({ "x-real-ip": "203.0.113.8" }), DAY).keys.network).not.toBe(a);
    expect(guestFrom(req({ "x-real-ip": "203.0.113.7" }), new Date("2026-11-21T10:00:00Z")).keys.network).not.toBe(a);
  });

  it("adds the cookie to a response only when there is one to add", () => {
    const g = guestFrom(req({}), DAY);
    expect(withGuestCookie(new Response("ok"), g).headers.get("set-cookie")).toContain(GUEST_COOKIE);
    expect(withGuestCookie(new Response("ok"), { ...g, setCookie: null }).headers.get("set-cookie")).toBeNull();
    expect(withGuestCookie(new Response("ok"), null).headers.get("set-cookie")).toBeNull();
  });
});
