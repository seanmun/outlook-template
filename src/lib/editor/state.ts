/** Pure editor state: document, undo/redo history, selection, and an edit version counter. */
import { requireBrand } from "@/lib/email/brands";
import { newModuleId, type EmailDocument, type ModuleInstance } from "@/lib/email/document";
import { applyOperations, type Operation, type AvailableImage } from "@/lib/email/operations";
import { createModuleInstance, getModule } from "@/lib/email/registry";

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export interface EditorState {
  doc: EmailDocument;
  past: EmailDocument[];
  future: EmailDocument[];
  /** Increments on every document change, including undo/redo. Used to detect stale AI results. */
  version: number;
  selectedId: string | null;
  lastCoalesceKey: string | null;
  lastChangeAt: number;
}

export type EditorAction =
  | { type: "load"; doc: EmailDocument }
  | { type: "change"; update: (doc: EmailDocument) => EmailDocument; coalesceKey?: string; now?: number; select?: string | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; id: string | null };

export function initialEditorState(doc: EmailDocument): EditorState {
  return { doc, past: [], future: [], version: 0, selectedId: null, lastCoalesceKey: null, lastChangeAt: 0 };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "load":
      return { ...initialEditorState(action.doc), version: state.version + 1 };
    case "select":
      return { ...state, selectedId: action.id };
    case "change": {
      const next = action.update(state.doc);
      if (next === state.doc) return state;
      const now = action.now ?? Date.now();
      const coalesce = !!action.coalesceKey && action.coalesceKey === state.lastCoalesceKey && now - state.lastChangeAt < COALESCE_MS;
      const past = coalesce ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT);
      const selectedId = action.select !== undefined ? action.select : next.modules.some((m) => m.id === state.selectedId) ? state.selectedId : null;
      return { ...state, doc: next, past, future: [], version: state.version + 1, selectedId, lastCoalesceKey: action.coalesceKey ?? null, lastChangeAt: now };
    }
    case "undo": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return { ...state, doc: prev, past: state.past.slice(0, -1), future: [state.doc, ...state.future], version: state.version + 1, lastCoalesceKey: null };
    }
    case "redo": {
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return { ...state, doc: next, past: [...state.past, state.doc], future: rest, version: state.version + 1, lastCoalesceKey: null };
    }
  }
}

/* ---------- Document transforms used by the editor UI ---------- */

const mapModule = (doc: EmailDocument, id: string, fn: (m: ModuleInstance) => ModuleInstance): EmailDocument => ({
  ...doc,
  modules: doc.modules.map((m) => (m.id === id ? fn(m) : m)),
});

export const docOps = {
  add(doc: EmailDocument, type: string, index: number | null, id = newModuleId()): EmailDocument {
    const m = createModuleInstance(type, requireBrand(doc.brandId), id);
    const modules = [...doc.modules];
    modules.splice(index ?? modules.length, 0, m);
    return { ...doc, modules };
  },
  duplicate(doc: EmailDocument, id: string, newId = newModuleId()): EmailDocument {
    const i = doc.modules.findIndex((m) => m.id === id);
    if (i < 0) return doc;
    const copy = { ...structuredClone(doc.modules[i]), id: newId };
    const modules = [...doc.modules];
    modules.splice(i + 1, 0, copy);
    return { ...doc, modules };
  },
  remove(doc: EmailDocument, id: string): EmailDocument {
    return { ...doc, modules: doc.modules.filter((m) => m.id !== id) };
  },
  move(doc: EmailDocument, id: string, toIndex: number): EmailDocument {
    const from = doc.modules.findIndex((m) => m.id === id);
    if (from < 0 || from === toIndex) return doc;
    const modules = [...doc.modules];
    const [m] = modules.splice(from, 1);
    modules.splice(Math.max(0, Math.min(toIndex, modules.length)), 0, m);
    return { ...doc, modules };
  },
  setContent(doc: EmailDocument, id: string, key: string, value: unknown): EmailDocument {
    return mapModule(doc, id, (m) => ({ ...m, content: { ...m.content, [key]: value } }));
  },
  setSetting(doc: EmailDocument, id: string, key: string, value: unknown): EmailDocument {
    return mapModule(doc, id, (m) => ({ ...m, settings: { ...m.settings, [key]: value } }));
  },
  /** Restores brand/module default settings; content is kept. */
  resetSettings(doc: EmailDocument, id: string): EmailDocument {
    return mapModule(doc, id, (m) => {
      const def = getModule(m.type);
      return def ? { ...m, settings: structuredClone(def.defaults(requireBrand(doc.brandId)).settings) } : m;
    });
  },
  setField(doc: EmailDocument, key: "subject" | "title", value: string): EmailDocument {
    return { ...doc, [key]: value };
  },
};

/* ---------- AI result handling ---------- */

export type AiResolution =
  | { kind: "apply"; doc: EmailDocument }
  /** The user edited while the request ran. `rebased` is the AI's operations re-applied to the current document, if that validates. */
  | { kind: "stale"; rebased: EmailDocument | null; reason: string };

/**
 * The AI's document was computed from the document at `requestVersion`.
 * Apply it only if nothing changed since; otherwise never overwrite silently.
 */
export function resolveAiResult(opts: {
  requestVersion: number;
  currentVersion: number;
  currentDoc: EmailDocument;
  resultDoc: EmailDocument;
  operations: Operation[];
  /** Images the request offered to the AI, needed to replay operations that place them. */
  images?: AvailableImage[];
}): AiResolution {
  if (opts.requestVersion === opts.currentVersion) return { kind: "apply", doc: opts.resultDoc };
  const re = applyOperations(opts.currentDoc, opts.operations, undefined, opts.images);
  return re.ok
    ? { kind: "stale", rebased: re.doc, reason: "You edited the email while the AI was working." }
    : { kind: "stale", rebased: null, reason: `You edited the email while the AI was working, and its changes no longer apply cleanly (${re.errors[0]?.message ?? "conflict"}).` };
}
