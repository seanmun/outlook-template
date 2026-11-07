/**
 * Builds what the model sees: the selected brand's settings and module
 * definitions (field specs, constraints, defaults) and a compact view of the
 * current document. Module HTML is never sent.
 */
import type { Brand } from "@/lib/email/brands";
import type { EmailDocument } from "@/lib/email/document";
import type { ImageValue } from "@/lib/email/fields";
import { getModule, modulesForBrand } from "@/lib/email/registry";
import { richTextToLite, type RichText } from "@/lib/email/richtext";

export function moduleCatalog(brand: Brand) {
  return modulesForBrand(brand).map((def) => {
    const defaults = def.defaults(brand);
    return {
      type: def.type,
      name: def.name,
      description: def.description,
      guidance: def.aiGuidance ?? "",
      contentFields: def.contentFields.map((f) => {
        switch (f.kind) {
          case "text":
            return { key: f.key, kind: "plain text", maxLength: f.maxLength };
          case "richtext":
            return { key: f.key, kind: "rich text string (markdown-lite)" };
          case "url":
            return { key: f.key, kind: "absolute https:// or mailto: URL, or empty string if unknown" };
          case "image":
            return { key: f.key, kind: "image", editable: ["alt", "width", ...(f.allowLink ? ["linkUrl"] : [])], maxWidth: f.maxWidth };
        }
      }),
      settingFields: def.settingFields.map((f) => {
        switch (f.kind) {
          case "color":
            return { key: f.key, kind: "#rrggbb colour (prefer brand palette)" };
          case "align":
            return { key: f.key, kind: "one of left | center | right" };
          case "padding":
            return { key: f.key, kind: "object {top,right,bottom,left} integers 0-120 px; partial objects allowed" };
          case "number":
            return { key: f.key, kind: `integer ${f.min}-${f.max}${f.unit ? ` ${f.unit}` : ""}` };
          case "select":
            return { key: f.key, kind: `one of ${f.options.map((o) => o.value).join(" | ")}` };
        }
      }),
      defaultSettings: defaults.settings,
    };
  });
}

export function documentView(doc: EmailDocument) {
  return {
    subject: doc.subject,
    modules: doc.modules.map((m, index) => {
      const def = getModule(m.type);
      const content: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(m.content)) {
        const f = def?.contentFields.find((x) => x.key === k);
        if (f?.kind === "richtext") content[k] = richTextToLite(v as RichText);
        else if (f?.kind === "image") {
          const img = v as ImageValue;
          content[k] = { hasImage: !!img.src, alt: img.alt, width: img.width, ...(img.linkUrl !== undefined ? { linkUrl: img.linkUrl } : {}) };
        } else content[k] = v;
      }
      return { index, id: m.id, type: m.type, content, settings: m.settings };
    }),
  };
}

export function systemPrompt(brand: Brand): string {
  return `You assemble internal emails for "${brand.name}" from a fixed catalogue of modules. You cannot write HTML or invent new module types: you output a list of operations that the app validates and applies atomically.

Brand
- Voice: ${brand.voice}
- Palette: ${brand.palette.map((p) => `${p.label} ${p.value}`).join(", ")}
- Headline sizes in use: ${brand.headlineSizes.join(", ")} px
${brand.isSample ? "- This is a FICTIONAL sample brand. Do not reference real companies.\n" : ""}
Module catalogue (the only modules you may use):
${JSON.stringify(moduleCatalog(brand), null, 1)}

Operations
- add_module: moduleType (from the catalogue), index (insert position at that moment, null = end), ref (a short handle like "new-cta" so later operations can reference it via moduleId), contentJson / settingsJson: JSON object strings with only the fields you want to differ from defaults, or null.
- update_module: moduleId, contentJson and/or settingsJson containing ONLY the fields to change. Omit everything you are not changing.
- move_module: moduleId, toIndex (final position).
- remove_module: moduleId.
- set_subject: subject.
Unused fields in an operation must be null.

Rich text strings use markdown-lite: blank line between paragraphs, **bold**, *italic*, [label](https://url), lines starting with "- " form a bullet list.

Rules
- Make the smallest set of operations that satisfies the request. Never rewrite modules or fields the user did not ask about; untouched content must stay exactly as it is.
- Refer to existing modules by their id. Never change ids.
- Do not invent facts, dates, names, figures, approved claims, or final URLs. Use [[PLACEHOLDER: what is needed]] in text for anything the user has not given you, and leave URL fields as "".
- You cannot add or choose images. New image fields stay empty for the user to upload. You may set alt text that describes the intended image.
- Colours must be #rrggbb, preferably from the brand palette.
- "Reduce padding" etc. means adjusting the module's padding or spacing settings by a sensible amount (e.g. 25-50%), not removing it, unless asked.
- If the request cannot be done with the available modules and settings, return no operations and explain in summary.
- summary: one or two sentences, past tense, describing what changed. unresolved: list placeholders or decisions the user still needs to make.`;
}

export function userMessage(opts: {
  doc: EmailDocument;
  instruction: string;
  history: { role: "user" | "assistant"; text: string }[];
}): string {
  const hist = opts.history.slice(-8).map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`).join("\n");
  return `${hist ? `Earlier in this session:\n${hist}\n\n` : ""}Current email (JSON):
${JSON.stringify(documentView(opts.doc), null, 1)}

Request:
${opts.instruction}`;
}
