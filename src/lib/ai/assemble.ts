import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { requireBrand } from "@/lib/email/brands";
import type { EmailDocument } from "@/lib/email/document";
import { anthropicModel } from "@/lib/server/config";
import { runAssembly, type AssemblyResult, type ModelCaller } from "./run";
import { AiOutputSchema } from "./schema";

/** Server-side refusal fallback is supported on these models (first-party Claude API). */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function anthropicCaller(): ModelCaller {
  const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
  const model = anthropicModel();
  const useFallback = FALLBACK_MODELS.has(model) && process.env.ANTHROPIC_FALLBACKS !== "off";
  return async ({ system, messages }) => {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages,
      output_config: { format: betaZodOutputFormat(AiOutputSchema), effort: "medium" },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") return { kind: "refusal" };
    if (response.stop_reason === "max_tokens") return { kind: "error", message: "The AI response was cut off. Try a smaller request." };
    if (!response.parsed_output) return { kind: "error", message: "The AI response did not match the expected format." };
    return { kind: "ok", output: response.parsed_output, rawAssistant: response.content };
  };
}

export async function assembleWithAi(opts: {
  doc: EmailDocument;
  instruction: string;
  history: { role: "user" | "assistant"; text: string }[];
}): Promise<AssemblyResult> {
  requireBrand(opts.doc.brandId);
  try {
    return await runAssembly({ ...opts, call: anthropicCaller() });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "The server's Anthropic API key was rejected." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "The AI service is rate limited. Try again in a moment." };
    if (err instanceof Anthropic.BadRequestError) return { ok: false, error: `The AI request was rejected: ${err.message}` };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `AI service error (${err.status ?? "network"}).` };
    throw err;
  }
}
