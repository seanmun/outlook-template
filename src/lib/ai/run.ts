/**
 * Model-agnostic assembly loop: call, convert, apply atomically, and on
 * validation failure retry once with the errors. The model caller is
 * injected so this is testable without network access.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { requireBrand } from "@/lib/email/brands";
import type { EmailDocument } from "@/lib/email/document";
import { applyOperations, type AvailableImage, type Operation } from "@/lib/email/operations";
import { systemPrompt, userMessage } from "./prompt";
import type { Reference, ReferenceMediaType } from "./reference";

/** An uploaded image offered to the model. `data` (base64) lets the model see it. */
export interface OfferedImage extends AvailableImage {
  name: string;
  mediaType?: Exclude<ReferenceMediaType, "application/pdf">;
  data?: string;
}
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
  /** Optional design comp for the model to look at. */
  reference?: Reference;
  /** Images the user uploaded for this email; the model may place them. */
  images?: OfferedImage[];
  call: ModelCaller;
}): Promise<AssemblyResult> {
  const brand = requireBrand(opts.doc.brandId);
  const system = systemPrompt(brand);
  const text = userMessage(opts);
  const ref = opts.reference;
  const images = opts.images ?? [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content:
        !ref && images.length === 0
          ? text
          : [
              ...(ref
                ? [
                    { type: "text" as const, text: "Design comp:" },
                    ref.mediaType === "application/pdf"
                      ? { type: "document" as const, source: { type: "base64" as const, media_type: ref.mediaType, data: ref.data } }
                      : { type: "image" as const, source: { type: "base64" as const, media_type: ref.mediaType, data: ref.data } },
                  ]
                : []),
              ...images.flatMap((img) => [
                { type: "text" as const, text: `Uploaded image "${img.ref}" (${img.name}, ${img.width}×${img.height}px):` },
                ...(img.data && img.mediaType ? [{ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } }] : []),
              ]),
              { type: "text" as const, text },
            ],
    },
  ];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await opts.call({ system, messages });
    if (res.kind === "refusal") return { ok: false, error: "The AI declined this request. Try rephrasing it." };
    if (res.kind === "error") return { ok: false, error: res.message };

    const converted = toOperations(res.output);
    let errors: string[];
    if (converted.ok) {
      const applied = applyOperations(opts.doc, converted.operations, undefined, images);
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
