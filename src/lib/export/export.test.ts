import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import MsgReader from "@kenjiuno/msgreader";
import JSZip from "jszip";
import { compareCfbNames, writeCfb } from "./cfb-writer";
import { CLSID_OFT_TEMPLATE, writeMsg } from "./msg-writer";
import { htmlToEncapsulatedRtf, rtfStream } from "./rtf-body";
import { encodeHeaderValue, writeMime } from "./mime-writer";
import { buildExportPackage, MissingImageError, prepareExportInput, sniffImageType, type ImageLoader } from "./pipeline";
import { emltplExporter } from "./exporters";
import { ExporterUnavailableError } from "./types";
import { sampleEmailDocument, newEmailDocument } from "@/lib/email/starter";
import { sampleBytes } from "@/lib/email/samples";

const sampleLoader: ImageLoader = async (src) => {
  if (src.kind !== "sample") return null;
  const data = sampleBytes(src.sampleId);
  return data ? { data } : null;
};

function pngBytes(size: number): Uint8Array {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < size; i++) b[i] = i % 251;
  return b;
}

describe("CFB writer", () => {
  it("sorts names by MS-CFB rules (length first, case-insensitive)", () => {
    expect(compareCfbNames("ab", "abc")).toBeLessThan(0);
    expect(compareCfbNames("ABC", "abd")).toBeLessThan(0);
    expect(compareCfbNames("abc", "ABC")).toBe(0);
  });

  it("produces a file a third-party CFB parser reads back byte-for-byte", () => {
    const big = pngBytes(10_000);
    const small = new Uint8Array([1, 2, 3]);
    const children = Array.from({ length: 40 }, (_, i) => ({ type: "stream" as const, name: `s${i}`, data: new Uint8Array([i]) }));
    const out = writeCfb({
      type: "storage",
      name: "Root Entry",
      clsid: CLSID_OFT_TEMPLATE,
      children: [
        { type: "stream", name: "big", data: big },
        { type: "stream", name: "small", data: small },
        { type: "stream", name: "empty", data: new Uint8Array(0) },
        { type: "storage", name: "sub", children },
      ],
    });
    const parsed = CFB.read(out, { type: "array" });
    expect(Buffer.from(CFB.find(parsed, "big")!.content as Uint8Array)).toEqual(Buffer.from(big));
    expect(Buffer.from(CFB.find(parsed, "small")!.content as Uint8Array)).toEqual(Buffer.from(small));
    const s39 = parsed.FullPaths.findIndex((p) => p.endsWith("/sub/s39"));
    expect(Buffer.from(parsed.FileIndex[s39].content as Uint8Array)).toEqual(Buffer.from([39]));
    // {0006F046-0000-0000-C000-000000000046} in on-disk GUID byte order
    expect(parsed.FileIndex[0].clsid.toUpperCase()).toBe("46F0060000000000C000000000000046");
  });

  it("rejects duplicate names and names that are too long", () => {
    expect(() =>
      writeCfb({ type: "storage", name: "Root Entry", children: [{ type: "stream", name: "A", data: new Uint8Array(1) }, { type: "stream", name: "a", data: new Uint8Array(1) }] }),
    ).toThrow(/Duplicate/);
    expect(() => writeCfb({ type: "storage", name: "Root Entry", children: [{ type: "stream", name: "x".repeat(32), data: new Uint8Array(1) }] })).toThrow(/length/);
  });
});

