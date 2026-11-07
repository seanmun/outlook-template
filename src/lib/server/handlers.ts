/**
 * Request handling logic, independent of Next.js and of the concrete stores.
 * Route files resolve the user and repositories and delegate here, which keeps
 * authorization rules in one testable place.
 */
import { z } from "zod";
import type { EmailDocument } from "@/lib/email/document";
import { validateDocument } from "@/lib/email/registry";
import { collectImageSources } from "@/lib/email/render";
import { sampleBytes } from "@/lib/email/samples";
import { buildExportPackage, MissingImageError, type ImageLoader } from "@/lib/export/pipeline";
import { ExportFailedError, ExporterUnavailableError, type ExporterId } from "@/lib/export/types";
import { CfbTooLargeError } from "@/lib/export/cfb-writer";
import { MAX_UPLOAD_BYTES, readImageInfo } from "./image-info";
import { UUID_RE, type AssetRepo, type EmailRepo } from "./repo";

export interface HandlerContext {
  userId: string | null;
  emails: EmailRepo;
  assets: AssetRepo;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function errorResponse(status: number, message: string, details?: unknown): Response {
  return json({ error: message, ...(details ? { details } : {}) }, status);
}

const unauthorized = () => errorResponse(401, "Sign in required.");
const notFound = () => errorResponse(404, "Not found.");

function assetIdsIn(doc: EmailDocument): string[] {
  return [...new Set(collectImageSources(doc).flatMap((s) => (s.kind === "asset" ? [s.assetId] : [])))];
}

/** Validates a document and confirms every referenced asset belongs to the user. */
async function validateOwnedDocument(ctx: HandlerContext & { userId: string }, raw: unknown) {
  const r = validateDocument(raw);
  if (!r.ok) return { error: errorResponse(400, "Invalid email document.", r.issues) };
  const ids = assetIdsIn(r.doc);
  const malformed = ids.filter((id) => !UUID_RE.test(id));
  if (malformed.length) return { error: errorResponse(400, "Document references invalid asset ids.", malformed) };
  const owned = await ctx.assets.existing(ctx.userId, ids);
  const foreign = ids.filter((id) => !owned.has(id));
  if (foreign.length) return { error: errorResponse(400, "Document references images that do not exist or are not yours.", foreign) };
  return { doc: r.doc };
}

/* ---------------- Emails ---------------- */

export async function listEmails(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  return json({ emails: await ctx.emails.list(ctx.userId) });
}

export async function createEmail(ctx: HandlerContext, body: unknown) {
  if (!ctx.userId) return unauthorized();
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, (body as { document?: unknown })?.document);
  if (v.error) return v.error;
  const rec = await ctx.emails.create(ctx.userId, v.doc);
  return json({ email: rec }, 201);
}

export async function getEmail(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  const rec = await ctx.emails.get(ctx.userId, id);
  return rec ? json({ email: rec }) : notFound();
}

const UpdateBody = z.object({ document: z.unknown(), revision: z.number().int().min(1) });

export async function updateEmail(ctx: HandlerContext, id: string, body: unknown) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  const parsed = UpdateBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Expected { document, revision }.");
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, parsed.data.document);
  if (v.error) return v.error;
  const result = await ctx.emails.update(ctx.userId, id, v.doc, parsed.data.revision);
  if (result === "not_found") return notFound();
  if (result === "conflict") return errorResponse(409, "This email was saved elsewhere (another tab?). Reload to get the latest version.");
  return json({ email: result });
}

export async function deleteEmail(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  return (await ctx.emails.remove(ctx.userId, id)) ? json({ ok: true }) : notFound();
}

/* ---------------- Assets ---------------- */

export async function uploadAsset(ctx: HandlerContext, file: { data: Uint8Array; name: string } | null) {
  if (!ctx.userId) return unauthorized();
  if (!file) return errorResponse(400, "No file uploaded.");
  if (file.data.length > MAX_UPLOAD_BYTES) return errorResponse(413, `Images must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`);
  const info = readImageInfo(file.data);
  if (!info) return errorResponse(415, "Only PNG, JPEG or GIF images up to 6000px are supported.");
  const rec = await ctx.assets.create(ctx.userId, {
    data: file.data,
    mimeType: info.mimeType,
    width: info.width,
    height: info.height,
    originalFilename: file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "image",
  });
  return json({ asset: { id: rec.id, mimeType: rec.mimeType, width: rec.width, height: rec.height, originalFilename: rec.originalFilename } }, 201);
}

export async function readAsset(ctx: HandlerContext, id: string): Promise<Response> {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  const r = await ctx.assets.read(ctx.userId, id);
  if (!r) return notFound();
  return new Response(r.data as BodyInit, {
    headers: {
      "Content-Type": r.record.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

/* ---------------- Export ---------------- */

const FormatsSchema = z.array(z.enum(["oft", "emltpl", "html"])).min(1).max(3);

function exportErrorResponse(err: unknown): Response {
  if (err instanceof ExporterUnavailableError) return errorResponse(422, err.message);
  if (err instanceof MissingImageError) return errorResponse(422, err.message);
  if (err instanceof CfbTooLargeError) return errorResponse(413, err.message);
  if (err instanceof ExportFailedError) return errorResponse(500, err.message);
  console.error("export failed", err);
  return errorResponse(500, "Export failed unexpectedly.");
}

async function runExport(doc: EmailDocument, formats: ExporterId[], loadImage: ImageLoader): Promise<Response> {
  try {
    const pkg = await buildExportPackage({ doc, formats, loadImage });
    return new Response(pkg.zip as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pkg.filename}"`,
        "Cache-Control": "no-store",
        "X-Export-Formats": pkg.included.join(","),
      },
    });
  } catch (err) {
    return exportErrorResponse(err);
  }
}

export async function exportForUser(ctx: HandlerContext, body: unknown) {
  if (!ctx.userId) return unauthorized();
  const b = body as { document?: unknown; formats?: unknown };
  const formats = FormatsSchema.safeParse(b?.formats);
  if (!formats.success) return errorResponse(400, "Unknown or missing export formats.");
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, b?.document);
  if (v.error) return v.error;
  const userId = ctx.userId;
  return runExport(v.doc, formats.data, async (src) => {
    if (src.kind === "sample") {
      const data = sampleBytes(src.sampleId);
      return data ? { data } : null;
    }
    const r = await ctx.assets.read(userId, src.assetId);
    return r ? { data: r.data } : null;
  });
}

const DemoExportBody = z.object({
  document: z.unknown(),
  formats: FormatsSchema,
  /** Demo mode only: images live in the browser, so bytes are posted with the request. */
  localImages: z.record(z.string().regex(/^local_[A-Za-z0-9_-]{6,40}$/), z.string().max(8_000_000)).default({}),
});

export async function exportForDemo(body: unknown) {
  const parsed = DemoExportBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid export request.");
  const v = validateDocument(parsed.data.document);
  if (!v.ok) return errorResponse(400, "Invalid email document.", v.issues);
  const images = parsed.data.localImages;
  return runExport(v.doc, parsed.data.formats, async (src) => {
    if (src.kind === "sample") {
      const data = sampleBytes(src.sampleId);
      return data ? { data } : null;
    }
    const b64 = images[src.assetId];
    if (!b64) return null;
    const data = Uint8Array.from(Buffer.from(b64, "base64"));
    return readImageInfo(data) ? { data } : null;
  });
}
