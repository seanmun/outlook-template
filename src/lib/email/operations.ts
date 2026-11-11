/**
 * Deterministic, atomic document operations.
 *
 * The AI never returns a whole document. It returns a list of operations that
 * reference modules by stable ID; this module applies them to a copy and
 * validates the result. Either every operation applies and the final
 * document validates, or nothing changes.
 */
import { z } from "zod";
import { requireBrand } from "./brands";
import { COLUMNS_TYPE, MAX_BLOCKS_PER_COLUMN, locateModule, newModuleId, type EmailDocument, type ModuleInstance, type ModuleLocation } from "./document";
import type { ImageSource, ImageValue } from "./fields";
import { COLUMN_LAYOUTS, type ColumnLayout } from "./modules/columns";
import { createModuleInstance, fitToColumn, getModule, moduleSupportsBrand, reflowColumns, validateDocument } from "./registry";
import { liteToRichText, RichTextSchema } from "./richtext";

export const OperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_module"),
    moduleType: z.string(),
    /** Insert position in the module list at the time this op runs; null = end. */
    index: z.number().int().min(0).nullable(),
    /** Temporary handle so later ops in the same batch can reference the new module. */
    ref: z.string().max(40).nullable(),
    content: z.record(z.string(), z.unknown()).nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(),
    /** Id or ref of a columns row to add into; omitted/null = top level. `index` is then the position within that column. */
    parentId: z.string().nullish(),
    /** Column of the parent row, 0 = leftmost. */
    column: z.number().int().min(0).max(2).nullish(),
  }),
  z.object({
    op: z.literal("update_module"),
    moduleId: z.string(),
    content: z.record(z.string(), z.unknown()).nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(),
  }),
  z.object({
    op: z.literal("move_module"),
    moduleId: z.string(),
    toIndex: z.number().int().min(0),
    /** Move into this columns row (id or ref); omitted/null = top level. */
    parentId: z.string().nullish(),
    column: z.number().int().min(0).max(2).nullish(),
  }),
  z.object({ op: z.literal("remove_module"), moduleId: z.string() }),
  z.object({ op: z.literal("set_subject"), subject: z.string().max(300) }),
]);
export type Operation = z.infer<typeof OperationSchema>;

/** An image the user uploaded for this request. Operations place one with { "use": ref }. */
export interface AvailableImage {
  ref: string;
  src: ImageSource;
  width: number;
  height: number;
}

export interface OperationError {
  opIndex: number;
  message: string;
}

export type ApplyResult =
  | { ok: true; doc: EmailDocument; touchedModuleIds: string[] }
  | { ok: false; errors: OperationError[] };

function patchContent(module: ModuleInstance, patch: Record<string, unknown>, opIndex: number, errors: OperationError[], images: AvailableImage[]) {
  const def = getModule(module.type)!;
  const next = structuredClone(module.content);
  for (const [key, value] of Object.entries(patch)) {
    const field = def.contentFields.find((f) => f.key === key);
    if (!field) {
      errors.push({ opIndex, message: `Module type "${module.type}" has no content field "${key}". Allowed: ${def.contentFields.map((f) => f.key).join(", ")}` });
      continue;
    }
    if (field.kind === "richtext") {
      if (typeof value === "string") {
        try {
          next[key] = liteToRichText(value);
        } catch (e) {
          errors.push({ opIndex, message: `Field "${key}": could not parse rich text (${(e as Error).message})` });
        }
      } else {
        const parsed = RichTextSchema.safeParse(value);
        if (parsed.success) next[key] = parsed.data;
        else errors.push({ opIndex, message: `Field "${key}": invalid rich text` });
      }
    } else if (field.kind === "image") {
      // Images are user-supplied assets. Only descriptive/display properties may be patched.
      if (!value || typeof value !== "object") {
        errors.push({ opIndex, message: `Field "${key}" must be an object with optional alt/width/linkUrl` });
        continue;
      }
      const allowed = ["alt", "width", ...(field.allowLink ? ["linkUrl"] : []), ...(images.length ? ["use"] : [])];
      const v = value as Record<string, unknown>;
      const bad = Object.keys(v).filter((k) => !allowed.includes(k));
      if (bad.length) {
        errors.push({ opIndex, message: `Field "${key}": cannot set ${bad.join(", ")} (images must be uploaded by the user)` });
        continue;
      }
      const { use, ...rest } = v;
      let image = { ...(next[key] as ImageValue), ...rest } as ImageValue;
      if (use !== undefined) {
        const picked = images.find((i) => i.ref === use);
        if (!picked) {
          errors.push({ opIndex, message: `Field "${key}": no uploaded image "${String(use)}". Available: ${images.map((i) => i.ref).join(", ")}` });
          continue;
        }
        const width = typeof rest.width === "number" ? rest.width : picked.width;
        image = { ...image, src: picked.src, naturalWidth: picked.width, naturalHeight: picked.height, width: Math.max(16, Math.min(field.maxWidth, Math.round(width))) };
      }
      next[key] = image;
    } else {
      next[key] = value;
    }
  }
  return next;
}

