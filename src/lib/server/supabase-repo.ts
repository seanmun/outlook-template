import "server-only";
/**
 * Supabase repositories.
 *
 * Requests run with the signed-in user's Clerk session token (Supabase
 * third-party auth), NOT a service-role key. Row Level Security and Storage
 * policies (supabase/migrations) therefore enforce ownership in the database;
 * the explicit scope filters below are defence in depth.
 *
 * Every row is either personal (workspace_id null, owner_id = the person) or
 * belongs to a team space (workspace_id = the Clerk organization id). A request
 * works in exactly one of those: see `Scope`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EmailDocument, ModuleInstance } from "@/lib/email/document";
import { PRESENCE_WINDOW_MS, type AiUsageRepo, type AssetRecord, type AssetRepo, type EmailRecord, type EmailRepo, type NewAsset, type PresenceRepo, type Scope, type SavedModuleRecord, type SavedModuleRepo, type TemplateRecord, type TemplateRepo } from "./repo";

export const ASSET_BUCKET = "email-assets";

export function supabaseForUser(getToken: () => Promise<string | null>): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken: getToken,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The two filter methods every Supabase query builder has. Declared loosely: the builders' own types are too deep to pass through a generic. */
interface Filterable {
  eq(column: string, value: string): Filterable;
  is(column: string, value: null): Filterable;
}

/** Narrows a query to the rows of one scope: the team space's, or the person's own personal rows. */
function within<Q>(query: Q, scope: Scope): Q {
  const q = query as unknown as Filterable;
  return (scope.workspaceId ? q.eq("workspace_id", scope.workspaceId) : q.eq("owner_id", scope.userId).is("workspace_id", null)) as unknown as Q;
}

/** The ownership columns for a new row in this scope. */
const ownership = (scope: Scope) => ({ owner_id: scope.userId, workspace_id: scope.workspaceId });

function fail(op: string, error: { message: string }): never {
  throw new Error(`Supabase ${op} failed: ${error.message}`);
}

/* ---------------- Emails ---------------- */

interface EmailRow {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  brand_id: string;
  title: string;
  subject: string;
  document: EmailDocument;
  revision: number;
  created_at: string;
  updated_at: string;
}

const toEmail = (r: EmailRow): EmailRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  workspaceId: r.workspace_id ?? null,
  brandId: r.brand_id,
  title: r.title,
  subject: r.subject,
  document: r.document,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SupabaseEmailRepo implements EmailRepo {
  constructor(private db: SupabaseClient) {}

  async list(scope: Scope) {
    const { data, error } = await within(this.db.from("emails").select("id, brand_id, title, subject, updated_at"), scope).order("updated_at", { ascending: false }).limit(500);
    if (error) fail("list emails", error);
    return (data ?? []).map((r) => ({ id: r.id, brandId: r.brand_id, title: r.title, subject: r.subject, updatedAt: r.updated_at }));
  }

  async get(scope: Scope, id: string) {
    const { data, error } = await within(this.db.from("emails").select("*").eq("id", id), scope).maybeSingle();
    if (error) fail("get email", error);
    return data ? toEmail(data as EmailRow) : null;
  }

  async create(scope: Scope, doc: EmailDocument) {
    const { data, error } = await this.db
      .from("emails")
      .insert({ ...ownership(scope), brand_id: doc.brandId, title: doc.title, subject: doc.subject, schema_version: doc.schemaVersion, document: doc })
      .select("*")
      .single();
    if (error) fail("create email", error);
    return toEmail(data as EmailRow);
  }

  async update(scope: Scope, id: string, doc: EmailDocument, expectedRevision: number) {
    const { data, error } = await within(
      this.db
        .from("emails")
        .update({
          brand_id: doc.brandId,
          title: doc.title,
          subject: doc.subject,
          schema_version: doc.schemaVersion,
          document: doc,
          revision: expectedRevision + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("revision", expectedRevision),
      scope,
    )
      .select("*")
      .maybeSingle();
    if (error) fail("update email", error);
    if (data) return toEmail(data as EmailRow);
    return (await this.get(scope, id)) ? ("conflict" as const) : ("not_found" as const);
  }

  async remove(scope: Scope, id: string) {
    const { data, error } = await within(this.db.from("emails").delete().eq("id", id), scope).select("id");
    if (error) fail("delete email", error);
    return (data ?? []).length > 0;
  }
}

/* ---------------- Assets ---------------- */

interface AssetRow {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  original_filename: string;
  created_at: string;
}
const toAsset = (r: AssetRow): AssetRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  workspaceId: r.workspace_id ?? null,
  storagePath: r.storage_path,
  mimeType: r.mime_type,
  byteSize: r.byte_size,
  width: r.width,
  height: r.height,
  originalFilename: r.original_filename,
  createdAt: r.created_at,
});

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

