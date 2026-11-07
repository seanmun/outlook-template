/**
 * Typed module registry and document validation.
 *
 * To add a module: create a definition in ./modules, add it to MODULES, and
 * list its type in the brands that may use it (src/lib/email/brands.ts).
 * Use `brands: [...]` to restrict it, and `renderers` for brand-specific layouts.
 */
import { z } from "zod";
import { getBrand, type Brand } from "./brands";
import { EmailDocumentSchema, type EmailDocument, type ModuleInstance } from "./document";
import { ctaModule } from "./modules/cta";
import { footerModule } from "./modules/footer";
import { headerModule } from "./modules/header";
import { heroModule } from "./modules/hero";
import { textModule } from "./modules/text";
import type { AnyModuleDefinition } from "./modules/types";

export const MODULES: AnyModuleDefinition[] = [headerModule, heroModule, textModule, ctaModule, footerModule];

export function getModule(type: string): AnyModuleDefinition | undefined {
  return MODULES.find((m) => m.type === type);
}

export function moduleSupportsBrand(def: AnyModuleDefinition, brand: Brand): boolean {
  return brand.modules.includes(def.type) && (def.brands === "all" || def.brands.includes(brand.id));
}

export function modulesForBrand(brand: Brand): AnyModuleDefinition[] {
  return brand.modules.map(getModule).filter((m): m is AnyModuleDefinition => !!m && moduleSupportsBrand(m, brand));
}

export function rendererFor(def: AnyModuleDefinition, brand: Brand) {
  return def.renderers?.[brand.id] ?? def.render;
}

export interface ValidationIssue {
  path: string;
  message: string;
  moduleId?: string;
}

export class DocumentValidationError extends Error {
  constructor(public issues: ValidationIssue[]) {
    super(`Invalid email document: ${issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.name = "DocumentValidationError";
  }
}

function zodIssues(err: z.ZodError, prefix: string, moduleId?: string): ValidationIssue[] {
  return err.issues.map((i) => ({ path: [prefix, ...i.path.map(String)].filter(Boolean).join("."), message: i.message, moduleId }));
}

/** Validates the envelope, brand, module types and every module's content/settings. Returns parsed (stripped) data. */
export function validateDocument(input: unknown): { ok: true; doc: EmailDocument } | { ok: false; issues: ValidationIssue[] } {
  const base = EmailDocumentSchema.safeParse(input);
  if (!base.success) return { ok: false, issues: zodIssues(base.error, "") };
  const doc = base.data;
  const brand = getBrand(doc.brandId);
  if (!brand) return { ok: false, issues: [{ path: "brandId", message: `Unknown brand "${doc.brandId}"` }] };

  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const modules: ModuleInstance[] = [];
  doc.modules.forEach((m, i) => {
    const prefix = `modules.${i}`;
    if (seen.has(m.id)) issues.push({ path: `${prefix}.id`, message: `Duplicate module id ${m.id}`, moduleId: m.id });
    seen.add(m.id);
    const def = getModule(m.type);
    if (!def) {
      issues.push({ path: `${prefix}.type`, message: `Unknown module type "${m.type}"`, moduleId: m.id });
      return;
    }
    if (!moduleSupportsBrand(def, brand)) {
      issues.push({ path: `${prefix}.type`, message: `Module "${m.type}" is not available for brand ${brand.id}`, moduleId: m.id });
      return;
    }
    const c = def.contentSchema.safeParse(m.content);
    const s = def.settingsSchema.safeParse(m.settings);
    if (!c.success) issues.push(...zodIssues(c.error, `${prefix}.content`, m.id));
    if (!s.success) issues.push(...zodIssues(s.error, `${prefix}.settings`, m.id));
    if (c.success && s.success) modules.push({ ...m, content: c.data as Record<string, unknown>, settings: s.data as Record<string, unknown> });
  });
  if (issues.length) return { ok: false, issues };
  return { ok: true, doc: { ...doc, modules } };
}

export function assertValidDocument(input: unknown): EmailDocument {
  const r = validateDocument(input);
  if (!r.ok) throw new DocumentValidationError(r.issues);
  return r.doc;
}

export function createModuleInstance(type: string, brand: Brand, id: string): ModuleInstance {
  const def = getModule(type);
  if (!def || !moduleSupportsBrand(def, brand)) throw new Error(`Module ${type} unavailable for ${brand.id}`);
  const d = def.defaults(brand);
  return { id, type, content: structuredClone(d.content), settings: structuredClone(d.settings) };
}
