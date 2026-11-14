"use client";
/**
 * Client persistence. Production talks to the authenticated API routes; demo
 * mode keeps drafts in localStorage and images in IndexedDB, in this browser only.
 */
import type { EmailDocument } from "@/lib/email/document";
import type { ImageSource } from "@/lib/email/fields";
import { collectImageSources } from "@/lib/email/render";
import { validateDocument } from "@/lib/email/registry";
import { sampleDataUrl } from "@/lib/email/samples";
import { DEFAULT_TEMPLATE_IDS, MAX_TEMPLATES, visibleTemplates, type Template } from "@/lib/email/templates";
import { imageInUseMessage, imageIsUsed, usesImage, type ImageUsage } from "@/lib/image-usage";

export interface DraftSummary {
  id: string;
  brandId: string;
  title: string;
  subject: string;
  updatedAt: string;
}
export interface Draft extends DraftSummary {
  document: EmailDocument;
  revision: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  }
  return res.json() as Promise<T>;
}

export interface DraftStore {
  list(): Promise<DraftSummary[]>;
  get(id: string): Promise<Draft | null>;
  create(doc: EmailDocument): Promise<Draft>;
  /** Throws ApiError(409) on revision conflict. */
  update(id: string, doc: EmailDocument, revision: number): Promise<Draft>;
  remove(id: string): Promise<void>;
}

export interface UploadedImage {
  src: ImageSource;
  width: number;
  height: number;
}

/** An image the user uploaded earlier, ready to drop into any email. */
export interface LibraryImage extends UploadedImage {
  /** File size in bytes, for showing how full the Library is. */
  bytes: number;
  name: string;
  thumbUrl: string;
}

export interface AssetClient {
  upload(file: File): Promise<UploadedImage>;
  /** Every image this user has uploaded, newest first. */
  list(): Promise<LibraryImage[]>;
  /** Synchronous URL for the preview iframe, or null if not loaded yet. */
  previewUrl(src: ImageSource): string | null;
  /** Ensures preview URLs for these sources are available; resolves when loaded. */
  preload(sources: ImageSource[]): Promise<void>;
  /** Deletes an uploaded image. Throws ApiError(409), saying where, while anything still uses it. */
  remove(assetId: string): Promise<void>;
}

/* ---------------- Production ---------------- */

type ApiEmail = { id: string; brandId: string; title: string; subject: string; updatedAt: string; document: EmailDocument; revision: number };