export class SupabaseAssetRepo implements AssetRepo {
  constructor(private db: SupabaseClient) {}

  async create(scope: Scope, a: NewAsset) {
    const id = crypto.randomUUID();
    // The first path segment is the team space's id, or the person's for personal images: enforced by the storage policy.
    const path = `${scope.workspaceId ?? scope.userId}/${id}.${EXT[a.mimeType] ?? "bin"}`;
    const up = await this.db.storage.from(ASSET_BUCKET).upload(path, a.data, { contentType: a.mimeType, upsert: false });
    if (up.error) fail("upload asset", up.error);
    const { data, error } = await this.db
      .from("assets")
      .insert({ id, ...ownership(scope), storage_path: path, mime_type: a.mimeType, byte_size: a.data.length, width: a.width, height: a.height, original_filename: a.originalFilename })
      .select("*")
      .single();
    if (error) {
      await this.db.storage.from(ASSET_BUCKET).remove([path]);
      fail("record asset", error);
    }
    return toAsset(data as AssetRow);
  }

  async get(scope: Scope, id: string) {
    const { data, error } = await within(this.db.from("assets").select("*").eq("id", id), scope).maybeSingle();
    if (error) fail("get asset", error);
    return data ? toAsset(data as AssetRow) : null;
  }

  async read(scope: Scope, id: string) {
    const record = await this.get(scope, id);
    if (!record) return null;
    const { data, error } = await this.db.storage.from(ASSET_BUCKET).download(record.storagePath);
    if (error || !data) return null;
    return { record, data: new Uint8Array(await data.arrayBuffer()) };
  }

  async list(scope: Scope) {
    const { data, error } = await within(this.db.from("assets").select("*"), scope).order("created_at", { ascending: false }).limit(1000);
    if (error) fail("list assets", error);
    return (data ?? []).map((r) => toAsset(r as AssetRow));
  }

  async existing(scope: Scope, ids: string[]) {
    if (ids.length === 0) return new Set<string>();
    const { data, error } = await within(this.db.from("assets").select("id").in("id", ids), scope);
    if (error) fail("check assets", error);
    return new Set((data ?? []).map((r: { id: string }) => r.id));
  }

  async remove(scope: Scope, id: string) {
    // The record goes first: once it is gone the image no longer counts against the space or shows anywhere.
    const { data, error } = await within(this.db.from("assets").delete().eq("id", id), scope).select("storage_path");
    if (error) fail("delete asset", error);
    const paths = (data ?? []).map((r: { storage_path: string }) => r.storage_path);
    if (paths.length === 0) return false;
    const gone = await this.db.storage.from(ASSET_BUCKET).remove(paths);
    // A file left behind is invisible to the person and safe to clear up later, so it does not fail the delete.
    if (gone.error) console.error("delete asset: the stored file could not be removed", gone.error.message);
    return true;
  }
}

/* ---------------- Saved modules ---------------- */

interface SavedModuleRow {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  name: string;
  brand_id: string;
  module: ModuleInstance;
  created_at: string;
}
const toSavedModule = (r: SavedModuleRow): SavedModuleRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  workspaceId: r.workspace_id ?? null,
  name: r.name,
  brandId: r.brand_id,
  module: r.module,
  createdAt: r.created_at,
});

export class SupabaseSavedModuleRepo implements SavedModuleRepo {
  constructor(private db: SupabaseClient) {}

  async list(scope: Scope) {
    const { data, error } = await within(this.db.from("saved_modules").select("*"), scope).order("created_at", { ascending: false }).limit(500);
    if (error) fail("list saved modules", error);
    return (data ?? []).map((r) => toSavedModule(r as SavedModuleRow));
  }

