import type { EmailDocument, ModuleInstance } from "@/lib/email/document";

/**
 * Whose Library a request works on: the signed-in person's own (`workspaceId` null), or the team
 * space they are currently in. `userId` is always the person making the request.
 */
export interface Scope {
  userId: string;
  workspaceId: string | null;
}

export interface EmailRecord {
  id: string;
  /** The person who created it. */
  ownerId: string;
  /** The team space it belongs to, or null for the owner's personal Library. */
  workspaceId: string | null;
  brandId: string;
  title: string;
  subject: string;
  document: EmailDocument;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type EmailSummary = Pick<EmailRecord, "id" | "brandId" | "title" | "subject" | "updatedAt">;

/** Every method works inside one scope. Implementations must never return or change rows outside it. */
export interface EmailRepo {
  list(scope: Scope): Promise<EmailSummary[]>;
  get(scope: Scope, id: string): Promise<EmailRecord | null>;
  create(scope: Scope, doc: EmailDocument): Promise<EmailRecord>;
  /** Optimistic concurrency: succeeds only when the stored revision equals expectedRevision. */
  update(scope: Scope, id: string, doc: EmailDocument, expectedRevision: number): Promise<EmailRecord | "not_found" | "conflict">;
  remove(scope: Scope, id: string): Promise<boolean>;
}

export interface AssetRecord {
  id: string;
  ownerId: string;
  workspaceId: string | null;
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
  create(scope: Scope, asset: NewAsset): Promise<AssetRecord>;
  get(scope: Scope, id: string): Promise<AssetRecord | null>;
  read(scope: Scope, id: string): Promise<{ record: AssetRecord; data: Uint8Array } | null>;
  /** The owner's images, newest first. */
  list(scope: Scope): Promise<AssetRecord[]>;
  /** Returns the subset of ids that exist in this scope. */
  existing(scope: Scope, ids: string[]): Promise<Set<string>>;
}

export interface SavedModuleRecord {
  id: string;
  ownerId: string;
  workspaceId: string | null;
  name: string;
  brandId: string;
  module: ModuleInstance;
  createdAt: string;
}

export interface SavedModuleRepo {
  /** The owner's saved modules, newest first. */
  list(scope: Scope): Promise<SavedModuleRecord[]>;
  /** Saving the same id again is not an error; the stored copy is returned. Null when the id is taken outside this scope. */
  create(scope: Scope, item: Pick<SavedModuleRecord, "id" | "name" | "brandId" | "module">): Promise<SavedModuleRecord | null>;
  remove(scope: Scope, id: string): Promise<boolean>;
}

export interface TemplateRecord {
  id: string;
  ownerId: string;
  workspaceId: string | null;
  name: string;
  document: EmailDocument;
  createdAt: string;
}

export interface TemplateRepo {
  /** The owner's own templates, newest first. */
  list(scope: Scope): Promise<TemplateRecord[]>;
  create(scope: Scope, name: string, doc: EmailDocument): Promise<TemplateRecord>;
  remove(scope: Scope, id: string): Promise<boolean>;
  /** Ids of the starter templates this owner has removed. */
  hiddenDefaults(scope: Scope): Promise<string[]>;
  hideDefault(scope: Scope, defaultId: string): Promise<void>;
  restoreDefaults(scope: Scope): Promise<void>;
}

/** Counts each person's AI requests for the day, so there is a ceiling on what the AI can cost. */
export interface AiUsageRepo {
  /** Uses up one request for this person. Returns how many are left today, or -1 if they had none left. */
  take(userId: string, dailyLimit: number): Promise<number>;
}

/** Who has a team email open right now, so a second person can be told before they both edit it. */
export interface PresenceRepo {
  /** Records that this person has the email open, and returns the names of teammates who also do. */
  touch(scope: Scope & { workspaceId: string }, emailId: string, name: string): Promise<string[]>;
  leave(scope: Scope, emailId: string): Promise<void>;
}

/** A teammate counts as "in the email" if they were seen this recently. The editor checks in more often than this. */
export const PRESENCE_WINDOW_MS = 45_000;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
