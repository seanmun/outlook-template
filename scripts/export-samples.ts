/**
 * Writes sample export files for manual Outlook testing to ./export-samples/.
 *
 *   pnpm export:samples
 *
 * Produces, per fictional brand: an .oft, the development .html, and (always,
 * for testing only) an UNVERIFIED experimental .emltpl. Includes a long-copy
 * stress variant. See docs/OUTLOOK-TEST-CHECKLIST.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BRANDS } from "../src/lib/email/brands";
import { sampleEmailDocument } from "../src/lib/email/starter";
import { liteToRichText } from "../src/lib/email/richtext";
import { sampleBytes } from "../src/lib/email/samples";
import { emltplExporter, htmlExporter, oftExporter } from "../src/lib/export/exporters";
import { prepareExportInput, type ImageLoader } from "../src/lib/export/pipeline";

const out = path.resolve("export-samples");
mkdirSync(out, { recursive: true });

const loader: ImageLoader = async (src) => (src.kind === "sample" ? { data: sampleBytes(src.sampleId)! } : null);

const LONG = Array.from({ length: 8 }, (_, i) =>
  `Paragraph ${i + 1}. This is deliberately long sample copy used to test wrapping, line height and paragraph spacing in Outlook. It contains **bold text**, *italic text* and a [sample link](https://example.com/page-${i + 1}). Accented characters: café, naïve, Zürich, São Paulo. Symbols: € £ © ™ – —.`,
).join("\n\n") + "\n\n- First bullet point\n- Second bullet point with more words so it wraps onto a second line in narrow windows\n- Third bullet";

async function main() {
  for (const brand of BRANDS) {
    const variants = [
      { suffix: "", doc: sampleEmailDocument(brand.id) },
      {
        suffix: "-long-copy",
        doc: (() => {
          const d = sampleEmailDocument(brand.id);
          d.title = `${d.title} (long copy)`;
          const text = d.modules.find((m) => m.type === "text")!;
          text.content = { headline: "A much longer headline that should wrap across two lines in most clients", body: liteToRichText(LONG) };
          const cta = d.modules.find((m) => m.type === "cta")!;
          cta.content = { label: "View the full schedule", url: "https://example.com/schedule" };
          return d;
        })(),
      },
    ];
    for (const v of variants) {
      const input = await prepareExportInput(v.doc, loader);
      const base = `${brand.id}${v.suffix}`;
      const named = { ...input, baseFilename: base };
      for (const f of await oftExporter.export(named)) writeFileSync(path.join(out, f.filename), f.data);
      for (const f of await emltplExporter.export(named)) writeFileSync(path.join(out, f.filename.replace(".emltpl", ".UNVERIFIED.emltpl")), f.data);
      const html = await htmlExporter.export(named);
      mkdirSync(path.join(out, `${base}-html/images`), { recursive: true });
      for (const f of html) writeFileSync(path.join(out, `${base}-html`, f.filename), f.data);
      console.log(`wrote ${base}.oft, ${base}.UNVERIFIED.emltpl, ${base}-html/`);
    }
  }
}
main();
