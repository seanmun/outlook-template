/**
 * Templates: emails to start a new email from. Everyone begins with the starter templates below
 * (our example emails); people can remove those and save their own.
 */
import type { EmailDocument } from "./document";
import { EXAMPLES } from "./examples";
import { PERSONAL_LIMITS } from "@/lib/limits";

/** How many templates of their own a person can keep in their own Library. Starter templates do not count. Team spaces: see lib/limits. */
export const MAX_TEMPLATES = PERSONAL_LIMITS.templates;

export interface Template {
  id: string;
  name: string;
  document: EmailDocument;
  savedAt: string;
  /** One of the starter templates everyone gets, as opposed to one the person saved. */
  isDefault: boolean;
}

const DEFAULT_PREFIX = "default-";
export const DEFAULT_TEMPLATE_IDS: string[] = EXAMPLES.map((e) => DEFAULT_PREFIX + e.id);

/** The starter templates, built fresh so nobody can change the originals. */
export function defaultTemplates(): Template[] {
  return EXAMPLES.map((e) => ({ id: DEFAULT_PREFIX + e.id, name: e.name, document: e.build(), savedAt: "", isDefault: true }));
}

/** What a person sees: their own templates first (newest first), then the starter templates they have not removed. */
export function visibleTemplates(own: Omit<Template, "isDefault">[], hiddenDefaults: string[]): Template[] {
  return [...own.map((t) => ({ ...t, isDefault: false })), ...defaultTemplates().filter((t) => !hiddenDefaults.includes(t.id))];
}

/** A new email started from a template: the same content under a fresh working title. */
export function emailFromTemplate(template: Pick<Template, "name" | "document">): EmailDocument {
  return { ...structuredClone(template.document), title: template.name };
}
