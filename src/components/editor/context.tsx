"use client";
import { createContext, useContext } from "react";
import type { Brand } from "@/lib/email/brands";
import type { EmailDocument } from "@/lib/email/document";
import type { AssetClient } from "@/lib/client/stores";
import type { EditorAction, EditorState } from "@/lib/editor/state";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";

export interface EditorCtx {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  /** Records an undoable change. Use a coalesceKey for keystroke-level edits. */
  change: (update: (doc: EmailDocument) => EmailDocument, opts?: { coalesceKey?: string; select?: string | null }) => void;
  brand: Brand;
  assets: AssetClient;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Bumps when preview image URLs become available. */
  assetsVersion: number;
  refreshAssets: () => void;
}

export const EditorContext = createContext<EditorCtx | null>(null);

export function useEditor(): EditorCtx {
  const v = useContext(EditorContext);
  if (!v) throw new Error("EditorContext missing");
  return v;
}
