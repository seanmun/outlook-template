/** In-memory repositories with the same ownership semantics as the Supabase RLS policies. Used by tests. */
import type { EmailDocument } from "@/lib/email/document";
import { PRESENCE_WINDOW_MS, type AiUsageRepo, type AssetRecord, type AssetRepo, type EmailRecord, type EmailRepo, type NewAsset, type PresenceRepo, type Scope, type SavedModuleRecord, type SavedModuleRepo, type TemplateRecord, type TemplateRepo } from "./repo";

/** The rule every table follows: a team space's rows belong to the team; personal rows belong to their owner. */
const inScope = (scope: Scope, r: { ownerId: string; workspaceId: string | null }) =>
  scope.workspaceId ? r.workspaceId === scope.workspaceId : r.workspaceId === null && r.ownerId === scope.userId;

export class MemoryEmailRepo implements EmailRepo {
  rows = new Map<string, EmailRecord>();
  async list(scope: Scope) {
    return [...this.rows.values()].filter((r) => inScope(scope, r)).map(({ id, brandId, title, subject, updatedAt }) => ({ id, brandId, title, subject, updatedAt }));
  }
  async get(scope: Scope, id: string) {
    const r = this.rows.get(id);
    return r && inScope(scope, r) ? structuredClone(r) : null;
  }
  async create(scope: Scope, doc: EmailDocument) {
    const now = new Date().toISOString();
    const rec: EmailRecord = {
      id: crypto.randomUUID(),
      ownerId: scope.userId,
      workspaceId: scope.workspaceId,
      brandId: doc.brandId,
      title: doc.title,
      subject: doc.subject,
      document: doc,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(rec.id, rec);
    return structuredClone(rec);
  }
  async update(scope: Scope, id: string, doc: EmailDocument, expectedRevision: number) {
    const r = this.rows.get(id);
    if (!r || !inScope(scope, r)) return "not_found" as const;
    if (r.revision !== expectedRevision) return "conflict" as const;
    const next = { ...r, document: doc, brandId: doc.brandId, title: doc.title, subject: doc.subject, revision: r.revision + 1, updatedAt: new Date().toISOString() };
    this.rows.set(id, next);
    return structuredClone(next);
  }
  async remove(scope: Scope, id: string) {
    const r = this.rows.get(id);
    if (!r || !inScope(scope, r)) return false;
    return this.rows.delete(id);
  }
}

export class MemoryAssetRepo implements AssetRepo {
  rows = new Map<string, { record: AssetRecord; data: Uint8Array }>();
  async create(scope: Scope, a: NewAsset) {
    const id = crypto.randomUUID();
    const record: AssetRecord = {
      id,
      ownerId: scope.userId,
      workspaceId: scope.workspaceId,
      storagePath: `${scope.workspaceId ?? scope.userId}/${id}`,
      mimeType: a.mimeType,
      byteSize: a.data.length,
      width: a.width,
      height: a.height,
      originalFilename: a.originalFilename,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(id, { record, data: a.data });
    return record;
  }
  async get(scope: Scope, id: string) {
    const r = this.rows.get(id);
    return r && inScope(scope, r.record) ? r.record : null;
  }
  async read(scope: Scope, id: string) {
    const r = this.rows.get(id);
    return r && inScope(scope, r.record) ? r : null;
  }
  async list(scope: Scope) {
    return [...this.rows.values()]
      .map((r) => r.record)
      .filter((r) => inScope(scope, r))
      .reverse();
  }
  async existing(scope: Scope, ids: string[]) {
    return new Set(
      ids.filter((id) => {
        const r = this.rows.get(id);
        return !!r && inScope(scope, r.record);
      }),
    );
  }
  async remove(scope: Scope, id: string) {
    const r = this.rows.get(id);
    if (!r || !inScope(scope, r.record)) return false;
    this.rows.delete(id);
    return true;
  }
}

export class MemorySavedModuleRepo implements SavedModuleRepo {
  rows = new Map<string, SavedModuleRecord>();
  async list(scope: Scope) {
    return [...this.rows.values()].filter((r) => inScope(scope, r)).reverse();
  }
  async create(scope: Scope, item: Pick<SavedModuleRecord, "id" | "name" | "brandId" | "module">) {
    const existing = this.rows.get(item.id);
    if (existing) return inScope(scope, existing) ? structuredClone(existing) : null;
    const rec: SavedModuleRecord = { ...structuredClone(item), ownerId: scope.userId, workspaceId: scope.workspaceId, createdAt: new Date().toISOString() };
    this.rows.set(rec.id, rec);
    return structuredClone(rec);
  }
  async remove(scope: Scope, id: string) {
    const r = this.rows.get(id);
    if (!r || !inScope(scope, r)) return false;
    return this.rows.delete(id);
  }
}

export class MemoryTemplateRepo implements TemplateRepo {
  rows = new Map<string, TemplateRecord>();
  /** Starter templates removed, keyed by the space they were removed in. */
  hidden = new Map<string, Set<string>>();
  private key = (scope: Scope) => scope.workspaceId ?? `user:${scope.userId}`;
  async list(scope: Scope) {
    return [...this.rows.values()].filter((r) => inScope(scope, r)).reverse();
  }
  async create(scope: Scope, name: string, doc: EmailDocument) {
    const rec: TemplateRecord = { id: crypto.randomUUID(), ownerId: scope.userId, workspaceId: scope.workspaceId, name, document: structuredClone(doc), createdAt: new Date().toISOString() };
    this.rows.set(rec.id, rec);
    return structuredClone(rec);
  }
  async remove(scope: Scope, id: string) {
    const r = this.rows.get(id);
    if (!r || !inScope(scope, r)) return false;
    return this.rows.delete(id);
  }
  async hiddenDefaults(scope: Scope) {
    return [...(this.hidden.get(this.key(scope)) ?? [])];
  }
  async hideDefault(scope: Scope, defaultId: string) {
    this.hidden.set(this.key(scope), (this.hidden.get(this.key(scope)) ?? new Set()).add(defaultId));
  }
  async restoreDefaults(scope: Scope) {
    this.hidden.delete(this.key(scope));
  }
}

export class MemoryPresenceRepo implements PresenceRepo {
  rows = new Map<string, { emailId: string; userId: string; workspaceId: string; name: string; seenAt: number }>();
  /** Tests move this forward to check that people drop off after a while. */
  now = () => Date.now();
  async touch(scope: Scope & { workspaceId: string }, emailId: string, name: string) {
    this.rows.set(`${emailId}:${scope.userId}`, { emailId, userId: scope.userId, workspaceId: scope.workspaceId, name, seenAt: this.now() });
    return [...this.rows.values()]
      .filter((r) => r.emailId === emailId && r.workspaceId === scope.workspaceId && r.userId !== scope.userId && this.now() - r.seenAt < PRESENCE_WINDOW_MS)
      .map((r) => r.name);
  }
  async leave(scope: Scope, emailId: string) {
    this.rows.delete(`${emailId}:${scope.userId}`);
  }
}

export class MemoryAiUsageRepo implements AiUsageRepo {
  used = new Map<string, number>();
  async take(userId: string, dailyLimit: number) {
    const n = this.used.get(userId) ?? 0;
    if (n >= dailyLimit) return -1;
    this.used.set(userId, n + 1);
    return dailyLimit - n - 1;
  }
}