describe("OFT (MS-OXMSG) writer", () => {
  it("is read back by an independent MSG parser with subject, HTML and inline images", () => {
    const html = '<html><body><p>Hello ünïcødé ✓</p><img src="cid:img1@test"></body></html>';
    const out = writeMsg({
      subject: "Town hall – ünïcødé ✓",
      html,
      plainText: "Hello ünïcødé ✓",
      images: [
        { contentId: "img1@test", filename: "hero.png", mimeType: "image/png", data: pngBytes(9000) },
        { contentId: "img2@test", filename: "logo.png", mimeType: "image/png", data: pngBytes(200) },
      ],
    });
    const reader = new MsgReader(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
    const data = reader.getFileData();
    expect(data.error).toBeUndefined();
    expect(data.subject).toBe("Town hall – ünïcødé ✓");
    expect(data.messageClass).toBe("IPM.Note");
    expect(data.body).toBe("Hello ünïcødé ✓");
    expect(new TextDecoder().decode(data.html as Uint8Array)).toBe(html);
    expect(data.attachments).toHaveLength(2);
    expect(data.attachments![0].pidContentId).toBe("img1@test");
    expect(data.attachments![0].attachmentHidden).toBe(true);
    const att = reader.getAttachment(0);
    expect(att.content.length).toBe(9000);

    const cfb = CFB.read(out, { type: "array" });
    expect(cfb.FileIndex[0].clsid.toUpperCase()).toBe("46F0060000000000C000000000000046");
  });
});

describe("RTF-wrapped body (experimental)", () => {
  const html = '<html>\n<body style="margin:0">\n<!--[if mso]><v:roundrect arcsize="18%"></v:roundrect><![endif]-->\n<p>Café {braces} \\ back\tslash ✓</p>\n\n</body></html>';

  /** What a reader does: take the text of each \htmltag group, undo the escapes, and turn \par into a line break. */
  function deEncapsulate(rtf: string): string {
    const start = rtf.indexOf("{\\*\\htmltag");
    return rtf
      .slice(start, -1)
      .split("\r\n")
      .map((group) => (group === "" ? "" : group.replace(/^\{\\\*\\htmltag0 /, "").replace(/\}$/, "")))
      .map((t) => (t === "\\par " ? "\n" : t))
      .join("")
      .replace(/\\u(-?\d+)\?/g, (_, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 0x10000 : Number(n)))
      .replace(/\\tab /g, "\t")
      .replace(/\\([\\{}])/g, "$1");
  }

  it("wraps HTML so that unwrapping gives the same HTML back", () => {
    const rtf = htmlToEncapsulatedRtf(html);
    expect(rtf.startsWith("{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 ")).toBe(true);
    expect(/^[\x00-\x7f]*$/.test(rtf)).toBe(true);
    expect(deEncapsulate(rtf)).toBe(html);
  });

  it("writes the uncompressed RTF container", () => {
    const stream = rtfStream("{\\rtf1 hi}");
    const view = new DataView(stream.buffer);
    expect(view.getUint32(0, true)).toBe(10 + 12);
    expect(view.getUint32(4, true)).toBe(10);
    expect(new TextDecoder().decode(stream.subarray(8, 12))).toBe("MELA");
    expect(view.getUint32(12, true)).toBe(0);
    expect(new TextDecoder().decode(stream.subarray(16))).toBe("{\\rtf1 hi}");
  });

  it("stores the RTF body in place of the HTML property when asked", () => {
    const out = writeMsg({ subject: "S", html, plainText: "p", images: [], body: "rtf" });
    const names = CFB.read(out, { type: "array" }).FullPaths.join("|");
    expect(names).toContain("__substg1.0_10090102");
    expect(names).not.toContain("__substg1.0_10130102");
    const plain = CFB.read(writeMsg({ subject: "S", html, plainText: "p", images: [] }), { type: "array" }).FullPaths.join("|");
    expect(plain).toContain("__substg1.0_10130102");
    expect(plain).not.toContain("__substg1.0_10090102");
  });
});

describe("MIME writer (EMLTPL experimental)", () => {
  it("writes an unsent multipart message with related inline images", () => {
    const mime = writeMime({
      subject: "Hello ✓",
      html: "<p>Hi</p>",
      plainText: "Hi",
      images: [{ contentId: "a@b", filename: "a.png", mimeType: "image/png", data: pngBytes(100) }],
      extraHeaders: { "X-Unsent": "1" },
      boundarySeed: "seed",
    });
    expect(mime.startsWith("X-Unsent: 1\r\n")).toBe(true);
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="----=_Alt_seed"');
    expect(mime).toContain('Content-Type: multipart/related; type="text/html"; boundary="----=_Rel_seed"');
    expect(mime).toContain("Content-ID: <a@b>");
    expect(mime.trimEnd().endsWith("------=_Alt_seed--")).toBe(true);
    // every line within RFC 5322's 998 limit, and CRLF only
    for (const line of mime.split("\r\n")) expect(line.length).toBeLessThanOrEqual(998);
    expect(mime.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("rejects header injection", () => {
    expect(() => writeMime({ subject: "x", html: "", plainText: "", images: [], extraHeaders: { "X-A": "1\r\nBcc: evil@example.com" } })).toThrow();
    expect(encodeHeaderValue("a\r\nBcc: x")).not.toMatch(/[\r\n]Bcc/);
  });

  it("is disabled unless explicitly enabled, with a reason", () => {
    delete process.env.EXPORT_EMLTPL_EXPERIMENTAL;
    const a = emltplExporter.availability();
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/Mac-created sample/);
  });
});

describe("export pipeline", () => {
  it("embeds images by Content-ID and never leaks preview annotations", async () => {
    const input = await prepareExportInput(sampleEmailDocument("harbor-pine"), sampleLoader);
    expect(input.images).toHaveLength(1);
    expect(input.htmlCid).toContain(`src="cid:${input.images[0].contentId}"`);
    expect(input.htmlCid).not.toContain("data-module-id");
    expect(input.htmlCid).not.toContain("data:image");
    expect(input.htmlFiles).toContain('src="images/image-1.png"');
  });

  it("builds a ZIP with the OFT and a README stating verification status", async () => {
    const pkg = await buildExportPackage({ doc: sampleEmailDocument("lumen-labs"), formats: ["oft"], loadImage: sampleLoader });
    const zip = await JSZip.loadAsync(pkg.zip);
    const names = Object.keys(zip.files);
    expect(names).toContain("sample-quarterly-town-hall.oft");
    expect(names).toContain("README.txt");
    const readme = await zip.file("README.txt")!.async("string");
    expect(readme).toMatch(/Outlook manual verification=not-verified/);
    expect(readme).toMatch(/UNRESOLVED ITEMS/);
    expect(pkg.issues.length).toBeGreaterThan(0);
  });

  it("puts the HTML fallback in a clearly labelled folder", async () => {
    const pkg = await buildExportPackage({ doc: sampleEmailDocument("copperfield"), formats: ["html"], loadImage: sampleLoader });
    const zip = await JSZip.loadAsync(pkg.zip);
    expect(Object.keys(zip.files).some((n) => n.startsWith("development-html/"))).toBe(true);
    expect(await zip.file("README.txt")!.async("string")).toMatch(/DEVELOPMENT FALLBACK/);
  });

  it("refuses a disabled exporter", async () => {
    delete process.env.EXPORT_EMLTPL_EXPERIMENTAL;
    await expect(buildExportPackage({ doc: newEmailDocument("harbor-pine"), formats: ["oft", "emltpl"], loadImage: sampleLoader })).rejects.toBeInstanceOf(
      ExporterUnavailableError,
    );
  });

  it("refuses unknown formats and empty format lists", async () => {
    await expect(
      buildExportPackage({ doc: newEmailDocument("harbor-pine"), formats: ["pdf" as never], loadImage: sampleLoader }),
    ).rejects.toBeInstanceOf(ExporterUnavailableError);
    await expect(buildExportPackage({ doc: newEmailDocument("harbor-pine"), formats: [], loadImage: sampleLoader })).rejects.toThrow();
  });

  it("fails when an image cannot be loaded (e.g. not owned by the user)", async () => {
    const doc = sampleEmailDocument("harbor-pine");
    const hero = doc.modules.find((m) => m.type === "hero")!;
    (hero.content.image as { src: unknown }).src = { kind: "asset", assetId: "not-mine" };
    await expect(buildExportPackage({ doc, formats: ["oft"], loadImage: async () => null })).rejects.toBeInstanceOf(MissingImageError);
  });

  it("rejects non-image bytes posing as images", async () => {
    const doc = sampleEmailDocument("harbor-pine");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    await expect(prepareExportInput(doc, async () => ({ data: new TextEncoder().encode("<html>") }))).rejects.toThrow(/not a PNG/);
  });

  it("rejects invalid documents before exporting", async () => {
    const doc = newEmailDocument("harbor-pine");
    doc.modules[0].type = "nope";
    await expect(prepareExportInput(doc, sampleLoader)).rejects.toThrow(/Invalid email document/);
  });
});
