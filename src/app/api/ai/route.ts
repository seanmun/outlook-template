import { z } from "zod";
import { assembleWithAi } from "@/lib/ai/assemble";
import { parseReference } from "@/lib/ai/reference";
import type { OfferedImage } from "@/lib/ai/run";
import { validateDocument } from "@/lib/email/registry";
import { aiAvailability, appMode } from "@/lib/server/config";
import { productionContext, readJson } from "@/lib/server/context";
import { errorResponse, json, type HandlerContext } from "@/lib/server/handlers";
import { UUID_RE } from "@/lib/server/repo";

export const maxDuration = 120;

const MAX_IMAGES = 8;
/** Keeps the model request well inside the API's size limit. */
const MAX_IMAGE_BYTES_TOTAL = 12 * 1024 * 1024;

const Body = z.object({
  document: z.unknown(),
  instruction: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20).default([]),
  /** Optional design comp (image or PDF) as base64. */
  reference: z.string().max(4_200_000).nullish(),
  /** Images already uploaded to the user's library that the AI may place. */
  images: z
    .array(
      z.object({
        assetId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
        name: z.string().max(120).default("image"),
        width: z.number().int().min(1).max(10000),
        height: z.number().int().min(1).max(10000),
      }),
    )
    .max(MAX_IMAGES)
    .default([]),
});

type RequestedImage = z.infer<typeof Body>["images"][number];

/**
 * Signed-in: load each image from the user's own storage, so the model sees it and
 * nobody can reference another user's asset. Local demo: images live in the browser,
 * so the model gets names and sizes only.
 */
async function offeredImages(ctx: HandlerContext | null, requested: RequestedImage[]): Promise<OfferedImage[] | Response> {
  const out: OfferedImage[] = [];
  let total = 0;
  for (const [i, img] of requested.entries()) {
    const ref = `img-${i + 1}`;
    const src = { kind: "asset" as const, assetId: img.assetId };
    if (!ctx?.userId) {
      out.push({ ref, src, name: img.name, width: img.width, height: img.height });
      continue;
    }
    const stored = UUID_RE.test(img.assetId) ? await ctx.assets.read({ userId: ctx.userId, workspaceId: ctx.workspaceId }, img.assetId) : null;
    if (!stored) return errorResponse(400, `Image "${img.name}" was not found in your library.`);
    total += stored.data.length;
    if (total > MAX_IMAGE_BYTES_TOTAL) return errorResponse(413, "Those images are too large to send together. Remove some and try again.");
    out.push({
      ref,
      src,
      name: stored.record.originalFilename,
      width: stored.record.width,
      height: stored.record.height,
      mediaType: stored.record.mimeType as OfferedImage["mediaType"],
      data: Buffer.from(stored.data).toString("base64"),
    });
  }
  return out;
}

export async function POST(req: Request) {
  const ai = aiAvailability();
  if (!ai.enabled) return errorResponse(503, ai.reason ?? "AI is not available.");
  let ctx: HandlerContext | null = null;
  if (appMode() === "production") {
    const c = await productionContext();
    if (c instanceof Response) return c;
    if (!c.userId) return errorResponse(401, "Sign in required.");
    ctx = c;
  }
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, "Expected { document, instruction, history }, with an optional comp up to 3 MB and up to 8 images.");
  const doc = validateDocument(parsed.data.document);
  if (!doc.ok) return errorResponse(400, "Invalid email document.", doc.issues);
  const ref = parsed.data.reference ? parseReference(parsed.data.reference) : null;
  if (ref && !ref.ok) return errorResponse(415, ref.error);
  const images = await offeredImages(ctx, parsed.data.images);
  if (images instanceof Response) return images;

  const result = await assembleWithAi({
    doc: doc.doc,
    instruction: parsed.data.instruction,
    history: parsed.data.history,
    reference: ref?.ok ? ref.reference : undefined,
    images,
  });
  if (!result.ok) return errorResponse(422, result.error, result.details);
  // The client replays operations if the user edited meanwhile, so it needs the same image refs.
  return json({ ...result, images: images.map(({ ref, src, width, height }) => ({ ref, src, width, height })) });
}