function patchSettings(module: ModuleInstance, patch: Record<string, unknown>, opIndex: number, errors: OperationError[]) {
  const def = getModule(module.type)!;
  const next = structuredClone(module.settings);
  for (const [key, value] of Object.entries(patch)) {
    const field = def.settingFields.find((f) => f.key === key);
    if (!field) {
      errors.push({ opIndex, message: `Module type "${module.type}" has no setting "${key}". Allowed: ${def.settingFields.map((f) => f.key).join(", ")}` });
      continue;
    }
    if (field.kind === "padding" && value && typeof value === "object") {
      next[key] = { ...(next[key] as object), ...(value as object) };
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function applyOperations(doc: EmailDocument, ops: Operation[], idFactory: () => string = newModuleId, images: AvailableImage[] = []): ApplyResult {
  const brand = requireBrand(doc.brandId);
  const errors: OperationError[] = [];
  const working: EmailDocument = structuredClone(doc);
  const refs = new Map<string, string>();
  const touched = new Set<string>();
  const resolveId = (id: string) => refs.get(id) ?? id;
  const locate = (id: string) => locateModule(working, resolveId(id));
  /** The (mutable) list a location points into: the top level, or one column of a row. */
  const listAt = (loc: ModuleLocation): ModuleInstance[] =>
    loc.parentId === null ? working.modules : working.modules.find((m) => m.id === loc.parentId)!.columns![loc.column].blocks;
  /** Resolves "parentId + column" to that column's block list, recording an error if it is not a valid target. */
  const columnList = (parentId: string, column: number | null | undefined, opIndex: number): ModuleInstance[] | null => {
    const parent = working.modules.find((m) => m.id === resolveId(parentId));
    if (!parent?.columns) {
      errors.push({ opIndex, message: `parentId "${parentId}" is not a columns module` });
      return null;
    }
    const col = column ?? 0;
    if (col >= parent.columns.length) {
      errors.push({ opIndex, message: `Column ${col} does not exist; "${parentId}" has columns 0-${parent.columns.length - 1}` });
      return null;
    }
    if (parent.columns[col].blocks.length >= MAX_BLOCKS_PER_COLUMN) {
      errors.push({ opIndex, message: `Column ${col} of "${parentId}" is full` });
      return null;
    }
    touched.add(parent.id);
    return parent.columns[col].blocks;
  };
  /** Applies content/settings patches, keeping a columns row's column count in step with its layout. */
  const patch = (m: ModuleInstance, content: Record<string, unknown> | null, settings: Record<string, unknown> | null, opIndex: number): ModuleInstance => {
    let next = m;
    if (content) next = { ...next, content: patchContent(next, content, opIndex, errors, images) };
    if (settings) next = { ...next, settings: patchSettings(next, settings, opIndex, errors) };
    const layout = next.settings.layout as ColumnLayout | undefined;
    // An unknown layout value is left alone here and reported by document validation below.
    if (next.type === COLUMNS_TYPE && typeof layout === "string" && layout in COLUMN_LAYOUTS) next = { ...next, columns: reflowColumns(next.columns ?? [], layout) };
    return next;
  };

  ops.forEach((op, opIndex) => {
    switch (op.op) {
      case "add_module": {
        const def = getModule(op.moduleType);
        if (!def || !moduleSupportsBrand(def, brand)) {
          errors.push({ opIndex, message: `Module type "${op.moduleType}" is not available for brand ${brand.id}` });
          return;
        }
        const nested = !!op.parentId;
        if (nested && op.moduleType === COLUMNS_TYPE) {
          errors.push({ opIndex, message: "Columns cannot be placed inside columns" });
          return;
        }
        const list = nested ? columnList(op.parentId!, op.column, opIndex) : working.modules;
        if (!list) return;
        const id = idFactory();
        if (op.ref) refs.set(op.ref, id);
        const fresh = createModuleInstance(op.moduleType, brand, id);
        const instance = patch(nested ? fitToColumn(fresh) : fresh, op.content, op.settings, opIndex);
        list.splice(op.index === null ? list.length : Math.min(op.index, list.length), 0, instance);
        touched.add(id);
        return;
      }
      case "update_module": {
        const loc = locate(op.moduleId);
        if (!loc) {
          errors.push({ opIndex, message: `No module with id "${op.moduleId}"` });
          return;
        }
        const list = listAt(loc);
        list[loc.index] = patch(list[loc.index], op.content, op.settings, opIndex);
        touched.add(list[loc.index].id);
        return;
      }
      case "move_module": {
        const loc = locate(op.moduleId);
        if (!loc) {
          errors.push({ opIndex, message: `No module with id "${op.moduleId}"` });
          return;
        }
        const from = listAt(loc);
        const m = from[loc.index];
        if (op.parentId && m.type === COLUMNS_TYPE) {
          errors.push({ opIndex, message: "Columns cannot be placed inside columns" });
          return;
        }
        from.splice(loc.index, 1);
        const to = op.parentId ? columnList(op.parentId, op.column, opIndex) : working.modules;
        if (!to) return;
        to.splice(Math.min(op.toIndex, to.length), 0, op.parentId && loc.parentId === null ? fitToColumn(m) : m);
        touched.add(m.id);
        return;
      }
      case "remove_module": {
        const loc = locate(op.moduleId);
        if (!loc) {
          errors.push({ opIndex, message: `No module with id "${op.moduleId}"` });
          return;
        }
        listAt(loc).splice(loc.index, 1);
        return;
      }
      case "set_subject":
        working.subject = op.subject;
        return;
    }
  });

  if (errors.length) return { ok: false, errors };
  const validated = validateDocument(working);
  if (!validated.ok) {
    return { ok: false, errors: validated.issues.map((i) => ({ opIndex: -1, message: `${i.path}: ${i.message}` })) };
  }
  return { ok: true, doc: validated.doc, touchedModuleIds: [...touched] };
}
