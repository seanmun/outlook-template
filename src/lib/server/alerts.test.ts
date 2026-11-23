import { describe, expect, it, vi } from "vitest";
import { AlertLimiter, alertError, alertGuestAiCap, alertSignup, maskEmail, alertVerificationEmail, errorText, scrub, type AlertDeps } from "./alerts";

const TELEGRAM = { token: "123456789:AAH-secret_TOKEN_value_0123456789abcd", chatId: "-100123" };

function setup(over: Partial<AlertDeps> = {}) {
  const calls: { url: string; text: string; chatId: string }[] = [];
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string; chat_id: string };
    calls.push({ url: String(url), text: body.text, chatId: body.chat_id });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const deps: AlertDeps = { telegram: TELEGRAM, fetch: fetchMock, now: () => new Date("2026-11-13T21:00:00Z"), limiter: new AlertLimiter(), ...over };
  return { calls, deps };
}

describe("signup notices", () => {
  it("tells the group who signed up, marked as OUTLOOKSUCKS", async () => {
    const { calls, deps } = setup();
    expect(await alertSignup({ email: "pat@example.com", name: "Pat Lee", method: "google" }, deps)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe("-100123");
    expect(calls[0].text).toContain("OUTLOOKSUCKS NEW SIGNUP");
    expect(calls[0].text).toContain("User: pa***@example.com");
    expect(calls[0].text).toContain("Name: Pat Lee");
    expect(calls[0].text).toContain("Signed up with: google");
    expect(calls[0].text).toContain("Time: 2026-11-13T21:00:00.000Z");
  });

  it("does nothing, and does not fail, when Telegram is not set up or is down", async () => {
    expect(await alertSignup({ email: "pat@example.com" }, setup({ telegram: null }).deps)).toBe(false);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const down = (async () => { throw new Error(`failed https://api.telegram.org/bot${TELEGRAM.token}/sendMessage`); }) as unknown as typeof fetch;
      expect(await alertSignup({ email: "pat@example.com" }, setup({ fetch: down }).deps)).toBe(false);
      expect(await alertError({ kind: "server", message: "boom" }, setup({ fetch: down }).deps)).toBe(false);
      const refused = (async () => new Response(TELEGRAM.token, { status: 401 })) as unknown as typeof fetch;
      expect(await alertSignup({ email: "pat@example.com" }, setup({ fetch: refused }).deps)).toBe(false);
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret_TOKEN");
    } finally {
      log.mockRestore();
    }
  });
});

