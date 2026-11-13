/** In-memory repositories with the same ownership semantics as the Supabase RLS policies. Used by tests. */
import type { EmailDocument } from "@/lib/email/document";
import type { AssetRecord, AssetRepo, EmailRecord, EmailRepo, NewAsset, SavedModuleRecord, SavedModuleRepo, TemplateRecord, TemplateRepo } from "./repo";

export class MemoryEmailRepo implements EmailRepo {
  rows = new Map<string, EmailRecord>();
  async list(ownerId: string) {
    return [...this.rows.values()].filter((r) => r.ownerId === ownerId).map(({ id, brandId, title, subject, updatedAt }) => ({ id, brandId, title, subject, updatedAt }));
  }
  async get(ownerId: string, id: string) {
    const r = this.rows.get(id);
    return r && r.ownerId === ownerId ? structuredClone(r) : null;
  }
  async create(ownerId: string, doc: EmailDocument) {
    const now = new Date().toISOString();
    const rec: EmailRecord = { id: crypto.randomUUID(), ownerId, brandId: doc.brandId, title: doc.title, subject: doc.subject, document: doc, revision: 1, createdAt: now, updatedAt: now };
    this.rows.set(rec.id, rec);
    return structuredClone(rec);
  }
  async update(ownerId: string, id: string, doc: EmailDocument, expectedRevision: number) {
    const r = this.rows.get(id);
    if (!r || r.ownerId !== ownerId) return "not_found" as const;
    if (r.revision !== expectedRevision) return "conflict" as const;
    const next = { ...r, document: doc, brandId: doc.brandId, title: doc.title, subject: doc.subject, revision: r.revision + 1, updatedAt: new Date().toISOString() };
    this.rows.set(id, next);
    return structuredClone(next);
  }
  async remove(ownerId: string, id: string) {
    const r = this.rows.get(id);
    if (!r || r.ownerId !== ownerId) return false;
    return this.rows.delete(id);
  }
}

export class MemoryAssetRepo implements AssetRepo {
  rows = new Map<string, { record: AssetRecord; data: Uint8Array }>();
  async create(ownerId: string, a: NewAsset) {
    const id = crypto.randomUUID();
    const record: AssetRecord = { id, ownerId, storagePath: `${ownerId}/${id}`, mimeType: a.mimeType, byteSize: a.data.length, width: a.width, height: a.height, originalFilename: a.originalFilename, createdAt: new Date().toISOString() };
    this.rows.set(id, { record, data: a.data });
    return record;
  }
  async get(ownerId: string, id: string) {
    const r = this.rows.get(id);
    return r && r.record.ownerId === ownerId ? r.record : null;
  }
  async read(ownerId: string, id: string) {
    const r = this.rows.get(id);
    return r && r.record.ownerId === ownerId ? r : null;
  }
  async list(ownerId: string) {
    return [...this.rows.values()].map((r) => r.record).filter((r) => r.ownerId === ownerId).reverse();
  }
  async existing(ownerId: string, ids: string[]) {
    return new Set(ids.filter((id) => this.rows.get(id)?.record.ownerId === ownerId));
  }
}

export class MemorySavedModuleRepo implements SavedModuleRepo {
  rows = new Map<string, SavedModuleRecord>();
  async list(ownerId: string) {
    return [...this.rows.values()].filter((r) => r.ownerId === ownerId).reverse();
  }
  async create(ownerId: string, item: Pick<SavedModuleRecord, "id" | "name" | "brandId" | "module">) {
    const existing = this.rows.get(item.id);
    if (existing) return existing.ownerId === ownerId ? structuredClone(existing) : null;
    const rec: SavedModuleRecord = { ...structuredClone(item), ownerId, createdAt: new Date().toISOString() };
    this.rows.set(rec.id, rec);
    return structuredClone(rec);
  }
  async remove(ownerId: string, id: string) {
    const r = this.rows.get(id);
    if (!r || r.ownerId !== ownerId) return false;
    return this.rows.delete(id);
  }
}

export class MemoryTemplateRepo implements TemplateRepo {
  rows = new Map<string, TemplateRecord>();
  hidden = new Map<string, Set<string>>();
  async list(ownerId: string) {
    return [...this.rows.values()].filter((r) => r.ownerId === ownerId).reverse();
  }
  async create(ownerId: string, name: string, doc: EmailDocument) {
    const rec: TemplateRecord = { id: crypto.randomUUID(), ownerId, name, document: structuredClone(doc), createdAt: new Date().toISOString() };
    this.rows.set(rec.id, rec);
    return structuredClone(rec);
  }
  async remove(ownerId: string, id: string) {
    const r = this.rows.get(id);
    if (!r || r.ownerId !== ownerId) return false;
    return this.rows.delete(id);
  }
  async hiddenDefaults(ownerId: string) {
    return [...(this.hidden.get(ownerId) ?? [])];
  }
  async hideDefault(ownerId: string, defaultId: string) {
    this.hidden.set(ownerId, (this.hidden.get(ownerId) ?? new Set()).add(defaultId));
  }
  async restoreDefaults(ownerId: string) {
    this.hidden.delete(ownerId);
  }
}
