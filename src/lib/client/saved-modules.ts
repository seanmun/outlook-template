"use client";
/**
 * Blocks and rows the user saved for reuse. Kept in this browser (localStorage),
 * separately for each signed-in account and for visitors without one.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { ModuleInstanceSchema, type ModuleInstance } from "@/lib/email/document";

const SavedModuleSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(60),
  /** The brand it was saved from, for reference; it can be used in any brand that has the module. */
  brandId: z.string().min(1).max(60),
  savedAt: z.string(),
  module: ModuleInstanceSchema,
});
export type SavedModule = z.infer<typeof SavedModuleSchema>;

export const MAX_SAVED_MODULES = 40;
const keyFor = (scope: string) => `otb.saved-modules.v1:${scope}`;
const CHANGED = "otb:saved-modules";

/** Reads the list, dropping anything that is not a well-formed saved module. Pure, so it can be tested. */
export function parseSavedModules(raw: string | null): SavedModule[] {
  try {
    const list: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.flatMap((item) => {
      const r = SavedModuleSchema.safeParse(item);
      return r.success ? [r.data] : [];
    });
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

export interface SavedModulesApi {
  items: SavedModule[];
  /** Saves a copy under this name, newest first. Returns an error message, or null when saved. */
  save(name: string, module: ModuleInstance, brandId: string): string | null;
  remove(id: string): void;
}

/** `scope` separates one account's saved modules from another's on a shared browser. */
export function useSavedModules(scope: string): SavedModulesApi {
  const items = useSyncExternalStore(
    subscribe,
    () => read(scope),
    () => EMPTY,
  );
  const save = useCallback<SavedModulesApi["save"]>(
    (name, module, brandId) => {
      const current = read(scope);
      if (current.length >= MAX_SAVED_MODULES) return `You can keep ${MAX_SAVED_MODULES} saved modules. Remove one first.`;
      const item: SavedModule = { id: crypto.randomUUID(), name: name.trim().slice(0, 60) || "Saved module", brandId, savedAt: new Date().toISOString(), module: structuredClone(module) };
      return write(scope, [item, ...current]) ? null : "This browser's storage is full or unavailable, so it could not be saved.";
    },
    [scope],
  );
  const remove = useCallback((id: string) => void write(scope, read(scope).filter((s) => s.id !== id)), [scope]);
  return useMemo(() => ({ items, save, remove }), [items, save, remove]);
}
