/**
 * Request handling logic, independent of Next.js and of the concrete stores.
 * Route files resolve the user and repositories and delegate here, which keeps
 * authorization rules in one testable place.
 */
import { z } from "zod";
import { ModuleIdSchema, type EmailDocument } from "@/lib/email/document";
import { validateDocument } from "@/lib/email/registry";
import { collectImageSources } from "@/lib/email/render";
import { sampleBytes } from "@/lib/email/samples";
import { buildExportPackage, MAX_BUTTON_PICTURE_BYTES, MissingImageError, type ButtonPictureInput, type ImageLoader } from "@/lib/export/pipeline";
import { ExportFailedError, ExporterUnavailableError, type ExporterId } from "@/lib/export/types";
import { CfbTooLargeError } from "@/lib/export/cfb-writer";
import { MAX_UPLOAD_BYTES, readImageInfo } from "./image-info";
import { UUID_RE, type AiUsageRepo, type AssetRepo, type EmailRepo, type PresenceRepo, type SavedModuleRepo, type Scope, type TemplateRepo } from "./repo";
import { AI_DAILY_LIMIT, formatMb, limitsFor } from "@/lib/limits";
import { DEFAULT_TEMPLATE_IDS } from "@/lib/email/templates";
import { imageInUseMessage, imageIsUsed, usesImage, type ImageUsage } from "@/lib/image-usage";

export interface HandlerContext {
  userId: string | null;
  /** The team space the person is working in, or null for their own Library. */
  workspaceId: string | null;
  emails: EmailRepo;
  assets: AssetRepo;
  savedModules: SavedModuleRepo;
  templates: TemplateRepo;
  presence: PresenceRepo;
  aiUsage: AiUsageRepo;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function errorResponse(status: number, message: string, details?: unknown): Response {
  return json({ error: message, ...(details ? { details } : {}) }, status);
}

const unauthorized = () => errorResponse(401, "Sign in required.");

/** Whose Library this request works on. Only call once the user is known to be signed in. */
const scopeOf = (ctx: HandlerContext & { userId: string }): Scope => ({ userId: ctx.userId, workspaceId: ctx.workspaceId });
const limitsOf = (ctx: HandlerContext) => limitsFor(!!ctx.workspaceId);
const space = (ctx: HandlerContext) => (ctx.workspaceId ? "This team space" : "Your Library");
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
  const owned = await ctx.assets.existing(scopeOf(ctx), ids);
  const foreign = ids.filter((id) => !owned.has(id));
  if (foreign.length) return { error: errorResponse(400, "Document references images that do not exist or are not in this Library.", foreign) };
  return { doc: r.doc };
}

/* ---------------- Emails ---------------- */

export async function listEmails(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  return json({ emails: await ctx.emails.list(scopeOf({ ...ctx, userId: ctx.userId })) });
}

export async function createEmail(ctx: HandlerContext, body: unknown) {
  if (!ctx.userId) return unauthorized();
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, (body as { document?: unknown })?.document);
  if (v.error) return v.error;
  const scope = scopeOf({ ...ctx, userId: ctx.userId });
  const limit = limitsOf(ctx).emails;
  if ((await ctx.emails.list(scope)).length >= limit) return errorResponse(409, `${space(ctx)} can hold ${limit} emails. Delete one you no longer need first.`);
  const rec = await ctx.emails.create(scope, v.doc);
  return json({ email: rec }, 201);
}

export async function getEmail(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  const rec = await ctx.emails.get(scopeOf({ ...ctx, userId: ctx.userId }), id);
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
  const result = await ctx.emails.update(scopeOf({ ...ctx, userId: ctx.userId }), id, v.doc, parsed.data.revision);
  if (result === "not_found") return notFound();
  if (result === "conflict") return errorResponse(409, "This email was saved elsewhere (another tab?). Reload to get the latest version.");
  return json({ email: result });
}

export async function deleteEmail(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  return (await ctx.emails.remove(scopeOf({ ...ctx, userId: ctx.userId }), id)) ? json({ ok: true }) : notFound();
}

