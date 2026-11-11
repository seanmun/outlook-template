/**
 * Structured output schema. Module content varies by module type, so patches
 * travel as JSON strings and are validated against each module's own Zod
 * schema after parsing (see operations.ts). Everything else is closed.
 */
import { z } from "zod";
import { OperationSchema, type Operation } from "@/lib/email/operations";

export const AiOperationSchema = z.object({
  op: z.enum(["add_module", "update_module", "move_module", "remove_module", "set_subject"]),
  moduleType: z.string().nullable(),
  moduleId: z.string().nullable(),
  index: z.number().int().nullable(),
  toIndex: z.number().int().nullable(),
  /** add_module / move_module: id or ref of the columns row to place the block in; null = top level. */
  parentId: z.string().nullable(),
  /** Column inside parentId, 0 = leftmost; null when parentId is null. */
  column: z.number().int().nullable(),
  ref: z.string().nullable(),
  subject: z.string().nullable(),
  contentJson: z.string().nullable(),
  settingsJson: z.string().nullable(),
});

export const AiOutputSchema = z.object({
  summary: z.string(),
  operations: z.array(AiOperationSchema),
  unresolved: z.array(z.string()),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;

function parseObjectJson(s: string | null, label: string): Record<string, unknown> | null {
  if (s === null || s.trim() === "" || s.trim() === "null") return null;
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${label} must be a JSON object`);
  return v as Record<string, unknown>;
}

/** Converts raw model output to typed operations, or returns readable errors. */
export function toOperations(output: AiOutput): { ok: true; operations: Operation[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const operations: Operation[] = [];
  output.operations.forEach((o, i) => {
    try {
      const content = parseObjectJson(o.contentJson, `operations[${i}].contentJson`);
      const settings = parseObjectJson(o.settingsJson, `operations[${i}].settingsJson`);
      const candidate =
        o.op === "add_module"
          ? { op: o.op, moduleType: o.moduleType, index: o.index, ref: o.ref, content, settings, parentId: o.parentId, column: o.column }
          : o.op === "update_module"
            ? { op: o.op, moduleId: o.moduleId, content, settings }
            : o.op === "move_module"
              ? { op: o.op, moduleId: o.moduleId, toIndex: o.toIndex, parentId: o.parentId, column: o.column }
              : o.op === "remove_module"
                ? { op: o.op, moduleId: o.moduleId }
                : { op: o.op, subject: o.subject };
      const parsed = OperationSchema.safeParse(candidate);
      if (!parsed.success) {
        errors.push(`operations[${i}] (${o.op}): ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
      } else operations.push(parsed.data);
    } catch (e) {
      errors.push((e as Error).message);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, operations };
}