export const apiDraftStore: DraftStore = {
  async list() {
    return (await api<{ emails: DraftSummary[] }>("/api/emails")).emails;
  },
  async get(id) {
    try {
      return (await api<{ email: ApiEmail }>(`/api/emails/${encodeURIComponent(id)}`)).email;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  async create(document) {
    return (await api<{ email: ApiEmail }>("/api/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document }) })).email;
  },
  async update(id, document, revision) {
    return (
      await api<{ email: ApiEmail }>(`/api/emails/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, revision }),
      })
    ).email;
  },
  async remove(id) {
    await api(`/api/emails/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const apiAssetClient: AssetClient = {
  async upload(file) {
    const form = new FormData();
    form.append("file", file);
    const { asset } = await api<{ asset: { id: string; width: number; height: number } }>("/api/assets", { method: "POST", body: form });
    return { src: { kind: "asset", assetId: asset.id }, width: asset.width, height: asset.height };
  },
  async list() {
    const { assets } = await api<{ assets: { id: string; width: number; height: number; byteSize?: number; originalFilename: string }[] }>("/api/assets");
    return assets.map((a) => ({ src: { kind: "asset" as const, assetId: a.id }, width: a.width, height: a.height, bytes: a.byteSize ?? 0, name: a.originalFilename, thumbUrl: `/api/assets/${encodeURIComponent(a.id)}` }));
  },
  previewUrl(src) {
    return src.kind === "sample" ? sampleDataUrl(src.sampleId) : `/api/assets/${encodeURIComponent(src.assetId)}`;
  },
  async preload() {},
  async remove(assetId) {
    await api(`/api/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
  },
};

/* ---------------- Demo (browser-local) ---------------- */

const TEMPLATES_KEY = "otb.templates.v1";
const HIDDEN_TEMPLATES_KEY = "otb.templates.hidden.v1";

const LS_KEY = "otb.demo.drafts.v1";

function readAll(): Record<string, Draft> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Record<string, Draft>;
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, Draft>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    throw new ApiError(507, "Browser storage is full or unavailable. Demo drafts could not be saved.");
  }
}

export const localDraftStore: DraftStore = {
  async list() {
    return Object.values(readAll())
      .map(({ id, brandId, title, subject, updatedAt }) => ({ id, brandId, title, subject, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id) {
    return readAll()[id] ?? null;
  },
  async create(document) {
    const all = readAll();
    const d: Draft = { id: `local-${crypto.randomUUID()}`, brandId: document.brandId, title: document.title, subject: document.subject, updatedAt: new Date().toISOString(), document, revision: 1 };
    all[d.id] = d;
    writeAll(all);
    return d;
  },
  async update(id, document, revision) {
    const all = readAll();
    const cur = all[id];
    if (!cur) throw new ApiError(404, "Draft not found.");
    if (cur.revision !== revision) throw new ApiError(409, "This draft was changed in another tab. Reload to get the latest version.");
    const d: Draft = { ...cur, document, brandId: document.brandId, title: document.title, subject: document.subject, updatedAt: new Date().toISOString(), revision: revision + 1 };
    all[id] = d;
    writeAll(all);
    return d;
  },
  async remove(id) {
    const all = readAll();
    delete all[id];
    writeAll(all);
  },
};

const DB_NAME = "otb-demo-assets";
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("images");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key: string, value: string) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbAll(): Promise<{ key: string; value: string }[]> {
  const db = await idb();
  return new Promise((res, rej) => {
    const out: { key: string; value: string }[] = [];
    const r = db.transaction("images").objectStore("images").openCursor();
    r.onsuccess = () => {
      const c = r.result;
      if (!c) return res(out);
      out.push({ key: String(c.key), value: String(c.value) });
      c.continue();
    };
    r.onerror = () => rej(r.error);
  });
}
async function idbDelete(key: string) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("images", "readwrite");
    tx.objectStore("images").delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key: string): Promise<string | null> {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction("images").objectStore("images").get(key);
    r.onsuccess = () => res((r.result as string | undefined) ?? null);
    r.onerror = () => rej(r.error);
  });
}

const localCache = new Map<string, string>();

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = url;
  });
}

export const localAssetClient: AssetClient = {
  async upload(file) {
    if (!/^image\/(png|jpeg|gif)$/.test(file.type)) throw new ApiError(415, "Only PNG, JPEG or GIF images are supported.");
    if (file.size > 5 * 1024 * 1024) throw new ApiError(413, "Images must be 5 MB or smaller.");
    const dataUrl = await fileToDataUrl(file);
    const { width, height } = await imageDimensions(dataUrl);
    const id = `local_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await idbPut(id, dataUrl);
    localCache.set(id, dataUrl);
    return { src: { kind: "asset", assetId: id }, width, height };
  },
  async list() {
    const rows = await idbAll();
    const out: LibraryImage[] = [];
    for (const { key, value } of rows) {
      localCache.set(key, value);
      const dims = await imageDimensions(value).catch(() => null);
      // A data URL is about a third longer than the file it holds.
      if (dims) out.push({ src: { kind: "asset", assetId: key }, ...dims, bytes: Math.round((value.length - value.indexOf(",") - 1) * 0.75), name: "Image", thumbUrl: value });
    }
    return out.reverse();
  },
  previewUrl(src) {
    return src.kind === "sample" ? sampleDataUrl(src.sampleId) : (localCache.get(src.assetId) ?? null);
  },
  async preload(sources) {
    await Promise.all(
      sources.map(async (s) => {
        if (s.kind !== "asset" || localCache.has(s.assetId)) return;
        const v = await idbGet(s.assetId).catch(() => null);
        if (v) localCache.set(s.assetId, v);
      }),
    );
  },
  async remove(assetId) {
    const usage = localImageUsage(assetId);
    if (imageIsUsed(usage)) throw new ApiError(409, imageInUseMessage(usage));
    await idbDelete(assetId);
    localCache.delete(assetId);
  },
};

/** Where a picture kept in this browser is still used: this browser's emails, templates and saved blocks. */
function localImageUsage(assetId: string): ImageUsage {
  const named = (list: unknown[], pick: (item: Record<string, unknown>) => unknown, fallback: string) =>
    list.filter((item) => usesImage(item, assetId)).map((item) => String((item && typeof item === "object" && pick(item as Record<string, unknown>)) || fallback));
  const blocks: unknown[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("otb.saved-modules.v1:")) blocks.push(...readJsonList<unknown>(key));
    }
  } catch {
    // Storage that cannot be read holds nothing that could be using the picture.
  }
  return {
    emails: named(Object.values(readAll()), (d) => d.title, "Untitled email"),
    templates: named(readJsonList<unknown>(TEMPLATES_KEY), (t) => t.name, "Untitled template"),
    blocks: [...new Set(named(blocks, (b) => b.name, "Saved block"))],
  };
}

/** Demo export: images are in the browser, so their bytes go with the request. */
export async function localImagesForExport(doc: EmailDocument): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const sources = collectImageSources(doc);
  await localAssetClient.preload(sources);
  for (const s of sources) {
    if (s.kind !== "asset") continue;
    const url = localCache.get(s.assetId);
    if (url) out[s.assetId] = url.slice(url.indexOf(",") + 1);
  }
  return out;
}

/* ---------------- Templates ---------------- */

export interface TemplateList {
  /** The person's own templates first, then the starter templates they have kept. */
  templates: Template[];
  /** How many starter templates they have removed (so the app can offer to bring them back). */
  removedStarters: number;
}

export interface TemplateStore {
  list(): Promise<TemplateList>;
  create(name: string, doc: EmailDocument): Promise<void>;
  /** Deletes one of the person's templates, or removes a starter template for them. */
  remove(id: string): Promise<void>;
  restoreStarters(): Promise<void>;
}

type StoredTemplate = Omit<Template, "isDefault">;

export const apiTemplateStore: TemplateStore = {
  async list() {
    const r = await api<{ templates: StoredTemplate[]; hiddenDefaults: string[] }>("/api/templates");
    return { templates: visibleTemplates(r.templates, r.hiddenDefaults), removedStarters: r.hiddenDefaults.filter((id) => DEFAULT_TEMPLATE_IDS.includes(id)).length };
  },
  async create(name, document) {
    await api("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, document }) });
  },
  async remove(id) {
    await api(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async restoreStarters() {
    await api("/api/templates/hidden-defaults", { method: "DELETE" });
  },
};

function readJsonList<T>(key: string): T[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
function writeJsonList(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    throw new ApiError(507, "This browser's storage is full or unavailable, so it could not be saved.");
  }
}

export const localTemplateStore: TemplateStore = {
  async list() {
    // Anything that is no longer a valid email (an old or damaged entry) is left out rather than shown broken.
    const own = readJsonList<StoredTemplate>(TEMPLATES_KEY).filter((t) => t && typeof t.id === "string" && typeof t.name === "string" && validateDocument(t.document).ok);
    const hidden = readJsonList<string>(HIDDEN_TEMPLATES_KEY).filter((id) => DEFAULT_TEMPLATE_IDS.includes(id));
    return { templates: visibleTemplates(own, hidden), removedStarters: hidden.length };
  },
  async create(name, document) {
    const own = readJsonList<StoredTemplate>(TEMPLATES_KEY);
    if (own.length >= MAX_TEMPLATES) throw new ApiError(409, `You can keep ${MAX_TEMPLATES} templates of your own. Remove one first.`);
    writeJsonList(TEMPLATES_KEY, [{ id: `local-${crypto.randomUUID()}`, name: name.trim().slice(0, 80) || "Untitled template", document: structuredClone(document), savedAt: new Date().toISOString() }, ...own]);
  },
  async remove(id) {
    if (DEFAULT_TEMPLATE_IDS.includes(id)) writeJsonList(HIDDEN_TEMPLATES_KEY, [...new Set([...readJsonList<string>(HIDDEN_TEMPLATES_KEY), id])]);
    else writeJsonList(TEMPLATES_KEY, readJsonList<StoredTemplate>(TEMPLATES_KEY).filter((t) => t.id !== id));
  },
  async restoreStarters() {
    writeJsonList(HIDDEN_TEMPLATES_KEY, []);
  },
};

export function storesFor(mode: "production" | "demo") {
  return mode === "production"
    ? { drafts: apiDraftStore, assets: apiAssetClient, templates: apiTemplateStore }
    : { drafts: localDraftStore, assets: localAssetClient, templates: localTemplateStore };
}