  async create(scope: Scope, item: Pick<SavedModuleRecord, "id" | "name" | "brandId" | "module">) {
    const { data, error } = await this.db
      .from("saved_modules")
      .insert({ id: item.id, ...ownership(scope), name: item.name, brand_id: item.brandId, module: item.module })
      .select("*")
      .single();
    if (!error) return toSavedModule(data as SavedModuleRow);
    // 23505 = the id is already stored. In this scope: return it. Anywhere else: RLS or the scope filter hides it, so this reads as null.
    if (error.code !== "23505") fail("save module", error);
    const again = await within(this.db.from("saved_modules").select("*").eq("id", item.id), scope).maybeSingle();
    if (again.error) fail("read saved module", again.error);
    return again.data ? toSavedModule(again.data as SavedModuleRow) : null;
  }

  async remove(scope: Scope, id: string) {
    const { data, error } = await within(this.db.from("saved_modules").delete().eq("id", id), scope).select("id");
    if (error) fail("delete saved module", error);
    return (data ?? []).length > 0;
  }
}

/* ---------------- Templates ---------------- */

interface TemplateRow {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  name: string;
  document: EmailDocument;
  created_at: string;
}
const toTemplate = (r: TemplateRow): TemplateRecord => ({ id: r.id, ownerId: r.owner_id, workspaceId: r.workspace_id ?? null, name: r.name, document: r.document, createdAt: r.created_at });

export class SupabaseTemplateRepo implements TemplateRepo {
  constructor(private db: SupabaseClient) {}

  async list(scope: Scope) {
    const { data, error } = await within(this.db.from("templates").select("*"), scope).order("created_at", { ascending: false }).limit(500);
    if (error) fail("list templates", error);
    return (data ?? []).map((r) => toTemplate(r as TemplateRow));
  }

  async create(scope: Scope, name: string, doc: EmailDocument) {
    const { data, error } = await this.db
      .from("templates")
      .insert({ ...ownership(scope), name, document: doc })
      .select("*")
      .single();
    if (error) fail("save template", error);
    return toTemplate(data as TemplateRow);
  }

  async remove(scope: Scope, id: string) {
    const { data, error } = await within(this.db.from("templates").delete().eq("id", id), scope).select("id");
    if (error) fail("delete template", error);
    return (data ?? []).length > 0;
  }

  async hiddenDefaults(scope: Scope) {
    const { data, error } = await within(this.db.from("hidden_starter_templates").select("default_id"), scope);
    if (error) fail("list hidden templates", error);
    // In a team space several members may each have removed the same starter template.
    return [...new Set((data ?? []).map((r: { default_id: string }) => r.default_id))];
  }

  async hideDefault(scope: Scope, defaultId: string) {
    const { error } = await this.db.from("hidden_starter_templates").insert({ ...ownership(scope), default_id: defaultId });
    // 23505 = this person already removed it here. That is the outcome asked for.
    if (error && error.code !== "23505") fail("hide template", error);
  }

  async restoreDefaults(scope: Scope) {
    const { error } = await within(this.db.from("hidden_starter_templates").delete(), scope);
    if (error) fail("restore templates", error);
  }
}

/* ---------------- Presence ---------------- */

export class SupabasePresenceRepo implements PresenceRepo {
  constructor(private db: SupabaseClient) {}

  async touch(scope: Scope & { workspaceId: string }, emailId: string, name: string) {
    const mine = { email_id: emailId, user_id: scope.userId, workspace_id: scope.workspaceId, user_name: name, seen_at: new Date().toISOString() };
    const { error } = await this.db.from("email_presence").upsert(mine, { onConflict: "email_id,user_id" });
    if (error) fail("record presence", error);
    const since = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
    const others = await this.db.from("email_presence").select("user_name").eq("email_id", emailId).eq("workspace_id", scope.workspaceId).neq("user_id", scope.userId).gt("seen_at", since);
    if (others.error) fail("read presence", others.error);
    return (others.data ?? []).map((r: { user_name: string }) => r.user_name);
  }

  async leave(scope: Scope, emailId: string) {
    const { error } = await this.db.from("email_presence").delete().eq("email_id", emailId).eq("user_id", scope.userId);
    if (error) fail("clear presence", error);
  }
}

/* ---------------- AI usage ---------------- */

export class SupabaseAiUsageRepo implements AiUsageRepo {
  constructor(private db: SupabaseClient) {}

  /** The database function counts for whoever the token belongs to; `userId` is not sent, so a count cannot be charged to someone else. */
  async take(_userId: string, dailyLimit: number) {
    const { data, error } = await this.db.rpc("use_ai_request", { daily_limit: dailyLimit });
    if (error) fail("count AI request", error);
    return typeof data === "number" ? data : -1;
  }
}
