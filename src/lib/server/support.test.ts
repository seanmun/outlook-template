import { describe, expect, it, vi } from "vitest";
import { sampleBytes } from "@/lib/email/samples";
import { SupportLimiter, submitSupport, type SupportDeps } from "./support";

const TELEGRAM = { token: "TEST-TOKEN", chatId: "-100123" };

function setup(over: Partial<SupportDeps> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const deps: SupportDeps = { telegram: TELEGRAM, who: "1.2.3.4", browser: "TestBrowser/1.0", limiter: new SupportLimiter(), fetch: fetchMock, now: () => new Date("2026-11-13T20:00:00Z"), ...over };
  return { calls, deps };
}

const ticket = { category: "outlook", message: "The button is square in Outlook.", email: "pat@example.com" };
const textOf = (call: { init: RequestInit }) => (JSON.parse(String(call.init.body)) as { text: string; chat_id: string; parse_mode?: string });

describe("support tickets", () => {
  it("posts the ticket to the Telegram group, marked as coming from OUTLOOKSUCKS", async () => {
    const { calls, deps } = setup();
    const res = await submitSupport(ticket, deps);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/botTEST-TOKEN/sendMessage");
    const sent = textOf(calls[0]);
    expect(sent.chat_id).toBe("-100123");
    expect(sent.parse_mode).toBeUndefined();
    expect(sent.text).toContain("OUTLOOKSUCKS SUPPORT TICKET");
    expect(sent.text).toContain("outlooksucks.email/support");
    expect(sent.text).toContain("Type: Problem in Outlook");
    expect(sent.text).toContain("From: pat@example.com");
    expect(sent.text).toContain("The button is square in Outlook.");
    expect(sent.text).toContain("Browser: TestBrowser/1.0");
  });

  it("sends what the visitor typed exactly, formatting marks and all", async () => {
    const { calls, deps } = setup();
    const message = "It shows *stars*, _underscores_, [brackets](x) and `ticks`.";
    await submitSupport({ ...ticket, message }, deps);
    expect(textOf(calls[0]).text).toContain(message);
  });

  it("never puts the bot token or the group id in the reply to the visitor", async () => {
    for (const status of [200, 500]) {
      const { deps } = setup({ fetch: (async () => new Response("bad TEST-TOKEN -100123", { status })) as unknown as typeof fetch });
      const body = await (await submitSupport(ticket, deps)).text();
      expect(body).not.toContain("TEST-TOKEN");
      expect(body).not.toContain("-100123");
    }
    const { deps } = setup({ fetch: (async () => { throw new Error("failed https://api.telegram.org/botTEST-TOKEN/sendMessage"); }) as unknown as typeof fetch });
    const res = await submitSupport(ticket, deps);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("TEST-TOKEN");
  });

  it("does not write the bot token to the server log when Telegram fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = (async () => { throw new Error("failed https://api.telegram.org/botTEST-TOKEN/sendMessage"); }) as unknown as typeof fetch;
      await submitSupport(ticket, setup({ fetch: boom }).deps);
      await submitSupport(ticket, setup({ fetch: (async () => new Response("TEST-TOKEN", { status: 401 })) as unknown as typeof fetch }).deps);
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("TEST-TOKEN");
    } finally {
      log.mockRestore();
    }
  });

  it("needs a message and a real email address", async () => {
    const { calls, deps } = setup();
    expect((await submitSupport({ ...ticket, message: "   " }, deps)).status).toBe(400);
    expect((await submitSupport({ ...ticket, email: "not-an-email" }, deps)).status).toBe(400);
    expect((await submitSupport({ ...ticket, email: "" }, deps)).status).toBe(400);
    expect((await submitSupport(null, deps)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("treats an unknown type as 'Something else' and cuts an over-long message", async () => {
    const { calls, deps } = setup();
    await submitSupport({ ...ticket, category: "nonsense", message: "x".repeat(9000) }, deps);
    const text = textOf(calls[0]).text;
    expect(text).toContain("Type: Something else");
    expect(text.length).toBeLessThan(4096);
  });

  it("pretends to succeed and sends nothing when the hidden trap field is filled in", async () => {
    const { calls, deps } = setup();
    const res = await submitSupport({ ...ticket, website: "http://spam.example" }, deps);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("says support is unavailable when Telegram is not set up", async () => {
    const { calls, deps } = setup({ telegram: null });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await submitSupport(ticket, deps)).status).toBe(503);
    } finally {
      log.mockRestore();
    }
    expect(calls).toHaveLength(0);
  });

  it("sends up to three screenshots as photos and leaves out anything that is not a picture", async () => {
    const { calls, deps } = setup();
    const png = `data:image/png;base64,${Buffer.from(sampleBytes("hero-harbor")!).toString("base64")}`;
    const res = await submitSupport({ ...ticket, screenshots: [png, "data:text/html;base64,PGI+", 42, png, png, png] }, deps);
    expect(res.status).toBe(200);
    const photos = calls.filter((c) => c.url.endsWith("/sendPhoto"));
    expect(photos).toHaveLength(3);
    expect(textOf(calls[0]).text).toContain("3 screenshots below");
    const form = photos[0].init.body as FormData;
    expect(form.get("chat_id")).toBe("-100123");
    expect((form.get("photo") as File).type).toBe("image/png");
  });

  it("still delivers the ticket when a screenshot fails", async () => {
    const png = `data:image/png;base64,${Buffer.from(sampleBytes("hero-harbor")!).toString("base64")}`;
    const fetchMock = (async (url: string | URL | Request) => new Response("{}", { status: String(url).endsWith("/sendPhoto") ? 400 : 200 })) as unknown as typeof fetch;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await submitSupport({ ...ticket, screenshots: [png] }, setup({ fetch: fetchMock }).deps)).status).toBe(200);
    } finally {
      log.mockRestore();
    }
  });

  it("limits how many tickets one visitor can send", async () => {
    const { calls, deps } = setup();
    for (let i = 0; i < 3; i++) expect((await submitSupport(ticket, deps)).status).toBe(200);
    expect((await submitSupport(ticket, deps)).status).toBe(429);
    expect((await submitSupport(ticket, { ...deps, who: "5.6.7.8" })).status).toBe(200);
    expect(calls).toHaveLength(4);
  });
});

describe("support limiter", () => {
  it("allows 3 a minute and 10 an hour per visitor, and forgets after an hour", () => {
    const l = new SupportLimiter();
    const t0 = 1_000_000_000;
    const min = 60_000;
    let ok = 0;
    for (let i = 0; i < 20; i++) if (l.take("a", t0 + i * 2 * min)) ok++;
    expect(ok).toBe(10);
    expect(l.take("a", t0 + 41 * min)).toBe(false);
    expect(l.take("a", t0 + 200 * min)).toBe(true);
  });

  it("caps the total across all visitors", () => {
    const l = new SupportLimiter(3, 10, 5);
    for (let i = 0; i < 5; i++) expect(l.take(`v${i}`, 1000)).toBe(true);
    expect(l.take("someone-new", 1000)).toBe(false);
  });
});
