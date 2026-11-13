import type { EmailDocument, ModuleInstance } from "@/lib/email/document";

export interface EmailRecord {
  id: string;
  ownerId: string;
  brandId: string;
  title: string;
  subject: string;
  document: EmailDocument;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type EmailSummary = Pick<EmailRecord, "id" | "brandId" | "title" | "subject" | "updatedAt">;

/** Every method is scoped to ownerId. Implementations must never return another owner's rows. */
export interface EmailRepo {
  list(ownerId: string): Promise<EmailSummary[]>;
  get(ownerId: string, id: string): Promise<EmailRecord | null>;
  create(ownerId: string, doc: EmailDocument): Promise<EmailRecord>;
  /** Optimistic concurrency: succeeds only when the stored revision equals expectedRevision. */
  update(ownerId: string, id: string, doc: EmailDocument, expectedRevision: number): Promise<EmailRecord | "not_found" | "conflict">;
  remove(ownerId: string, id: string): Promise<boolean>;
}

export interface AssetRecord {
  id: string;
  ownerId: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  originalFilename: string;
  createdAt: string;
}

export interface NewAsset {
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  originalFilename: string;
}

export interface AssetRepo {
  create(ownerId: string, asset: NewAsset): Promise<AssetRecord>;
  get(ownerId: string, id: string): Promise<AssetRecord | null>;
  read(ownerId: string, id: string): Promise<{ record: AssetRecord; data: Uint8Array } | null>;
  /** The owner's images, newest first. */
  list(ownerId: string): Promise<AssetRecord[]>;
  /** Returns the subset of ids that exist and belong to ownerId. */
  existing(ownerId: string, ids: string[]): Promise<Set<string>>;
}

export interface SavedModuleRecord {
  id: string;
  ownerId: string;
  name: string;
  brandId: string;
  module: ModuleInstance;
  createdAt: string;
}

export interface SavedModuleRepo {
  /** The owner's saved modules, newest first. */
  list(ownerId: string): Promise<SavedModuleRecord[]>;
  /** Saving the same id again is not an error; the stored copy is returned. Null when the id belongs to someone else. */
  create(ownerId: string, item: Pick<SavedModuleRecord, "id" | "name" | "brandId" | "module">): Promise<SavedModuleRecord | null>;
  remove(ownerId: string, id: string): Promise<boolean>;
}

export interface TemplateRecord {
  id: string;
  ownerId: string;
  name: string;
  document: EmailDocument;
  createdAt: string;
}

export interface TemplateRepo {
  /** The owner's own templates, newest first. */
  list(ownerId: string): Promise<TemplateRecord[]>;
  create(ownerId: string, name: string, doc: EmailDocument): Promise<TemplateRecord>;
  remove(ownerId: string, id: string): Promise<boolean>;
  /** Ids of the starter templates this owner has removed. */
  hiddenDefaults(ownerId: string): Promise<string[]>;
  hideDefault(ownerId: string, defaultId: string): Promise<void>;
  restoreDefaults(ownerId: string): Promise<void>;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
