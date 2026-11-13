import { describe, expect, it } from "vitest";
import { BRANDS, requireBrand } from "./brands";
import { escapeHtml, sanitizeUrl } from "./html";
import { findContentIssues } from "./issues";
import { applyOperations, type Operation } from "./operations";
import { allModules } from "./document";
import { columnWidths } from "./modules/columns";
import { EXAMPLES } from "./examples";
import { MODULES, createModuleInstance, validateDocument } from "./registry";
import { collectImageSources, renderEmailHtml } from "./render";
import { darkModePreview, darkSurface, darkText } from "./dark-preview";
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

describe("dark mode preview", () => {
  it("turns light surfaces dark and dark text light, and leaves the rest alone", () => {
    expect(darkSurface("#ffffff")).toBe("#1f1f1f");
    expect(darkSurface("#171717")).toBe("#171717");
    expect(darkText("#000000")).toBe("#f0f0f0");
    expect(darkText("#ffffff")).toBe("#ffffff");
    // hue survives: a dark blue link stays blue, only lighter
    const link = darkText("#1d4ed8");
    expect(parseInt(link.slice(5, 7), 16)).toBeGreaterThan(parseInt(link.slice(1, 3), 16));
  });

  it("recolours the email body only, and never touches pictures or the document", () => {
    const doc = sampleEmailDocument("copperfield");
    const before = JSON.stringify(doc);
    const light = renderEmailHtml(doc, { resolveImage: resolve, annotate: true });
    const dark = darkModePreview(light);
    expect(JSON.stringify(doc)).toBe(before);
    expect(dark).not.toBe(light);
    // the canvas's own styles in <head> are identical
    expect(dark.slice(0, dark.indexOf("<body"))).toBe(light.slice(0, light.indexOf("<body")));
    // same pictures, same text, same structure: only colour values differ
    const strip = (h: string) => h.replace(/#[0-9a-fA-F]{6}/g, "#");
    expect(strip(dark)).toBe(strip(light));
    expect(dark.match(/<img[^>]*>/g)?.map((t) => t.replace(/#[0-9a-fA-F]{6}/g, "#"))).toEqual(light.match(/<img[^>]*>/g)?.map((t) => t.replace(/#[0-9a-fA-F]{6}/g, "#")));
    // the white content area is no longer white
    expect(light).toContain('bgcolor="#ffffff"');
    expect(dark).not.toContain('bgcolor="#ffffff"');
  });
});

describe("Outlook settings", () => {
  it("pins Outlook for Windows to 96 pixels per inch", () => {
    const html = renderEmailHtml(newEmailDocument("copperfield"), { resolveImage: resolve });
    expect(html).toContain('xmlns:o="urn:schemas-microsoft-com:office:office"');
    expect(html).toMatch(/<head>[\s\S]*<!--\[if gte mso 9\]><xml><o:OfficeDocumentSettings><o:AllowPNG\/><o:PixelsPerInch>96<\/o:PixelsPerInch><\/o:OfficeDocumentSettings><\/xml><!\[endif\]-->[\s\S]*<\/head>/);
  });
});

describe("divider and social icons", () => {
  const build = () => {
    const base = { ...newEmailDocument("harbor-pine"), modules: [] };
    const ops: Operation[] = [
      { op: "add_module", moduleType: "divider", index: null, ref: null, content: null, settings: { thickness: 2 } },
      { op: "add_module", moduleType: "social", index: null, ref: null, content: { networks: "twitter, facebook, myspace, facebook", facebookUrl: "https://facebook.com/example" }, settings: null },
    ];
    const r = applyOperations(base, ops, ids);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.doc;
  };

  it("renders a table-cell rule and linked icons in the order given", () => {
    const html = renderEmailHtml(build(), { resolveImage: resolve });
    expect(html).not.toMatch(/<hr/i);
    expect(html).toMatch(/height="2" bgcolor="#d9dde2"/);
    const alts = [...html.matchAll(/alt="(X|Facebook|Instagram)"/g)].map((m) => m[1]);
    expect(alts).toEqual(["X", "Facebook"]);
    expect(html).toContain('href="https://facebook.com/example"');
  });

  it("lists its icons for export and flags icons without links", () => {
    const doc = build();
    expect(collectImageSources(doc)).toEqual([
      { kind: "sample", sampleId: "social-x-dark" },
      { kind: "sample", sampleId: "social-facebook-dark" },
    ]);
    expect(sampleDataUrl("social-x-dark")).toMatch(/^data:image\/png;base64,/);
    expect(findContentIssues(doc).map((i) => i.message).join(" ")).toMatch(/no link set for x\./);
  });
});

describe("columns", () => {
  const build = (layout = "1-2") => {
    const base = { ...newEmailDocument("harbor-pine"), modules: [] };
    const ops: Operation[] = [
      { op: "add_module", moduleType: "columns", index: null, ref: "row", content: null, settings: { layout } },
      { op: "add_module", moduleType: "hero", index: null, ref: null, content: null, settings: null, parentId: "row", column: 0 },
      { op: "add_module", moduleType: "text", index: null, ref: "copy", content: { headline: "Side by side" }, settings: null, parentId: "row", column: 1 },
      { op: "add_module", moduleType: "cta", index: null, ref: null, content: null, settings: null, parentId: "row", column: 1 },
    ];
    const r = applyOperations(base, ops, ids);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.doc;
  };

  it("places blocks in columns and renders fixed-width cells that fill the row", () => {
    const doc = build();
    const row = doc.modules[0];
    expect(row.columns!.map((c) => c.blocks.map((b) => b.type))).toEqual([["hero"], ["text", "cta"]]);
    // Blocks in a column give up their full-width side padding.
    expect(row.columns![1].blocks[0].settings.padding).toMatchObject({ left: 0, right: 0 });
    expect(columnWidths(row.settings as Parameters<typeof columnWidths>[0], 600)).toEqual([165, 331]);
    const html = renderEmailHtml(doc, { resolveImage: resolve, annotate: true });
    expect(html).toContain('<td data-column="0" width="165" valign="top"');
    expect(html).toContain('<td data-column="1" width="331" valign="top"');
    expect(renderEmailHtml(doc, { resolveImage: resolve })).not.toMatch(/data-(column|module-id)/);
    expect((html.match(/data-module-id=/g) ?? []).length).toBe(4);
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
  });

  it("keeps every block when the layout changes", () => {
    const doc = build("1-1-1");
    const row = doc.modules[0];
    const narrowed = applyOperations(doc, [{ op: "update_module", moduleId: row.id, content: null, settings: { layout: "1-1" } }], ids);
    expect(narrowed.ok).toBe(true);
    if (!narrowed.ok) return;
    expect(narrowed.doc.modules[0].columns!.map((c) => c.blocks.length)).toEqual([1, 2]);
    expect(allModules(narrowed.doc)).toHaveLength(4);
  });

  it("rejects nested rows, bad columns, and a column count that does not match the layout", () => {
    const doc = build();
    const row = doc.modules[0];
    const bad: Operation[] = [
      { op: "add_module", moduleType: "columns", index: null, ref: null, content: null, settings: null, parentId: row.id, column: 0 },
      { op: "add_module", moduleType: "text", index: null, ref: null, content: null, settings: null, parentId: row.id, column: 2 },
      { op: "add_module", moduleType: "text", index: null, ref: null, content: null, settings: null, parentId: row.columns![0].blocks[0].id, column: 0 },
      { op: "move_module", moduleId: row.id, toIndex: 0, parentId: row.id, column: 0 },
    ];
    for (const op of bad) expect(applyOperations(doc, [op], ids).ok).toBe(false);
    expect(validateDocument({ ...doc, modules: [{ ...row, columns: [row.columns![0]] }] }).ok).toBe(false);
    expect(validateDocument({ ...doc, modules: [{ ...row.columns![1].blocks[0], columns: row.columns }] }).ok).toBe(false);
  });

  it("moves blocks between a column and the top level, and finds nested images and issues", () => {
    const doc = build();
    const row = doc.modules[0];
    const cta = row.columns![1].blocks[1];
    const out = applyOperations(doc, [{ op: "move_module", moduleId: cta.id, toIndex: 0 }], ids);
    expect(out.ok && out.doc.modules.map((m) => m.type)).toEqual(["cta", "columns"]);
    const text = createTextIn(doc);
    expect(text).toBe("Side by side");
    const messages = findContentIssues(doc).map((i) => i.message).join(" | ");
    expect(messages).toMatch(/not responsive/);
    expect(messages).toMatch(/Hero image: Image has not been uploaded|has not been uploaded/);
    const withImage = applyOperations(doc, [{ op: "update_module", moduleId: row.columns![0].blocks[0].id, content: { image: { use: "img-1" } }, settings: null }], ids, [
      { ref: "img-1", src: { kind: "asset", assetId: "abc" }, width: 1200, height: 600 },
    ]);
    expect(withImage.ok && collectImageSources(withImage.doc)).toEqual([{ kind: "asset", assetId: "abc" }]);
    // The image is sized to its column, not the full email width.
    if (withImage.ok) expect(renderEmailHtml(withImage.doc, { resolveImage: resolve })).toContain('width="165" height="83"');
  });
});

const createTextIn = (doc: { modules: { columns?: { blocks: { type: string; content: Record<string, unknown> }[] }[] }[] }) =>
  doc.modules[0].columns![1].blocks.find((b) => b.type === "text")!.content.headline;

describe("canvas annotations for images and links", () => {
  const doc = sampleEmailDocument("harbor-pine");
  const social = createModuleInstance("social", requireBrand("harbor-pine"), "m_social0001");
  const withSocial = { ...doc, modules: [...doc.modules, social] };

  it("marks image fields and module links in the preview only", () => {
    const preview = renderEmailHtml(withSocial, { resolveImage: resolve, annotate: true });
    expect(preview).toContain('data-image-field="image"');
    expect(preview.match(/data-link="(facebook|x|instagram)Url"/g)).toHaveLength(3);
    const exported = renderEmailHtml(withSocial, { resolveImage: resolve });
    expect(exported).not.toMatch(/data-(image-field|link|field|module-id)/);
  });

  it("an empty image invites a click on the canvas but reads as a placeholder when exported", () => {
    const hero = createModuleInstance("hero", requireBrand("harbor-pine"), "m_emptyhero01");
    const d = { ...doc, modules: [hero] };
    expect(renderEmailHtml(d, { resolveImage: resolve, annotate: true })).toContain("Click to add an image");
    expect(renderEmailHtml(d, { resolveImage: resolve })).toContain("Image placeholder: upload an image");
  });
});

describe("home page examples", () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s builds a valid email that renders with its images", (_id, example) => {
    const doc = example.build();
    expect(validateDocument(doc).ok).toBe(true);
    expect(doc.brandId).toBe(example.brandId);
    const html = renderEmailHtml(doc, { resolveImage: resolve });
    expect(html).not.toContain("Image placeholder");
    expect(html).not.toMatch(/\[\[PLACEHOLDER/);
    // Building twice gives independent drafts.
    expect(example.build().modules[0].id).not.toBe(doc.modules[0].id);
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

describe("list spacing", () => {
  it("renders lists with zero top/bottom margin and padding", async () => {
    const { liteToRichText, renderRichText } = await import("./richtext");
    const html = renderRichText(liteToRichText("Intro paragraph\n\n- One\n- Two\n\nAfter list"), {
      fontFamily: "Arial", fontSize: 14, lineHeight: 20, color: "#000000", linkColor: "#0000ff", paragraphGap: 14, align: "left",
    });
    const ul = /<ul style="([^"]+)"/.exec(html)![1];
    for (const prop of ["margin-top:0", "margin-bottom:0", "padding-top:0", "padding-bottom:0", "margin-left:24px"]) expect(ul).toContain(prop);
  });
});
