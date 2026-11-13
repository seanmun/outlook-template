"use client";
/**
 * Blocks and rows the user saved for reuse.
 *
 * The list always lives in this browser (localStorage), separately for each signed-in account
 * and for visitors without one, so saving is instant and works offline. For a signed-in account
 * it is also kept in the account (/api/saved-modules) and the two are reconciled on load, so
 * saved modules follow the user to other browsers. If the account copy cannot be reached, the
 * browser copy keeps working and catches up next time.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { ModuleInstanceSchema, type ModuleInstance } from "@/lib/email/document";
import { PERSONAL_LIMITS } from "@/lib/limits";

const SavedModuleSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(60),
  /** The brand it was saved from, for reference; it can be used in any brand that has the module. */
  brandId: z.string().min(1).max(60),
  savedAt: z.string(),
  module: ModuleInstanceSchema,
});
export type SavedModule = z.infer<typeof SavedModuleSchema>;

export const MAX_SAVED_MODULES = PERSONAL_LIMITS.savedBlocks;
const keyFor = (scope: string) => `otb.saved-modules.v1:${scope}`;
const CHANGED = "otb:saved-modules";

function parseList(list: unknown): SavedModule[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const r = SavedModuleSchema.safeParse(item);
    return r.success ? [r.data] : [];
  });
}

/** Reads the list, dropping anything that is not a well-formed saved module. Pure, so it can be tested. */
export function parseSavedModules(raw: string | null): SavedModule[] {
  try {
    return parseList(JSON.parse(raw ?? "[]"));
  } catch {
    return [];
  }
}

// useSyncExternalStore needs the same array back while the stored text is unchanged.
const cache = new Map<string, { raw: string | null; list: SavedModule[] }>();
const EMPTY: SavedModule[] = [];

function read(scope: string): SavedModule[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(keyFor(scope));
  } catch {
    return EMPTY;
  }
  const hit = cache.get(scope);
  if (hit && hit.raw === raw) return hit.list;
  const list = parseSavedModules(raw);
  cache.set(scope, { raw, list });
  return list;
}

function write(scope: string, list: SavedModule[]): boolean {
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(list));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGED));
  return true;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/* ---------------- Account sync ---------------- */

/** Ids known to be stored in the account. A synced id that the account no longer has was removed on another device. */
const syncedKeyFor = (scope: string) => `otb.saved-modules.synced.v1:${scope}`;

function readSynced(scope: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(syncedKeyFor(scope)) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeSynced(scope: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(syncedKeyFor(scope), JSON.stringify([...ids]));
  } catch {
    // Not fatal: the next sync works it out again from the account's list.
  }
}

/**
 * Works out what the browser's list should become, given the account's list. Pure, so it can be tested.
 * - in both: keep
 * - only in the account: add (saved on another device)
 * - only here and never synced: keep, and upload
 * - only here but synced before: drop (removed on another device)
 */
export function reconcileSavedModules(local: SavedModule[], cloud: SavedModule[], synced: ReadonlySet<string>): { merged: SavedModule[]; upload: SavedModule[] } {
  const cloudIds = new Set(cloud.map((c) => c.id));
  const kept = local.filter((l) => cloudIds.has(l.id) || !synced.has(l.id));
  const keptIds = new Set(kept.map((l) => l.id));
  const merged = [...kept, ...cloud.filter((c) => !keptIds.has(c.id))].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return { merged, upload: kept.filter((l) => !cloudIds.has(l.id)) };
}

async function pushToAccount(scope: string, item: SavedModule): Promise<boolean> {
  try {
    const res = await fetch("/api/saved-modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, name: item.name, brandId: item.brandId, module: item.module }),
    });
    if (!res.ok) return false;
    writeSynced(scope, readSynced(scope).add(item.id));
    return true;
  } catch {
    return false;
  }
}

/** Brings this browser's list and the account's list into line. Never throws; on any failure the browser list is left as it is. */
export async function syncSavedModules(scope: string): Promise<void> {
  let cloud: SavedModule[];
  try {
    const res = await fetch("/api/saved-modules");
    if (!res.ok) return;
    cloud = parseList(((await res.json()) as { savedModules?: unknown }).savedModules);
  } catch {
    return;
  }
  // Read the browser list only now, so anything saved while the request was in flight is included.
  const local = read(scope);
  const { merged, upload } = reconcileSavedModules(local, cloud, readSynced(scope));
  const same = merged.length === local.length && merged.every((m, i) => m.id === local[i].id);
  if (!same && !write(scope, merged)) return;
  writeSynced(scope, cloud.map((c) => c.id));
  for (const item of upload) await pushToAccount(scope, item);
}

export interface SavedModulesApi {
  items: SavedModule[];
  /** True when the list is also kept in the signed-in account. */
  inAccount: boolean;
  /** Saves a copy under this name, newest first. Returns an error message, or null when saved. */
  save(name: string, module: ModuleInstance, brandId: string): string | null;
  remove(id: string): void;
}

/**
 * `scope` separates one account's saved modules from another's on a shared browser.
 * `inAccount` is true for a signed-in user: the list is then also kept in their account (or, when
 * `scope` is a team space, in the team's shared Library). `limit` is how many that Library can hold.
 */
export function useSavedModules(scope: string, inAccount = false, limit = MAX_SAVED_MODULES): SavedModulesApi {
  const items = useSyncExternalStore(
    subscribe,
    () => read(scope),
    () => EMPTY,
  );
  const save = useCallback<SavedModulesApi["save"]>(
    (name, module, brandId) => {
      const current = read(scope);
      if (current.length >= limit) return `You can keep ${limit} saved blocks here. Remove one first.`;
      const item: SavedModule = { id: crypto.randomUUID(), name: name.trim().slice(0, 60) || "Saved module", brandId, savedAt: new Date().toISOString(), module: structuredClone(module) };
      if (!write(scope, [item, ...current])) return "This browser's storage is full or unavailable, so it could not be saved.";
      if (inAccount) void pushToAccount(scope, item);
      return null;
    },
    [scope, inAccount, limit],
  );
  const remove = useCallback(
    (id: string) => {
      write(scope, read(scope).filter((s) => s.id !== id));
      if (!inAccount) return;
      const synced = readSynced(scope);
      synced.delete(id);
      writeSynced(scope, synced);
      void fetch(`/api/saved-modules/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    },
    [scope, inAccount],
  );
  useEffect(() => {
    if (inAccount) void syncSavedModules(scope);
  }, [scope, inAccount]);
  return useMemo(() => ({ items, inAccount, save, remove }), [items, inAccount, save, remove]);
}