/* ---------------- AI requests per day ---------------- */

/**
 * Call before every AI request. Uses up one of the person's requests for today and answers with
 * null to go ahead, or the response to send back instead. If the count cannot be kept (the
 * database is unreachable or not set up), the request is refused: an AI that cannot be counted
 * must not run.
 */
export async function takeAiRequest(ctx: HandlerContext): Promise<Response | null> {
  if (!ctx.userId) return unauthorized();
  let left: number;
  try {
    left = await ctx.aiUsage.take(ctx.userId, AI_DAILY_LIMIT);
  } catch (e) {
    console.error("AI usage could not be counted", e);
    return errorResponse(503, "AI is not available right now. Everything else works as normal.");
  }
  if (left < 0) return errorResponse(429, `You have used today\u2019s ${AI_DAILY_LIMIT} AI requests. You get more tomorrow, and everything else still works.`);
  return null;
}

/* ---------------- Who else has a team email open ---------------- */

const PresenceBody = z.object({ name: z.string().trim().min(1).max(80) });

/** Called by the editor every few seconds while a team email is open. Answers with the teammates who also have it open. */
export async function touchPresence(ctx: HandlerContext, id: string, body: unknown) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  // Only team emails can be open by more than one person.
  if (!ctx.workspaceId) return json({ others: [] });
  const parsed = PresenceBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Expected { name }.");
  const scope = { userId: ctx.userId, workspaceId: ctx.workspaceId };
  if (!(await ctx.emails.get(scope, id))) return notFound();
  return json({ others: await ctx.presence.touch(scope, id, parsed.data.name) });
}

export async function leavePresence(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  await ctx.presence.leave(scopeOf({ ...ctx, userId: ctx.userId }), id);
  return json({ ok: true });
}

/* ---------------- Saved modules ---------------- */


const SavedModuleBody = z.object({ id: z.string().regex(UUID_RE), name: z.string().trim().min(1).max(60), brandId: z.string().min(1).max(60), module: z.unknown() });

const savedModuleJson = (r: { id: string; name: string; brandId: string; module: unknown; createdAt: string }) => ({ id: r.id, name: r.name, brandId: r.brandId, module: r.module, savedAt: r.createdAt });

export async function listSavedModules(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  return json({ savedModules: (await ctx.savedModules.list(scopeOf({ ...ctx, userId: ctx.userId }))).map(savedModuleJson) });
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
  const mine = await ctx.savedModules.list(scopeOf({ ...ctx, userId: ctx.userId }));
  const limit = limitsOf(ctx).savedBlocks;
  if (!mine.some((m) => m.id === id) && mine.length >= limit) return errorResponse(409, `${space(ctx)} can hold ${limit} saved blocks. Remove one first.`);
  const rec = await ctx.savedModules.create(scopeOf({ ...ctx, userId: ctx.userId }), { id, name, brandId, module: v.doc.modules[0] });
  return rec ? json({ savedModule: savedModuleJson(rec) }, 201) : errorResponse(409, "That saved module id is already in use.");
}

export async function deleteSavedModule(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  return (await ctx.savedModules.remove(scopeOf({ ...ctx, userId: ctx.userId }), id)) ? json({ ok: true }) : notFound();
}

/* ---------------- Templates ---------------- */

const TemplateBody = z.object({ name: z.string().trim().min(1).max(80), document: z.unknown() });

const templateJson = (r: { id: string; name: string; document: EmailDocument; createdAt: string }) => ({ id: r.id, name: r.name, document: r.document, savedAt: r.createdAt });

/** The user's own templates, plus which of the starter templates they have removed. */
export async function listTemplates(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  const [own, hidden] = await Promise.all([ctx.templates.list(scopeOf({ ...ctx, userId: ctx.userId })), ctx.templates.hiddenDefaults(scopeOf({ ...ctx, userId: ctx.userId }))]);
  return json({ templates: own.map(templateJson), hiddenDefaults: hidden });
}

