/** The persisted email document: structured JSON, never arbitrary HTML. */
import { z } from "zod";
import { PlainTextSchema } from "./fields";

export const SCHEMA_VERSION = 1 as const;

export const ModuleIdSchema = z.string().regex(/^m_[A-Za-z0-9_-]{6,32}$/, "Invalid module id");

const BlockSchema = z.object({
  id: ModuleIdSchema,
  type: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  content: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()),
});

export const COLUMNS_TYPE = "columns";
export const MAX_BLOCKS_PER_COLUMN = 12;

/**
 * A module is a block (text, image, button...) or a "columns" row, which holds
 * two or three side-by-side stacks of blocks. Rows cannot be nested.
 */
export const ModuleInstanceSchema = BlockSchema.extend({
  columns: z.array(z.object({ blocks: z.array(BlockSchema).max(MAX_BLOCKS_PER_COLUMN) })).min(2).max(3).optional(),
});
export type ModuleInstance = z.infer<typeof ModuleInstanceSchema>;

/** Every module in reading order: each top-level module, then (for a columns row) its blocks, left to right. */
export function allModules(doc: { modules: ModuleInstance[] }): ModuleInstance[] {
  return doc.modules.flatMap((m) => [m, ...(m.columns?.flatMap((c) => c.blocks) ?? [])]);
}

export function findModule(doc: { modules: ModuleInstance[] }, id: string): ModuleInstance | undefined {
  return allModules(doc).find((m) => m.id === id);
}

/** Where a module sits: at the top level, or inside one column of a columns row. */
export type ModuleLocation = { parentId: null; index: number } | { parentId: string; column: number; index: number };

export function locateModule(doc: { modules: ModuleInstance[] }, id: string): ModuleLocation | null {
  for (const [index, m] of doc.modules.entries()) {
    if (m.id === id) return { parentId: null, index };
    for (const [column, c] of (m.columns ?? []).entries()) {
      const i = c.blocks.findIndex((b) => b.id === id);
      if (i >= 0) return { parentId: m.id, column, index: i };
    }
  }
  return null;
}

export const EmailDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  brandId: z.string().min(1).max(60),
  title: PlainTextSchema(200),
  subject: PlainTextSchema(300),
  modules: z.array(ModuleInstanceSchema).max(40),
});
export type EmailDocument = z.infer<typeof EmailDocumentSchema>;

export function newModuleId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return "m_" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") + Array.from(bytes.slice(0, 3), (b) => alphabet[(b >> 2) % alphabet.length]).join("");
}
