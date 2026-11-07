import { describe, expect, it } from "vitest";
import { BRANDS } from "./brands";
import { escapeHtml, sanitizeUrl } from "./html";
import { findContentIssues } from "./issues";
import { applyOperations, type Operation } from "./operations";
import { MODULES, validateDocument } from "./registry";
import { renderEmailHtml } from "./render";
import { liteToRichText, RichTextSchema } from "./richtext";
import { newEmailDocument, sampleEmailDocument } from "./starter";
import { sampleDataUrl } from "./samples";
import type { ImageSource } from "./fields";

const resolve = (src: ImageSource) => (src.kind === "sample" ? sampleDataUrl(src.sampleId) : `https://cdn.example/${src.assetId}`);

let counter = 0;
const ids = () => `m_test${String(++counter).padStart(6, "0")}`;

describe("escaping and links", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>&'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>",
    "vbscript:msgbox",
    "/relative/path",
    "https://user:pass@example.com",
    "https://exa mple.com",
    "https://example.com/\u0000",
    "file:///etc/passwd",
  ])("rejects unsafe URL %s", (u) => {
    expect(sanitizeUrl(u)).toBeNull();
  });

  it("accepts https and mailto", () => {
    expect(sanitizeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(sanitizeUrl("mailto:team@example.com")).toBe("mailto:team@example.com");
  });

  it("renders hostile text fields inertly", () => {
    const doc = newEmailDocument("harbor-pine");
    doc.modules[0].content.wordmark = `<img src=x onerror=alert(1)>`;
    doc.modules[1].content.headline = `"><script>alert(1)</script>`;
    const r = validateDocument(doc);
    expect(r.ok).toBe(true);
    const html = renderEmailHtml(r.ok ? r.doc : doc, { resolveImage: resolve });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects rich text containing unsafe links or unknown nodes", () => {
    const bad = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] };
    expect(RichTextSchema.safeParse(bad).success).toBe(false);
    const html = { type: "doc", content: [{ type: "html", value: "<script>" }] };
    expect(RichTextSchema.safeParse(html).success).toBe(false);
    const onclick = { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "x" }, content: [] }] };
    // unknown attrs are stripped, never rendered
    const parsed = RichTextSchema.safeParse(onclick);
    expect(parsed.success && JSON.stringify(parsed.data)).not.toContain("onclick");
  });

  it("drops unsafe links when parsing AI markdown-lite", () => {
    const rt = liteToRichText("Click [here](javascript:alert(1)) or [there](https://example.com)");
    const json = JSON.stringify(rt);
    expect(json).not.toContain("javascript:");
    expect(json).toContain("https://example.com");
  });

  it("rejects unsafe CTA urls at validation time", () => {
    const doc = sampleEmailDocument("harbor-pine");
    const cta = doc.modules.find((m) => m.type === "cta")!;
    cta.content.url = "javascript:alert(1)";
    expect(validateDocument(doc).ok).toBe(false);
  });
});

describe("module registry and rendering", () => {
  it("every brand's defaults validate for every module it allows", () => {
    for (const brand of BRANDS) {
      expect(validateDocument(newEmailDocument(brand.id)).ok).toBe(true);
      expect(validateDocument(sampleEmailDocument(brand.id)).ok).toBe(true);
      for (const def of MODULES) {
        const d = def.defaults(brand);
        expect(def.contentSchema.safeParse(d.content).success, `${brand.id}/${def.type} content`).toBe(true);
        expect(def.settingsSchema.safeParse(d.settings).success, `${brand.id}/${def.type} settings`).toBe(true);
      }
    }
  });

  it("produces email-safe HTML: no classes, scripts, flex/grid, or media queries", () => {
    for (const brand of BRANDS) {
      const html = renderEmailHtml(sampleEmailDocument(brand.id), { resolveImage: resolve });
      expect(html).not.toMatch(/class=/i);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/display:\s*(flex|grid)/i);
      expect(html).not.toMatch(/@media/i);
      expect(html).not.toMatch(/<style/i);
      expect(html).not.toMatch(/<link/i);
      // every img has explicit width/height attributes
      for (const img of html.match(/<img [^>]+>/g) ?? []) {
        expect(img).toMatch(/ width="\d+"/);
        expect(img).toMatch(/ height="\d+"/);
      }
    }
  });

  it("uses the brand-specific header renderer for copperfield", () => {
    const html = renderEmailHtml(newEmailDocument("copperfield"), { resolveImage: resolve });
    expect(html).toContain('height="6"');
    const other = renderEmailHtml(newEmailDocument("harbor-pine"), { resolveImage: resolve });
    expect(other).not.toContain('height="6"');
  });

  it("annotations exist only in preview mode", () => {
    const doc = newEmailDocument("lumen-labs");
    expect(renderEmailHtml(doc, { resolveImage: resolve, annotate: true })).toContain("data-module-id");
    expect(renderEmailHtml(doc, { resolveImage: resolve })).not.toContain("data-module-id");
  });

  it("rejects unknown module types and modules not allowed for the brand", () => {
    const doc = newEmailDocument("harbor-pine");
    const bad = structuredClone(doc);
    bad.modules[0].type = "carousel";
    const r = validateDocument(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].message).toMatch(/Unknown module type/);
  });

  it("rejects duplicate module ids", () => {
    const doc = newEmailDocument("harbor-pine");
    doc.modules[1].id = doc.modules[0].id;
    expect(validateDocument(doc).ok).toBe(false);
  });

  it("round-trips through JSON without changing order or ids", () => {
    const doc = sampleEmailDocument("lumen-labs");
    const again = validateDocument(JSON.parse(JSON.stringify(doc)));
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.doc.modules.map((m) => m.id)).toEqual(doc.modules.map((m) => m.id));
      expect(again.doc).toEqual(doc);
    }
  });

  it("flags placeholders, missing images and missing links", () => {
    const doc = sampleEmailDocument("harbor-pine");
    const msgs = findContentIssues(doc).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/Headline & body: Body contains a placeholder/);
    expect(msgs).toMatch(/CTA button: Button link is missing/);
    expect(msgs).toMatch(/Footer: Footer text contains a placeholder/);
  });
});

