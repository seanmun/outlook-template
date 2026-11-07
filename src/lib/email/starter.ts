import { requireBrand } from "./brands";
import { newModuleId, SCHEMA_VERSION, type EmailDocument } from "./document";
import { createModuleInstance } from "./registry";
import { plainParagraphs } from "./richtext";
import { SAMPLE_HERO_BY_BRAND, getSampleImage } from "./samples";

/** A minimal manual starting point: header, one text block, footer. */
export function newEmailDocument(brandId: string, title = "Untitled email"): EmailDocument {
  const brand = requireBrand(brandId);
  return {
    schemaVersion: SCHEMA_VERSION,
    brandId,
    title,
    subject: "",
    modules: ["header", "text", "footer"].map((t) => createModuleInstance(t, brand, newModuleId())),
  };
}

/**
 * Demo content for the fictional sample brands. Clearly placeholder copy;
 * uses the bundled sample gradient image.
 */
export function sampleEmailDocument(brandId: string): EmailDocument {
  const brand = requireBrand(brandId);
  const doc = newEmailDocument(brandId, "Sample: quarterly town hall");
  doc.subject = "[Sample] Join the quarterly town hall";
  const hero = createModuleInstance("hero", brand, newModuleId());
  const sampleId = SAMPLE_HERO_BY_BRAND[brandId];
  const sample = sampleId ? getSampleImage(sampleId) : undefined;
  if (sample) {
    hero.content = {
      image: {
        src: { kind: "sample", sampleId: sample.id },
        alt: "Decorative sample banner",
        width: 600,
        naturalWidth: sample.width,
        naturalHeight: sample.height,
        linkUrl: "",
      },
    };
  }
  const text = doc.modules[1];
  text.content = {
    headline: "Quarterly town hall",
    body: plainParagraphs(
      "This is sample copy for a fictional brand. Replace it with your announcement.",
      "Date, time and location: [[PLACEHOLDER: event details]]",
    ),
  };
  const cta = createModuleInstance("cta", brand, newModuleId());
  cta.content = { label: "Add to calendar", url: "" };
  doc.modules.splice(1, 0, hero);
  doc.modules.splice(3, 0, cta);
  return doc;
}
