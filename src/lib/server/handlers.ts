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
import { UUID_RE, type AssetRepo, type EmailRepo, type SavedModuleRepo, type TemplateRepo } from "./repo";
import { DEFAULT_TEMPLATE_IDS, MAX_TEMPLATES } from "@/lib/email/templates";

export interface HandlerContext {
  userId: string | null;
  emails: EmailRepo;
  assets: AssetRepo;
  savedModules: SavedModuleRepo;
  templates: TemplateRepo;
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

/* ---------------- Saved modules ---------------- */

/** Keep in step with MAX_SAVED_MODULES in lib/client/saved-modules.ts. */
export const MAX_SAVED_MODULES = 40;

const SavedModuleBody = z.object({ id: z.string().regex(UUID_RE), name: z.string().trim().min(1).max(60), brandId: z.string().min(1).max(60), module: z.unknown() });

const savedModuleJson = (r: { id: string; name: string; brandId: string; module: unknown; createdAt: string }) => ({ id: r.id, name: r.name, brandId: r.brandId, module: r.module, savedAt: r.createdAt });

export async function listSavedModules(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  return json({ savedModules: (await ctx.savedModules.list(ctx.userId)).map(savedModuleJson) });
}

export async function createSavedModule(ctx: HandlerContext, body: unknown) {
  if (!ctx.userId) return unauthorized();
  const parsed = SavedModuleBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid saved module.");
  const { id, name, brandId, module } = parsed.data;
  // A saved module is valid if it would be valid as the only thing in an email of its own brand,
  // which also confirms every image in it belongs to this user.
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, { schemaVersion: 1, brandId, title: "", subject: "", modules: [module] });
  if (v.error) return v.error;
  const mine = await ctx.savedModules.list(ctx.userId);
  if (!mine.some((m) => m.id === id) && mine.length >= MAX_SAVED_MODULES) return errorResponse(409, `You can keep ${MAX_SAVED_MODULES} saved modules. Remove one first.`);
  const rec = await ctx.savedModules.create(ctx.userId, { id, name, brandId, module: v.doc.modules[0] });
  return rec ? json({ savedModule: savedModuleJson(rec) }, 201) : errorResponse(409, "That saved module id is already in use.");
}

export async function deleteSavedModule(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  return (await ctx.savedModules.remove(ctx.userId, id)) ? json({ ok: true }) : notFound();
}

/* ---------------- Templates ---------------- */

const TemplateBody = z.object({ name: z.string().trim().min(1).max(80), document: z.unknown() });

const templateJson = (r: { id: string; name: string; document: EmailDocument; createdAt: string }) => ({ id: r.id, name: r.name, document: r.document, savedAt: r.createdAt });

/** The user's own templates, plus which of the starter templates they have removed. */
export async function listTemplates(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  const [own, hidden] = await Promise.all([ctx.templates.list(ctx.userId), ctx.templates.hiddenDefaults(ctx.userId)]);
  return json({ templates: own.map(templateJson), hiddenDefaults: hidden });
}

export async function createTemplate(ctx: HandlerContext, body: unknown) {
  if (!ctx.userId) return unauthorized();
  const parsed = TemplateBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "A template needs a name and an email.");
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, parsed.data.document);
  if (v.error) return v.error;
  if ((await ctx.templates.list(ctx.userId)).length >= MAX_TEMPLATES) return errorResponse(409, `You can keep ${MAX_TEMPLATES} templates of your own. Remove one first.`);
  return json({ template: templateJson(await ctx.templates.create(ctx.userId, parsed.data.name, v.doc)) }, 201);
}

/** Deletes one of the user's templates, or hides a starter template for them. */
export async function deleteTemplate(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (DEFAULT_TEMPLATE_IDS.includes(id)) {
    await ctx.templates.hideDefault(ctx.userId, id);
    return json({ ok: true });
  }
  if (!UUID_RE.test(id)) return notFound();
  return (await ctx.templates.remove(ctx.userId, id)) ? json({ ok: true }) : notFound();
}

export async function restoreDefaultTemplates(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  await ctx.templates.restoreDefaults(ctx.userId);
  return json({ ok: true });
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

export async function listAssets(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  const rows = await ctx.assets.list(ctx.userId);
  return json({ assets: rows.map((r) => ({ id: r.id, width: r.width, height: r.height, originalFilename: r.originalFilename, createdAt: r.createdAt })) });
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
