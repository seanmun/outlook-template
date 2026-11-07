import { z } from "zod";
import { assembleWithAi } from "@/lib/ai/assemble";
import { validateDocument } from "@/lib/email/registry";
import { aiAvailability, appMode } from "@/lib/server/config";
import { productionContext, readJson } from "@/lib/server/context";
import { errorResponse, json } from "@/lib/server/handlers";

export const maxDuration = 120;

const Body = z.object({
  document: z.unknown(),
  instruction: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20).default([]),
});

export async function POST(req: Request) {
  const ai = aiAvailability();
  if (!ai.enabled) return errorResponse(503, ai.reason ?? "AI is not available.");
  if (appMode() === "production") {
    const ctx = await productionContext();
    if (ctx instanceof Response) return ctx;
    if (!ctx.userId) return errorResponse(401, "Sign in required.");
  }
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, "Expected { document, instruction, history }.");
  const doc = validateDocument(parsed.data.document);
  if (!doc.ok) return errorResponse(400, "Invalid email document.", doc.issues);

  const result = await assembleWithAi({ doc: doc.doc, instruction: parsed.data.instruction, history: parsed.data.history });
  return result.ok ? json(result) : errorResponse(422, result.error, result.details);
}
