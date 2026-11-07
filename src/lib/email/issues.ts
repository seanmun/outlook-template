/**
 * Unresolved-content detection. These are warnings shown in the editor and
 * before export; they do not block export (the user decides).
 */
import type { EmailDocument } from "./document";
import type { ImageValue } from "./fields";
import { getModule } from "./registry";
import { richTextAllText, type RichText } from "./richtext";

export interface ContentIssue {
  moduleId: string | null;
  field: string;
  severity: "warning" | "error";
  message: string;
}

const PLACEHOLDER_RE = /\[\[[^\]]*\]\]|\bTBD\b|\bTODO\b|lorem ipsum/i;

export function findContentIssues(doc: EmailDocument): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (!doc.subject.trim()) issues.push({ moduleId: null, field: "subject", severity: "warning", message: "Subject is empty." });
  else if (PLACEHOLDER_RE.test(doc.subject)) issues.push({ moduleId: null, field: "subject", severity: "warning", message: "Subject contains a placeholder." });
  if (doc.modules.length === 0) issues.push({ moduleId: null, field: "modules", severity: "error", message: "The email has no modules." });

  for (const m of doc.modules) {
    const def = getModule(m.type);
    if (!def) continue;
    const content = m.content as Record<string, unknown>;
    for (const f of def.contentFields) {
      const v = content[f.key];
      const label = `${def.name}: ${f.label}`;
      if (f.kind === "text" && typeof v === "string" && PLACEHOLDER_RE.test(v)) {
        issues.push({ moduleId: m.id, field: f.key, severity: "warning", message: `${label} contains a placeholder.` });
      }
      if (f.kind === "richtext" && v && PLACEHOLDER_RE.test(richTextAllText(v as RichText))) {
        issues.push({ moduleId: m.id, field: f.key, severity: "warning", message: `${label} contains a placeholder.` });
      }
      if (f.kind === "url" && v === "" && (m.type === "cta")) {
        issues.push({ moduleId: m.id, field: f.key, severity: "warning", message: `${label} is missing; the button will not go anywhere.` });
      }
      if (f.kind === "image") {
        const img = v as ImageValue;
        const optional = m.type === "header"; // header falls back to wordmark
        if (!img.src && !optional) issues.push({ moduleId: m.id, field: f.key, severity: "warning", message: `${label} has not been uploaded.` });
        if (img.src && !img.alt.trim()) issues.push({ moduleId: m.id, field: f.key, severity: "warning", message: `${label} has no alt text.` });
      }
    }
  }
  return issues;
}
