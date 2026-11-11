import { describe, expect, it } from "vitest";
import { parseReference, sniffReferenceType } from "./reference";
import { newEmailDocument, sampleEmailDocument } from "@/lib/email/starter";
import { runAssembly, type ModelCaller } from "./run";
import type { AiOutput } from "./schema";
import { systemPrompt } from "./prompt";
import { requireBrand } from "@/lib/email/brands";

const op = (o: Partial<AiOutput["operations"][number]>): AiOutput["operations"][number] => ({
  op: "update_module",
  moduleType: null,
  moduleId: null,
  index: null,
  toIndex: null,
  ref: null,
  subject: null,
  contentJson: null,
  settingsJson: null,
  ...o,
});

function scripted(outputs: AiOutput[]): ModelCaller & { calls: number; lastMessages?: unknown[] } {
  const fn = (async (req) => {
    fn.calls++;
    fn.lastMessages = req.messages;
    const output = outputs[Math.min(fn.calls - 1, outputs.length - 1)];
    return { kind: "ok", output, rawAssistant: [{ type: "text", text: JSON.stringify(output) }] };
  }) as ModelCaller & { calls: number; lastMessages?: unknown[] };
  fn.calls = 0;
  return fn;
}

describe("AI assembly", () => {
  it("never sends module HTML to the model", () => {
    const sys = systemPrompt(requireBrand("harbor-pine"));
    expect(sys).not.toMatch(/<table|<td|<tr/);
    expect(sys).toContain('"type": "cta"');
  });

  it("assembles an email from add operations", async () => {
    const doc = { ...newEmailDocument("harbor-pine"), modules: [] };
    const call = scripted([
      {
        summary: "Created an announcement.",
        unresolved: ["Event date"],
        operations: [
          op({ op: "add_module", moduleType: "header" }),
          op({ op: "add_module", moduleType: "hero", contentJson: JSON.stringify({ image: { alt: "Team photo" } }) }),
          op({ op: "add_module", moduleType: "text", contentJson: JSON.stringify({ headline: "News", body: "Hello **team**.\n\n[[PLACEHOLDER: date]]" }) }),
          op({ op: "add_module", moduleType: "cta", contentJson: JSON.stringify({ label: "RSVP", url: "" }) }),
          op({ op: "set_subject", subject: "Team news" }),
        ],
      },
    ]);
    const r = await runAssembly({ doc, instruction: "Create an announcement", history: [], call });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.modules.map((m) => m.type)).toEqual(["header", "hero", "text", "cta"]);
    expect(r.document.subject).toBe("Team news");
    expect((r.document.modules[1].content.image as { src: unknown }).src).toBeNull();
  });

  it("retries once with validation errors, then succeeds", async () => {
    const doc = sampleEmailDocument("lumen-labs");
    const text = doc.modules.find((m) => m.type === "text")!;
    const call = scripted([
      { summary: "x", unresolved: [], operations: [op({ moduleId: text.id, settingsJson: '{"padding":{"top":-5}}' })] },
      { summary: "Reduced padding.", unresolved: [], operations: [op({ moduleId: text.id, settingsJson: '{"padding":{"top":14,"bottom":14}}' })] },
    ]);
    const r = await runAssembly({ doc, instruction: "Reduce the padding around the headline", history: [], call });
    expect(call.calls).toBe(2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.attempts).toBe(2);
    expect(JSON.stringify(call.lastMessages)).toContain("rejected and nothing was applied");
  });

  it("fails without applying anything when output stays invalid", async () => {
    const doc = sampleEmailDocument("lumen-labs");
    const before = structuredClone(doc);
    const call = scripted([{ summary: "x", unresolved: [], operations: [op({ op: "add_module", moduleType: "countdown-timer" })] }]);
    const r = await runAssembly({ doc, instruction: "Add a countdown", history: [], call });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details?.join(" ")).toMatch(/not available/);
    expect(doc).toEqual(before);
  });

  it.each([
    ["malformed JSON", op({ moduleId: "m_x", contentJson: "{not json" })],
    ["non-object JSON", op({ moduleId: "m_x", contentJson: "[1,2]" })],
    ["missing required ids", op({ op: "move_module", moduleId: null, toIndex: 1 })],
    ["HTML injection field", op({ op: "add_module", moduleType: "text", contentJson: '{"html":"<script>alert(1)</script>"}' })],
    ["unsafe link", op({ op: "add_module", moduleType: "cta", contentJson: '{"url":"javascript:alert(1)"}' })],
    ["setting an image source", op({ op: "add_module", moduleType: "hero", contentJson: '{"image":{"src":{"kind":"asset","assetId":"x"}}}' })],
  ])("rejects %s", async (_label, bad) => {
    const doc = sampleEmailDocument("harbor-pine");
    const call = scripted([{ summary: "", unresolved: [], operations: [bad] }]);
    const r = await runAssembly({ doc, instruction: "x", history: [], call });
    expect(r.ok).toBe(false);
  });

  it("places an uploaded image and shows it to the model", async () => {
    const doc = { ...sampleEmailDocument("harbor-pine"), modules: [] };
    const call = scripted([{ summary: "Added the hero.", unresolved: [], operations: [op({ op: "add_module", moduleType: "hero", contentJson: '{"image":{"use":"img-1","alt":"Team"}}' })] }]);
    const images = [{ ref: "img-1", src: { kind: "asset" as const, assetId: "a1" }, width: 1200, height: 400, name: "team.png", mediaType: "image/png" as const, data: "AAAA" }];
    const r = await runAssembly({ doc, instruction: "x", history: [], call, images, reference: { mediaType: "application/pdf", data: "JVBERi0=" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.modules[0].content.image).toMatchObject({ src: { kind: "asset", assetId: "a1" }, naturalWidth: 1200, naturalHeight: 400, width: 600, alt: "Team" });
    const sent = JSON.stringify(call.lastMessages);
    expect(sent).toContain('"type":"document"');
    expect(sent).toContain('Uploaded image \\"img-1\\"');
    expect(sent).toContain("A design comp is attached");
  });

  it("rejects an image ref that was not uploaded", async () => {
    const doc = { ...sampleEmailDocument("harbor-pine"), modules: [] };
    const call = scripted([{ summary: "", unresolved: [], operations: [op({ op: "add_module", moduleType: "hero", contentJson: '{"image":{"use":"img-9"}}' })] }]);
    const images = [{ ref: "img-1", src: { kind: "asset" as const, assetId: "a1" }, width: 10, height: 10, name: "x.png" }];
    expect((await runAssembly({ doc, instruction: "x", history: [], call, images })).ok).toBe(false);
  });

  it("identifies comp files by their bytes", () => {
    expect(sniffReferenceType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe("application/pdf");
    expect(sniffReferenceType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffReferenceType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(parseReference(Buffer.from("not a file").toString("base64")).ok).toBe(false);
  });

  it("surfaces refusals and caller errors", async () => {
    const doc = sampleEmailDocument("harbor-pine");
    expect(await runAssembly({ doc, instruction: "x", history: [], call: async () => ({ kind: "refusal" }) })).toMatchObject({ ok: false });
    expect(await runAssembly({ doc, instruction: "x", history: [], call: async () => ({ kind: "error", message: "cut off" }) })).toMatchObject({ ok: false, error: "cut off" });
  });
});
