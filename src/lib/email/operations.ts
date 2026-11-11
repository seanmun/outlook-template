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
import { newModuleId, type EmailDocument, type ModuleInstance } from "./document";
import type { ImageSource, ImageValue } from "./fields";
import { createModuleInstance, getModule, moduleSupportsBrand, validateDocument } from "./registry";
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
  }),
  z.object({
    op: z.literal("update_module"),
    moduleId: z.string(),
    content: z.record(z.string(), z.unknown()).nullable(),
    settings: z.record(z.string(), z.unknown()).nullable(),
  }),
  z.object({ op: z.literal("move_module"), moduleId: z.string(), toIndex: z.number().int().min(0) }),
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
  const indexOf = (id: string) => working.modules.findIndex((m) => m.id === resolveId(id));

  ops.forEach((op, opIndex) => {
    switch (op.op) {
      case "add_module": {
        const def = getModule(op.moduleType);
        if (!def || !moduleSupportsBrand(def, brand)) {
          errors.push({ opIndex, message: `Module type "${op.moduleType}" is not available for brand ${brand.id}` });
          return;
        }
        const id = idFactory();
        if (op.ref) refs.set(op.ref, id);
        let instance = createModuleInstance(op.moduleType, brand, id);
        if (op.content) instance = { ...instance, content: patchContent(instance, op.content, opIndex, errors, images) };
        if (op.settings) instance = { ...instance, settings: patchSettings(instance, op.settings, opIndex, errors) };
        const at = op.index === null ? working.modules.length : Math.min(op.index, working.modules.length);
        working.modules.splice(at, 0, instance);
        touched.add(id);
        return;
      }
      case "update_module": {
        const i = indexOf(op.moduleId);
        if (i < 0) {
          errors.push({ opIndex, message: `No module with id "${op.moduleId}"` });
          return;
        }
        let m = working.modules[i];
        if (op.content) m = { ...m, content: patchContent(m, op.content, opIndex, errors, images) };
        if (op.settings) m = { ...m, settings: patchSettings(m, op.settings, opIndex, errors) };
        working.modules[i] = m;
        touched.add(m.id);
        return;
      }
      case "move_module": {
        const i = indexOf(op.moduleId);
        if (i < 0) {
          errors.push({ opIndex, message: `No module with id "${op.moduleId}"` });
          return;
        }
        const [m] = working.modules.splice(i, 1);
        working.modules.splice(Math.min(op.toIndex, working.modules.length), 0, m);
        touched.add(m.id);
        return;
      }
      case "remove_module": {
        const i = indexOf(op.moduleId);
        if (i < 0) {
          errors.push({ opIndex, message: `No module with id "${op.moduleId}"` });
          return;
        }
        working.modules.splice(i, 1);
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