export async function createTemplate(ctx: HandlerContext, body: unknown) {
  if (!ctx.userId) return unauthorized();
  const parsed = TemplateBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "A template needs a name and an email.");
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, parsed.data.document);
  if (v.error) return v.error;
  const limit = limitsOf(ctx).templates;
  if ((await ctx.templates.list(scopeOf({ ...ctx, userId: ctx.userId }))).length >= limit) return errorResponse(409, `${space(ctx)} can hold ${limit} templates of your own. Remove one first.`);
  return json({ template: templateJson(await ctx.templates.create(scopeOf({ ...ctx, userId: ctx.userId }), parsed.data.name, v.doc)) }, 201);
}

/** Deletes one of the user's templates, or hides a starter template for them. */
export async function deleteTemplate(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (DEFAULT_TEMPLATE_IDS.includes(id)) {
    await ctx.templates.hideDefault(scopeOf({ ...ctx, userId: ctx.userId }), id);
    return json({ ok: true });
  }
  if (!UUID_RE.test(id)) return notFound();
  return (await ctx.templates.remove(scopeOf({ ...ctx, userId: ctx.userId }), id)) ? json({ ok: true }) : notFound();
}

export async function restoreDefaultTemplates(ctx: HandlerContext) {
  if (!ctx.userId) return unauthorized();
  await ctx.templates.restoreDefaults(scopeOf({ ...ctx, userId: ctx.userId }));
  return json({ ok: true });
}

/* ---------------- Copy to another Library ---------------- */

/** The Library something is being copied into: the person's own, or another team space they belong to. */
export interface CopyTarget {
  scope: Scope;
  emails: EmailRepo;
  assets: AssetRepo;
  savedModules: SavedModuleRepo;
  templates: TemplateRepo;
}

const CopyBody = z.object({ kind: z.enum(["email", "template", "block", "image"]), id: z.string().min(1).max(80) });

/** Points every picture reference in an email (or one block of it) at its copy in the other Library. */
function repointImages<T>(value: T, newIds: Map<string, string>): T {
  if (Array.isArray(value)) return value.map((v) => repointImages(v, newIds)) as T;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.kind === "asset" && typeof o.assetId === "string" && newIds.has(o.assetId)) return { ...o, assetId: newIds.get(o.assetId) } as T;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, repointImages(v, newIds)])) as T;
  }
  return value;
}

/**
 * Copies one thing from the Library the person is in to another of theirs. The original stays.
 * Pictures an email, template or block uses are copied along with it, because a Library can
 * only use its own pictures. The destination's size limits apply.
 */