describe("error notices", () => {
  it("says what broke and where, marked as OUTLOOKSUCKS", async () => {
    const { calls, deps } = setup();
    expect(await alertError({ kind: "server", message: "Supabase list emails failed: timeout", where: "GET /api/emails", details: "Reference 12345" }, deps)).toBe(true);
    expect(calls[0].text).toContain("OUTLOOKSUCKS ERROR");
    expect(calls[0].text).toContain("Type: Server");
    expect(calls[0].text).toContain("Message: Supabase list emails failed: timeout");
    expect(calls[0].text).toContain("Where: GET /api/emails");
    expect(calls[0].text).toContain("Details: Reference 12345");
  });

  it("sends the same error once, not on every repeat, and again after ten minutes", async () => {
    let now = new Date("2026-11-13T21:00:00Z");
    const { calls, deps } = setup({ now: () => now });
    const error = { kind: "browser" as const, message: "TypeError: x is undefined", where: "/editor/abc" };
    expect(await alertError(error, deps)).toBe(true);
    expect(await alertError(error, deps)).toBe(false);
    expect(await alertError({ ...error, message: "a different one" }, deps)).toBe(true);
    now = new Date("2026-11-13T21:11:00Z");
    expect(await alertError(error, deps)).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("stops at 20 an hour however many different errors there are", async () => {
    const { calls, deps } = setup();
    for (let i = 0; i < 50; i++) await alertError({ kind: "server", message: `error ${i}` }, deps);
    expect(calls).toHaveLength(20);
  });

  it("hides keys and sign-in tokens, and never sends more than Telegram accepts", async () => {
    const { calls, deps } = setup();
    const secret = `request to https://api.telegram.org/bot${TELEGRAM.token}/sendMessage failed; key sk_live_abcdEFGH12345678 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl`;
    await alertError({ kind: "server", message: secret, details: secret + "x".repeat(5000) }, deps);
    const text = calls[0].text;
    expect(text).not.toContain("secret_TOKEN");
    expect(text).not.toContain("sk_live_abcd");
    expect(text).not.toContain("eyJhbGci");
    expect(text.length).toBeLessThanOrEqual(4096);
  });
});

describe("scrub", () => {
  it("leaves ordinary text alone", () => {
    const plain = "Supabase list emails failed: connection timeout after 3000 ms (attempt 2)";
    expect(scrub(plain)).toBe(plain);
  });
  it("hides the usual kinds of key", () => {
    expect(scrub("sk_test_abcdefgh12345")).toBe("[hidden]");
    expect(scrub("sk-ant-api03-abcdefgh")).toBe("[hidden]");
    expect(scrub("whsec_abcdefgh12345")).toBe("[hidden]");
    expect(scrub("bot123456:ABC-def_ghi")).toBe("bot[hidden]");
  });
});

describe("errorText", () => {
  it("gives the words without the stack", () => {
    expect(errorText(new Error("it broke"))).toBe("it broke");
    expect(errorText(new TypeError("not a function"))).toBe("TypeError: not a function");
    expect(errorText("plain")).toBe("plain");
    expect(errorText({ odd: true })).toBe("Unknown error");
  });
});

describe("sign-up email notices", () => {
  it("reports a sign-up email with the address and kind", async () => {
    const { calls, deps } = setup();
    expect(await alertVerificationEmail({ slug: "verification_code", to: "pat@example.com", userId: null, status: "queued", deliveredByClerk: true }, deps)).toBe(true);
    expect(calls[0].text).toContain("OUTLOOKSUCKS SIGN-UP EMAIL SENT");
    expect(calls[0].text).toContain("To: pa***@example.com");
    expect(calls[0].text).toContain("Kind: verification_code");
    expect(calls[0].text).toContain("Status: queued");
  });

  it("stays quiet for sign-in emails, emails to existing accounts, and invitations", async () => {
    const { calls, deps } = setup();
    expect(await alertVerificationEmail({ slug: "verification_code", to: "pat@example.com", userId: "user_123", deliveredByClerk: true }, deps)).toBe(false);
    expect(await alertVerificationEmail({ slug: "magic_link_sign_in", to: "pat@example.com", deliveredByClerk: true }, deps)).toBe(false);
    expect(await alertVerificationEmail({ slug: "organization_invitation", to: "pat@example.com", deliveredByClerk: true }, deps)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("always reports an email that was not sent, whoever it was for", async () => {
    const { calls, deps } = setup();
    expect(await alertVerificationEmail({ slug: "magic_link_sign_in", to: "pat@example.com", userId: "user_123", deliveredByClerk: true, suppressionReason: "previous hard bounce" }, deps)).toBe(true);
    expect(await alertVerificationEmail({ slug: "verification_code", to: "lee@example.com", deliveredByClerk: false }, deps)).toBe(true);
    expect(await alertVerificationEmail({ slug: "organization_invitation", to: "sam@example.com", userId: "user_9", status: "failed", deliveredByClerk: true }, deps)).toBe(true);
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.text).toContain("OUTLOOKSUCKS EMAIL NOT SENT");
    expect(calls[0].text).toContain("Reason: previous hard bounce");
  });
});

describe("guest AI limit notice", () => {
  it("tells the group the day's guest AI requests are used up", async () => {
    const { calls, deps } = setup();
    expect(await alertGuestAiCap(200, deps)).toBe(true);
    expect(calls[0].text).toContain("OUTLOOKSUCKS GUEST AI LIMIT REACHED");
    expect(calls[0].text).toContain("all 200 AI requests");
  });
});

describe("hiding email addresses in notices", () => {
  it("keeps the first two letters and the domain", () => {
    expect(maskEmail("pat.lee@example.com")).toBe("pa***@example.com");
    expect(maskEmail("  Jo@company.co.uk ")).toBe("J***@company.co.uk");
    expect(maskEmail("a@b.io")).toBe("a***@b.io");
    expect(maskEmail("not-an-address")).toBe("(hidden)");
    expect(maskEmail("@example.com")).toBe("(hidden)");
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
  });

  it("never sends a full address in a sign-up or sign-up email notice", async () => {
    const { calls, deps } = setup();
    await alertSignup({ email: "pat.lee@example.com", name: "Pat Lee", method: "email" }, deps);
    await alertVerificationEmail({ slug: "verification_code", to: "pat.lee@example.com", deliveredByClerk: true }, deps);
    await alertVerificationEmail({ slug: "verification_code", to: "pat.lee@example.com", deliveredByClerk: true, suppressionReason: "bounced" }, deps);
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.text).not.toContain("pat.lee");
      expect(c.text).toContain("pa***@example.com");
    }
  });
});