describe("operations (AI edits)", () => {
  const base = () => sampleEmailDocument("harbor-pine");

  it("moves a module without changing any content or ids", () => {
    const doc = base();
    const cta = doc.modules.find((m) => m.type === "cta")!;
    const heroIndex = doc.modules.findIndex((m) => m.type === "hero");
    const r = applyOperations(doc, [{ op: "move_module", moduleId: cta.id, toIndex: heroIndex }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.modules[heroIndex].id).toBe(cta.id);
    expect([...r.doc.modules].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...doc.modules].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it("patches only the named setting and leaves other fields untouched", () => {
    const doc = base();
    const text = doc.modules.find((m) => m.type === "text")!;
    const r = applyOperations(doc, [{ op: "update_module", moduleId: text.id, content: null, settings: { padding: { top: 8, bottom: 8 } } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = r.doc.modules.find((m) => m.id === text.id)!;
    expect(after.settings.padding).toEqual({ ...(text.settings.padding as object), top: 8, bottom: 8 });
    expect(after.content).toEqual(text.content);
    for (const m of r.doc.modules.filter((x) => x.id !== text.id)) expect(m).toEqual(doc.modules.find((x) => x.id === m.id));
  });

  it("is atomic: one bad operation rejects the whole batch", () => {
    const doc = base();
    const text = doc.modules.find((m) => m.type === "text")!;
    const ops: Operation[] = [
      { op: "set_subject", subject: "Changed" },
      { op: "update_module", moduleId: text.id, content: { headline: "New" }, settings: null },
      { op: "update_module", moduleId: "m_doesnotexist", content: { headline: "x" }, settings: null },
    ];
    const r = applyOperations(doc, ops);
    expect(r.ok).toBe(false);
    expect(doc.subject).toBe("[Sample] Join the quarterly town hall");
    expect(text.content.headline).toBe("Quarterly town hall");
  });

  it("rejects unsupported module types", () => {
    const r = applyOperations(base(), [{ op: "add_module", moduleType: "video", index: null, ref: null, content: null, settings: null }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/not available/);
  });

  it("rejects unknown fields, invalid values, and attempts to set image sources", () => {
    const doc = base();
    const hero = doc.modules.find((m) => m.type === "hero")!;
    const text = doc.modules.find((m) => m.type === "text")!;
    const cta = doc.modules.find((m) => m.type === "cta")!;
    const cases: Operation[] = [
      { op: "update_module", moduleId: text.id, content: { html: "<b>x</b>" }, settings: null },
      { op: "update_module", moduleId: text.id, content: null, settings: { headlineColor: "red" } },
      { op: "update_module", moduleId: text.id, content: null, settings: { padding: { top: 9999 } } },
      { op: "update_module", moduleId: hero.id, content: { image: { src: { kind: "asset", assetId: "someone-elses" } } }, settings: null },
      { op: "update_module", moduleId: cta.id, content: { url: "javascript:alert(1)" }, settings: null },
    ];
    for (const op of cases) expect(applyOperations(doc, [op]).ok, JSON.stringify(op)).toBe(false);
  });

  it("supports refs so a new module can be updated/moved in the same batch", () => {
    const doc = newEmailDocument("lumen-labs");
    const r = applyOperations(
      doc,
      [
        { op: "add_module", moduleType: "cta", index: null, ref: "new-cta", content: { label: "Register" }, settings: null },
        { op: "move_module", moduleId: "new-cta", toIndex: 1 },
      ],
      ids,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.modules[1].type).toBe("cta");
  });
});

describe("pasted rich text", () => {
  it("flattens unsupported structure and drops unsafe marks", async () => {
    const { sanitizeRichTextInput, renderRichText } = await import("./richtext");
    const pasted = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Big title", marks: [{ type: "textStyle", attrs: { color: "red" } }] }] },
        { type: "paragraph", content: [{ type: "text", text: "bad link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "cell" }] }] }] }] },
        { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one", marks: [{ type: "bold" }, { type: "underline" }] }] }] }] },
        { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
      ],
    };
    const clean = sanitizeRichTextInput(pasted);
    expect(clean.content.map((b) => b.type)).toEqual(["paragraph", "paragraph", "paragraph", "bulletList", "paragraph"]);
    const html = renderRichText(clean, { fontFamily: "Arial", fontSize: 14, lineHeight: 20, color: "#000000", linkColor: "#0000ff", paragraphGap: 10, align: "left" });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("color:red");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("cell");
  });
});
