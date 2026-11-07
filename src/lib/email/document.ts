/** The persisted email document: structured JSON, never arbitrary HTML. */
import { z } from "zod";
import { PlainTextSchema } from "./fields";

export const SCHEMA_VERSION = 1 as const;

export const ModuleIdSchema = z.string().regex(/^m_[A-Za-z0-9_-]{6,32}$/, "Invalid module id");

export const ModuleInstanceSchema = z.object({
  id: ModuleIdSchema,
  type: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  content: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()),
});
export type ModuleInstance = z.infer<typeof ModuleInstanceSchema>;

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
