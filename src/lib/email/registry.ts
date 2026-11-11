/**
 * Typed module registry and document validation.
 *
 * To add a module: create a definition in ./modules, add it to MODULES, and
 * list its type in the brands that may use it (src/lib/email/brands.ts).
 * Use `brands: [...]` to restrict it, and `renderers` for brand-specific layouts.
 */
import { z } from "zod";
import { getBrand, type Brand } from "./brands";
import { COLUMNS_TYPE, EmailDocumentSchema, type EmailDocument, type ModuleInstance } from "./document";
import { COLUMN_LAYOUTS, columnsModule, type ColumnLayout } from "./modules/columns";
import { ctaModule } from "./modules/cta";
import { dividerModule } from "./modules/divider";
import { footerModule } from "./modules/footer";
import { headerModule } from "./modules/header";
import { heroModule } from "./modules/hero";
import { socialModule } from "./modules/social";
import { textModule } from "./modules/text";
import type { AnyModuleDefinition } from "./modules/types";

export const MODULES: AnyModuleDefinition[] = [headerModule, heroModule, textModule, ctaModule, dividerModule, socialModule, columnsModule, footerModule];

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
  /** Validates one module (and, for a columns row, its blocks). Returns the parsed module, or null after recording issues. */
  const check = (m: ModuleInstance, prefix: string, nested: boolean): ModuleInstance | null => {
    if (seen.has(m.id)) issues.push({ path: `${prefix}.id`, message: `Duplicate module id ${m.id}`, moduleId: m.id });
    seen.add(m.id);
    const def = getModule(m.type);
    if (!def) {
      issues.push({ path: `${prefix}.type`, message: `Unknown module type "${m.type}"`, moduleId: m.id });
      return null;
    }
    if (!moduleSupportsBrand(def, brand)) {
      issues.push({ path: `${prefix}.type`, message: `Module "${m.type}" is not available for brand ${brand.id}`, moduleId: m.id });
      return null;
    }
    const c = def.contentSchema.safeParse(m.content);
    const s = def.settingsSchema.safeParse(m.settings);
    if (!c.success) issues.push(...zodIssues(c.error, `${prefix}.content`, m.id));
    if (!s.success) issues.push(...zodIssues(s.error, `${prefix}.settings`, m.id));
    if (!c.success || !s.success) return null;
    const parsed: ModuleInstance = { id: m.id, type: m.type, content: c.data as Record<string, unknown>, settings: s.data as Record<string, unknown> };
    if (m.type !== COLUMNS_TYPE) {
      if (m.columns) issues.push({ path: `${prefix}.columns`, message: `Only a "${COLUMNS_TYPE}" module can hold columns`, moduleId: m.id });
      return parsed;
    }
    if (nested) {
      issues.push({ path: `${prefix}.type`, message: "Columns cannot be placed inside columns", moduleId: m.id });
      return null;
    }
    const expected = COLUMN_LAYOUTS[(s.data as { layout: ColumnLayout }).layout].ratios.length;
    if (m.columns?.length !== expected) {
      issues.push({ path: `${prefix}.columns`, message: `Layout ${(s.data as { layout: string }).layout} needs exactly ${expected} columns`, moduleId: m.id });
      return null;
    }
    const before = issues.length;
    const columns = m.columns.map((col, ci) => ({
      blocks: col.blocks.map((b, bi) => check(b, `${prefix}.columns.${ci}.blocks.${bi}`, true)).filter((b): b is ModuleInstance => !!b),
    }));
    return issues.length > before ? null : { ...parsed, columns };
  };
  const modules = doc.modules.map((m, i) => check(m, `modules.${i}`, false)).filter((m): m is ModuleInstance => !!m);
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
  const base: ModuleInstance = { id, type, content: structuredClone(d.content), settings: structuredClone(d.settings) };
  return type === COLUMNS_TYPE ? { ...base, columns: emptyColumns((d.settings as { layout: ColumnLayout }).layout) } : base;
}

export function emptyColumns(layout: ColumnLayout): { blocks: ModuleInstance[] }[] {
  return COLUMN_LAYOUTS[layout].ratios.map(() => ({ blocks: [] }));
}

/**
 * Re-shapes a row's columns for a new layout without losing content: extra
 * columns are added empty, and blocks from removed columns move to the last one kept.
 */
export function reflowColumns(columns: { blocks: ModuleInstance[] }[], layout: ColumnLayout): { blocks: ModuleInstance[] }[] {
  const count = COLUMN_LAYOUTS[layout].ratios.length;
  const kept = columns.slice(0, count).map((c) => ({ blocks: [...c.blocks] }));
  while (kept.length < count) kept.push({ blocks: [] });
  for (const extra of columns.slice(count)) kept[count - 1].blocks.push(...extra.blocks);
  return kept;
}

/** Blocks dropped into a column give up their full-width side padding; the row and column gap provide the spacing. */
export function fitToColumn(m: ModuleInstance): ModuleInstance {
  const p = m.settings.padding as { top: number; right: number; bottom: number; left: number } | undefined;
  if (!p) return m;
  return { ...m, settings: { ...m.settings, padding: { top: Math.min(p.top, 12), right: 0, bottom: Math.min(p.bottom, 12), left: 0 } } };
}
