"use client";
/**
 * Client persistence. Production talks to the authenticated API routes; demo
 * mode keeps drafts in localStorage and images in IndexedDB, in this browser only.
 */
import type { EmailDocument } from "@/lib/email/document";
import type { ImageSource } from "@/lib/email/fields";
import { collectImageSources } from "@/lib/email/render";
import { sampleDataUrl } from "@/lib/email/samples";

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

export interface AssetClient {
  upload(file: File): Promise<UploadedImage>;
  /** Synchronous URL for the preview iframe, or null if not loaded yet. */
  previewUrl(src: ImageSource): string | null;
  /** Ensures preview URLs for these sources are available; resolves when loaded. */
  preload(sources: ImageSource[]): Promise<void>;
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
  previewUrl(src) {
    return src.kind === "sample" ? sampleDataUrl(src.sampleId) : `/api/assets/${encodeURIComponent(src.assetId)}`;
  },
  async preload() {},
};

/* ---------------- Demo (browser-local) ---------------- */

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
};

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

export function storesFor(mode: "production" | "demo") {
  return mode === "production" ? { drafts: apiDraftStore, assets: apiAssetClient } : { drafts: localDraftStore, assets: localAssetClient };
}