export async function copyToLibrary(ctx: HandlerContext, body: unknown, target: CopyTarget) {
  if (!ctx.userId) return unauthorized();
  const parsed = CopyBody.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Expected { kind, id }.");
  if (target.scope.userId !== ctx.userId) return errorResponse(403, "You can only copy into your own Library or a team space you belong to.");
  if (target.scope.workspaceId === ctx.workspaceId) return errorResponse(400, "That is the Library you are already in.");
  const from = scopeOf({ ...ctx, userId: ctx.userId });
  const { kind, id } = parsed.data;
  const limits = limitsFor(!!target.scope.workspaceId);
  const there = target.scope.workspaceId ? "That team space" : "Your Library";

  /** Copies the pictures, or answers with the reason it could not. */
  const copyImages = async (ids: string[]): Promise<Map<string, string> | Response> => {
    const newIds = new Map<string, string>();
    if (ids.length === 0) return newIds;
    let used = (await target.assets.list(target.scope)).reduce((sum, a) => sum + a.byteSize, 0);
    const pictures = [];
    for (const assetId of ids) {
      const picture = UUID_RE.test(assetId) ? await ctx.assets.read(from, assetId) : null;
      if (!picture) return errorResponse(400, "A picture this uses could not be found, so it was not copied.");
      used += picture.data.length;
      pictures.push({ assetId, picture });
    }
    // Checked before anything is written, so a copy that will not fit leaves nothing half-done behind.
    if (used > limits.imageBytes) return errorResponse(413, `${there} can hold ${formatMb(limits.imageBytes)} of pictures, and this would go over. Remove some pictures there first.`);
    for (const { assetId, picture } of pictures) {
      const r = picture.record;
      const copy = await target.assets.create(target.scope, { data: picture.data, mimeType: r.mimeType, width: r.width, height: r.height, originalFilename: r.originalFilename });
      newIds.set(assetId, copy.id);
    }
    return newIds;
  };

  if (kind === "image") {
    if (!UUID_RE.test(id)) return notFound();
    if (!(await ctx.assets.get(from, id))) return notFound();
    const copied = await copyImages([id]);
    return copied instanceof Response ? copied : json({ ok: true }, 201);
  }

  if (kind === "email") {
    const email = UUID_RE.test(id) ? await ctx.emails.get(from, id) : null;
    if (!email) return notFound();
    if ((await target.emails.list(target.scope)).length >= limits.emails) return errorResponse(409, `${there} can hold ${limits.emails} emails and is full.`);
    const copied = await copyImages(assetIdsIn(email.document));
    if (copied instanceof Response) return copied;
    await target.emails.create(target.scope, repointImages(email.document, copied));
    return json({ ok: true }, 201);
  }

  if (kind === "template") {
    const template = (await ctx.templates.list(from)).find((t) => t.id === id);
    if (!template) return notFound();
    if ((await target.templates.list(target.scope)).length >= limits.templates) return errorResponse(409, `${there} can hold ${limits.templates} templates of its own and is full.`);
    const copied = await copyImages(assetIdsIn(template.document));
    if (copied instanceof Response) return copied;
    await target.templates.create(target.scope, template.name, repointImages(template.document, copied));
    return json({ ok: true }, 201);
  }

  const block = (await ctx.savedModules.list(from)).find((b) => b.id === id);
  if (!block) return notFound();
  if ((await target.savedModules.list(target.scope)).length >= limits.savedBlocks) return errorResponse(409, `${there} can hold ${limits.savedBlocks} saved blocks and is full.`);
  const asDoc: EmailDocument = { schemaVersion: 1, brandId: block.brandId, title: "", subject: "", modules: [block.module] };
  const copied = await copyImages(assetIdsIn(asDoc));
  if (copied instanceof Response) return copied;
  // A new id: the same block can then live in both Libraries.
  await target.savedModules.create(target.scope, { id: crypto.randomUUID(), name: block.name, brandId: block.brandId, module: repointImages(block.module, copied) });
  return json({ ok: true }, 201);
}

/* ---------------- Assets ---------------- */

