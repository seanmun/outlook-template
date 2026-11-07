/**
 * Model-agnostic assembly loop: call, convert, apply atomically, and on
 * validation failure retry once with the errors. The model caller is
 * injected so this is testable without network access.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { requireBrand } from "@/lib/email/brands";
import type { EmailDocument } from "@/lib/email/document";
import { applyOperations, type Operation } from "@/lib/email/operations";
import { systemPrompt, userMessage } from "./prompt";
import { toOperations, type AiOutput } from "./schema";

export type ModelCaller = (req: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
}) => Promise<
  | { kind: "ok"; output: AiOutput; rawAssistant: Exclude<Anthropic.Beta.BetaMessageParam["content"], undefined> }
  | { kind: "refusal" }
  | { kind: "error"; message: string }
>;

export type AssemblyResult =
  | { ok: true; document: EmailDocument; operations: Operation[]; summary: string; unresolved: string[]; touchedModuleIds: string[]; attempts: number }
  | { ok: false; error: string; details?: string[] };

const MAX_ATTEMPTS = 2;

export async function runAssembly(opts: {
  doc: EmailDocument;
  instruction: string;
  history: { role: "user" | "assistant"; text: string }[];
  call: ModelCaller;
}): Promise<AssemblyResult> {
  const brand = requireBrand(opts.doc.brandId);
  const system = systemPrompt(brand);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userMessage(opts) }];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await opts.call({ system, messages });
    if (res.kind === "refusal") return { ok: false, error: "The AI declined this request. Try rephrasing it." };
    if (res.kind === "error") return { ok: false, error: res.message };

    const converted = toOperations(res.output);
    let errors: string[];
    if (converted.ok) {
      const applied = applyOperations(opts.doc, converted.operations);
      if (applied.ok) {
        return {
          ok: true,
          document: applied.doc,
          operations: converted.operations,
          summary: res.output.summary,
          unresolved: res.output.unresolved,
          touchedModuleIds: applied.touchedModuleIds,
          attempts: attempt,
        };
      }
      errors = applied.errors.map((e) => (e.opIndex >= 0 ? `operations[${e.opIndex}]: ${e.message}` : e.message));
    } else errors = converted.errors;

    lastErrors = errors;
    // Append-only history: keep the assistant turn as returned, then ask for a corrected full set.
    messages.push({ role: "assistant", content: res.rawAssistant });
    messages.push({
      role: "user",
      content: `Your operations were rejected and nothing was applied:\n- ${errors.join("\n- ")}\n\nReturn the complete corrected set of operations for the original request.`,
    });
  }
  return { ok: false, error: "The AI returned changes that failed validation, so nothing was applied.", details: lastErrors };
}
