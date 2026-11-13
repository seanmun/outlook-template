import "server-only";
/**
 * Supabase repositories.
 *
 * Requests run with the signed-in user's Clerk session token (Supabase
 * third-party auth), NOT a service-role key. Row Level Security and Storage
 * policies (supabase/migrations) therefore enforce ownership in the database;
 * the explicit owner_id filters below are defence in depth.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EmailDocument, ModuleInstance } from "@/lib/email/document";
import type { AssetRecord, AssetRepo, EmailRecord, EmailRepo, NewAsset, SavedModuleRecord, SavedModuleRepo, TemplateRecord, TemplateRepo } from "./repo";

export const ASSET_BUCKET = "email-assets";

export function supabaseForUser(getToken: () => Promise<string | null>): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken: getToken,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface EmailRow {
  id: string;
  owner_id: string;
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
  brandId: r.brand_id,
  title: r.title,
  subject: r.subject,
  document: r.document,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function fail(op: string, error: { message: string }): never {
  throw new Error(`Supabase ${op} failed: ${error.message}`);
}

export class SupabaseEmailRepo implements EmailRepo {
  constructor(private db: SupabaseClient) {}

  async list(ownerId: string) {
    const { data, error } = await this.db
      .from("emails")
      .select("id, brand_id, title, subject, updated_at")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) fail("list emails", error);
    return (data ?? []).map((r) => ({ id: r.id, brandId: r.brand_id, title: r.title, subject: r.subject, updatedAt: r.updated_at }));
  }

  async get(ownerId: string, id: string) {
    const { data, error } = await this.db.from("emails").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
    if (error) fail("get email", error);
    return data ? toEmail(data as EmailRow) : null;
  }

  async create(ownerId: string, doc: EmailDocument) {
    const { data, error } = await this.db
      .from("emails")
      .insert({ owner_id: ownerId, brand_id: doc.brandId, title: doc.title, subject: doc.subject, schema_version: doc.schemaVersion, document: doc })
      .select("*")
      .single();
    if (error) fail("create email", error);
    return toEmail(data as EmailRow);
  }

  async update(ownerId: string, id: string, doc: EmailDocument, expectedRevision: number) {
    const { data, error } = await this.db
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
      .eq("owner_id", ownerId)
      .eq("revision", expectedRevision)
      .select("*")
      .maybeSingle();
    if (error) fail("update email", error);
    if (data) return toEmail(data as EmailRow);
    return (await this.get(ownerId, id)) ? ("conflict" as const) : ("not_found" as const);
  }

  async remove(ownerId: string, id: string) {
    const { data, error } = await this.db.from("emails").delete().eq("id", id).eq("owner_id", ownerId).select("id");
    if (error) fail("delete email", error);
    return (data ?? []).length > 0;
  }
}

interface AssetRow {
  id: string;
  owner_id: string;
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

  async create(ownerId: string, a: NewAsset) {
    const id = crypto.randomUUID();
    // First path segment must equal the user id: enforced by the storage policy.
    const path = `${ownerId}/${id}.${EXT[a.mimeType] ?? "bin"}`;
    const up = await this.db.storage.from(ASSET_BUCKET).upload(path, a.data, { contentType: a.mimeType, upsert: false });
    if (up.error) fail("upload asset", up.error);
    const { data, error } = await this.db
      .from("assets")
      .insert({ id, owner_id: ownerId, storage_path: path, mime_type: a.mimeType, byte_size: a.data.length, width: a.width, height: a.height, original_filename: a.originalFilename })
      .select("*")
      .single();
    if (error) {
      await this.db.storage.from(ASSET_BUCKET).remove([path]);
      fail("record asset", error);
    }
    return toAsset(data as AssetRow);
  }

  async get(ownerId: string, id: string) {
    const { data, error } = await this.db.from("assets").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
    if (error) fail("get asset", error);
    return data ? toAsset(data as AssetRow) : null;
  }

  async read(ownerId: string, id: string) {
    const record = await this.get(ownerId, id);
    if (!record) return null;
    const { data, error } = await this.db.storage.from(ASSET_BUCKET).download(record.storagePath);
    if (error || !data) return null;
    return { record, data: new Uint8Array(await data.arrayBuffer()) };
  }

  async list(ownerId: string) {
    const { data, error } = await this.db.from("assets").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(500);
    if (error) fail("list assets", error);
    return (data ?? []).map((r) => toAsset(r as AssetRow));
  }

  async existing(ownerId: string, ids: string[]) {
    if (ids.length === 0) return new Set<string>();
    const { data, error } = await this.db.from("assets").select("id").in("id", ids).eq("owner_id", ownerId);
    if (error) fail("check assets", error);
    return new Set((data ?? []).map((r: { id: string }) => r.id));
  }
}

interface SavedModuleRow {
  id: string;
  owner_id: string;
  name: string;
  brand_id: string;
  module: ModuleInstance;
  created_at: string;
}
const toSavedModule = (r: SavedModuleRow): SavedModuleRecord => ({ id: r.id, ownerId: r.owner_id, name: r.name, brandId: r.brand_id, module: r.module, createdAt: r.created_at });

export class SupabaseSavedModuleRepo implements SavedModuleRepo {
  constructor(private db: SupabaseClient) {}

  async list(ownerId: string) {
    const { data, error } = await this.db.from("saved_modules").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(200);
    if (error) fail("list saved modules", error);
    return (data ?? []).map((r) => toSavedModule(r as SavedModuleRow));
  }

  async create(ownerId: string, item: Pick<SavedModuleRecord, "id" | "name" | "brandId" | "module">) {
    const { data, error } = await this.db
      .from("saved_modules")
      .insert({ id: item.id, owner_id: ownerId, name: item.name, brand_id: item.brandId, module: item.module })
      .select("*")
      .single();
    if (!error) return toSavedModule(data as SavedModuleRow);
    // 23505 = the id is already stored. Ours: return it. Someone else's: RLS hides it, so this reads as null.
    if (error.code !== "23505") fail("save module", error);
    const again = await this.db.from("saved_modules").select("*").eq("id", item.id).eq("owner_id", ownerId).maybeSingle();
    if (again.error) fail("read saved module", again.error);
    return again.data ? toSavedModule(again.data as SavedModuleRow) : null;
  }

  async remove(ownerId: string, id: string) {
    const { data, error } = await this.db.from("saved_modules").delete().eq("id", id).eq("owner_id", ownerId).select("id");
    if (error) fail("delete saved module", error);
    return (data ?? []).length > 0;
  }
}

interface TemplateRow {
  id: string;
  owner_id: string;
  name: string;
  document: EmailDocument;
  created_at: string;
}
const toTemplate = (r: TemplateRow): TemplateRecord => ({ id: r.id, ownerId: r.owner_id, name: r.name, document: r.document, createdAt: r.created_at });

export class SupabaseTemplateRepo implements TemplateRepo {
  constructor(private db: SupabaseClient) {}

  async list(ownerId: string) {
    const { data, error } = await this.db.from("templates").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(200);
    if (error) fail("list templates", error);
    return (data ?? []).map((r) => toTemplate(r as TemplateRow));
  }

  async create(ownerId: string, name: string, doc: EmailDocument) {
    const { data, error } = await this.db.from("templates").insert({ owner_id: ownerId, name, document: doc }).select("*").single();
    if (error) fail("save template", error);
    return toTemplate(data as TemplateRow);
  }

  async remove(ownerId: string, id: string) {
    const { data, error } = await this.db.from("templates").delete().eq("id", id).eq("owner_id", ownerId).select("id");
    if (error) fail("delete template", error);
    return (data ?? []).length > 0;
  }

  async hiddenDefaults(ownerId: string) {
    const { data, error } = await this.db.from("hidden_default_templates").select("default_id").eq("owner_id", ownerId);
    if (error) fail("list hidden templates", error);
    return (data ?? []).map((r: { default_id: string }) => r.default_id);
  }

  async hideDefault(ownerId: string, defaultId: string) {
    const { error } = await this.db.from("hidden_default_templates").upsert({ owner_id: ownerId, default_id: defaultId }, { onConflict: "owner_id,default_id", ignoreDuplicates: true });
    if (error) fail("hide template", error);
  }

  async restoreDefaults(ownerId: string) {
    const { error } = await this.db.from("hidden_default_templates").delete().eq("owner_id", ownerId);
    if (error) fail("restore templates", error);
  }
}