export async function uploadAsset(ctx: HandlerContext, file: { data: Uint8Array; name: string } | null) {
  if (!ctx.userId) return unauthorized();
  if (!file) return errorResponse(400, "No file uploaded.");
  if (file.data.length > MAX_UPLOAD_BYTES) return errorResponse(413, `Images must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`);
  const info = readImageInfo(file.data);
  if (!info) return errorResponse(415, "Only PNG, JPEG or GIF images up to 6000px are supported.");
  const scope = scopeOf({ ...ctx, userId: ctx.userId });
  const limit = limitsOf(ctx).imageBytes;
  const used = (await ctx.assets.list(scope)).reduce((sum, a) => sum + a.byteSize, 0);
  if (used + file.data.length > limit) {
    return errorResponse(413, `${space(ctx)} can hold ${formatMb(limit)} of pictures and has ${formatMb(Math.max(0, limit - used))} left. Use a smaller picture.`);
  }
  const rec = await ctx.assets.create(scope, {
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
  const rows = await ctx.assets.list(scopeOf({ ...ctx, userId: ctx.userId }));
  return json({ assets: rows.map((r) => ({ id: r.id, width: r.width, height: r.height, byteSize: r.byteSize, originalFilename: r.originalFilename, createdAt: r.createdAt })) });
}

/** Every email, template and saved block in this space that still holds the picture. */
async function whereImageIsUsed(ctx: HandlerContext, scope: Scope, assetId: string): Promise<ImageUsage> {
  const [summaries, templates, blocks] = await Promise.all([ctx.emails.list(scope), ctx.templates.list(scope), ctx.savedModules.list(scope)]);
  const emails: string[] = [];
  // Emails are read a few at a time so a full team space does not open hundreds of connections at once.
  for (let i = 0; i < summaries.length; i += 20) {
    const batch = await Promise.all(summaries.slice(i, i + 20).map((e) => ctx.emails.get(scope, e.id)));
    for (const e of batch) if (e && usesImage(e.document, assetId)) emails.push(e.title || "Untitled email");
  }
  return {
    emails,
    templates: templates.filter((t) => usesImage(t.document, assetId)).map((t) => t.name),
    blocks: blocks.filter((b) => usesImage(b.module, assetId)).map((b) => b.name),
  };
}

/** Deletes an image from the Library. Refused while anything still uses it, so no email is left with a missing picture. */
export async function deleteAsset(ctx: HandlerContext, id: string) {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  const scope = scopeOf({ ...ctx, userId: ctx.userId });
  if (!(await ctx.assets.get(scope, id))) return notFound();
  const usage = await whereImageIsUsed(ctx, scope, id);
  if (imageIsUsed(usage)) return errorResponse(409, imageInUseMessage(usage), usage);
  return (await ctx.assets.remove(scope, id)) ? json({ ok: true }) : notFound();
}

export async function readAsset(ctx: HandlerContext, id: string): Promise<Response> {
  if (!ctx.userId) return unauthorized();
  if (!UUID_RE.test(id)) return notFound();
  const r = await ctx.assets.read(scopeOf({ ...ctx, userId: ctx.userId }), id);
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

/** Pictures of rounded buttons, drawn in the browser and posted with a download request. */
const ButtonPicturesSchema = z
  .record(ModuleIdSchema, z.object({ png: z.string().max(Math.ceil((MAX_BUTTON_PICTURE_BYTES * 4) / 3) + 8), width: z.number().int(), height: z.number().int() }))
  .refine((r) => Object.keys(r).length <= 60)
  .optional();

/** Anything malformed is dropped: the button then falls back to the code-drawn one instead of failing the download. */
function readButtonPictures(raw: unknown): Record<string, ButtonPictureInput> {
  const parsed = ButtonPicturesSchema.safeParse(raw);
  const out: Record<string, ButtonPictureInput> = {};
  if (!parsed.success || !parsed.data) return out;
  for (const [id, p] of Object.entries(parsed.data)) {
    if (!/^[A-Za-z0-9+/]+=*$/.test(p.png)) continue;
    out[id] = { data: new Uint8Array(Buffer.from(p.png, "base64")), width: p.width, height: p.height };
  }
  return out;
}

async function runExport(doc: EmailDocument, formats: ExporterId[], loadImage: ImageLoader, buttonPictures?: Record<string, ButtonPictureInput>): Promise<Response> {
  try {
    const pkg = await buildExportPackage({ doc, formats, loadImage, buttonPictures });
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
  const b = body as { document?: unknown; formats?: unknown; buttonPictures?: unknown };
  const formats = FormatsSchema.safeParse(b?.formats);
  if (!formats.success) return errorResponse(400, "Unknown or missing export formats.");
  const v = await validateOwnedDocument({ ...ctx, userId: ctx.userId }, b?.document);
  if (v.error) return v.error;
  const scope = scopeOf({ ...ctx, userId: ctx.userId });
  return runExport(v.doc, formats.data, async (src) => {
    if (src.kind === "sample") {
      const data = sampleBytes(src.sampleId);
      return data ? { data } : null;
    }
    const r = await ctx.assets.read(scope, src.assetId);
    return r ? { data: r.data } : null;
  }, readButtonPictures(b?.buttonPictures));
}

const DemoExportBody = z.object({
  document: z.unknown(),
  formats: FormatsSchema,
  /** Demo mode only: images live in the browser, so bytes are posted with the request. */
  localImages: z.record(z.string().regex(/^local_[A-Za-z0-9_-]{6,40}$/), z.string().max(8_000_000)).default({}),
  buttonPictures: z.unknown().optional(),
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
  }, readButtonPictures(parsed.data.buttonPictures));
}
