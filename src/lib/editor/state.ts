/** Pure editor state: document, undo/redo history, selection, and an edit version counter. */
import { requireBrand } from "@/lib/email/brands";
import { COLUMNS_TYPE, MAX_BLOCKS_PER_COLUMN, findModule, locateModule, newModuleId, type EmailDocument, type ModuleInstance } from "@/lib/email/document";
import type { ColumnLayout } from "@/lib/email/modules/columns";
import { applyOperations, type Operation, type AvailableImage } from "@/lib/email/operations";
import { createModuleInstance, fitToColumn, getModule, reflowColumns, validateDocument } from "@/lib/email/registry";

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
      const selectedId = action.select !== undefined ? action.select : state.selectedId && findModule(next, state.selectedId) ? state.selectedId : null;
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

/** Where to put a module: the top level, or one column of a columns row. `index` null = end. */
export type Destination = { parentId: null; index: number | null } | { parentId: string; column: number; index: number | null };

/** Applies fn to the module with this id, wherever it sits. */
const mapModule = (doc: EmailDocument, id: string, fn: (m: ModuleInstance) => ModuleInstance): EmailDocument => ({
  ...doc,
  modules: doc.modules.map((m) =>
    m.id === id ? fn(m) : m.columns ? { ...m, columns: m.columns.map((c) => ({ blocks: c.blocks.map((b) => (b.id === id ? fn(b) : b)) })) } : m,
  ),
});

const without = (doc: EmailDocument, id: string): EmailDocument => ({
  ...doc,
  modules: doc.modules.filter((m) => m.id !== id).map((m) => (m.columns ? { ...m, columns: m.columns.map((c) => ({ blocks: c.blocks.filter((b) => b.id !== id) })) } : m)),
});

const insert = (doc: EmailDocument, m: ModuleInstance, dest: Destination): EmailDocument => {
  const put = (list: ModuleInstance[], item: ModuleInstance) => {
    const next = [...list];
    next.splice(dest.index === null ? next.length : Math.max(0, Math.min(dest.index, next.length)), 0, item);
    return next;
  };
  if (dest.parentId === null) return { ...doc, modules: put(doc.modules, m) };
  return {
    ...doc,
    modules: doc.modules.map((row) =>
      row.id === dest.parentId && row.columns ? { ...row, columns: row.columns.map((c, i) => (i === dest.column ? { blocks: put(c.blocks, fitToColumn(m)) } : c)) } : row,
    ),
  };
};

/** True when dest names a real place this module may go (rows cannot nest; columns have a size limit). */
export function canPlace(doc: EmailDocument, type: string, dest: Destination): boolean {
  if (dest.parentId === null) return true;
  const row = doc.modules.find((m) => m.id === dest.parentId);
  const col = row?.columns?.[dest.column];
  return !!col && type !== COLUMNS_TYPE && col.blocks.length < MAX_BLOCKS_PER_COLUMN;
}

function create(doc: EmailDocument, type: string, id: string, settings?: Record<string, unknown>): ModuleInstance {
  let m = createModuleInstance(type, requireBrand(doc.brandId), id);
  if (settings) m = { ...m, settings: { ...m.settings, ...settings } };
  const layout = m.settings.layout as ColumnLayout | undefined;
  if (m.type === COLUMNS_TYPE && layout) m = { ...m, columns: reflowColumns(m.columns ?? [], layout) };
  return m;
}

/** A copy of a module (and, for a row, its blocks) under new ids. */
function freshCopy(m: ModuleInstance, id: string): ModuleInstance {
  return {
    ...structuredClone(m),
    id,
    ...(m.columns ? { columns: m.columns.map((c) => ({ blocks: c.blocks.map((b) => ({ ...structuredClone(b), id: newModuleId() })) })) } : {}),
  };
}

/**
 * A saved module made ready for this email: copied under new ids and checked against
 * the email's brand. Null when it cannot be used here (e.g. the brand lacks that module).
 */
export function instantiateSaved(doc: EmailDocument, saved: ModuleInstance, id = newModuleId()): ModuleInstance | null {
  const r = validateDocument({ ...doc, modules: [freshCopy(saved, id)] });
  return r.ok ? r.doc.modules[0] : null;
}

/** What is being dragged: a new module from the palette, one the user saved earlier, or an existing one. */
export type DragPayload = { kind: "new"; type: string; settings?: Record<string, unknown> } | { kind: "saved"; module: ModuleInstance } | { kind: "move"; id: string };

/** The module type a drag would place. */
export function payloadType(doc: EmailDocument, payload: DragPayload): string {
  return payload.kind === "new" ? payload.type : payload.kind === "saved" ? payload.module.type : (findModule(doc, payload.id)?.type ?? "");
}

/** Where a drag lands, described relative to what is already there so it survives lifting the dragged module out. */
export type DropTarget =
  /** Directly before this module, in whatever list it is in. */
  | { kind: "before"; anchorId: string }
  /** At the end of the top level (parentId null) or of one column. */
  | { kind: "end"; parentId: string | null; column?: number }
  /** Beside this full-width block: the two become a two-column row. */
  | { kind: "split"; anchorId: string; side: "left" | "right" };

/** The ids of a document in order, with nesting: equal shapes mean a drop changed nothing. */
const shape = (doc: EmailDocument) => JSON.stringify(doc.modules.map((m) => [m.id, m.columns?.map((c) => c.blocks.map((b) => b.id))]));

/** A block leaving a column gets its full-width side padding back. */
function restoreSidePadding(doc: EmailDocument, m: ModuleInstance): ModuleInstance {
  const p = m.settings.padding as { top: number; right: number; bottom: number; left: number } | undefined;
  const d = getModule(m.type)?.defaults(requireBrand(doc.brandId)).settings as { padding?: { left: number; right: number } } | undefined;
  if (!p || !d?.padding || p.left !== 0 || p.right !== 0) return m;
  return { ...m, settings: { ...m.settings, padding: { ...p, left: d.padding.left, right: d.padding.right } } };
}

export const docOps = {
  add(doc: EmailDocument, type: string, dest: Destination, id = newModuleId(), settings?: Record<string, unknown>): EmailDocument {
    if (!canPlace(doc, type, dest)) return doc;
    return insert(doc, create(doc, type, id, settings), dest);
  },
  /** Adds a copy of a saved module. Returns the same document when it cannot go there. */
  addSaved(doc: EmailDocument, saved: ModuleInstance, dest: Destination, id = newModuleId()): EmailDocument {
    const item = instantiateSaved(doc, saved, id);
    return item && canPlace(doc, item.type, dest) ? insert(doc, item, dest) : doc;
  },
  /** Completes a drag. Returns the same document when the drop is not allowed or changes nothing. */
  drop(doc: EmailDocument, payload: DragPayload, target: DropTarget, newId = newModuleId()): EmailDocument {
    const moving = payload.kind === "move" ? findModule(doc, payload.id) : undefined;
    if (payload.kind === "move" && !moving) return doc;
    if (moving && "anchorId" in target && target.anchorId === moving.id) return doc;
    const from = moving ? locateModule(doc, moving.id) : null;
    const base = moving ? without(doc, moving.id) : doc;
    const made = payload.kind === "saved" ? instantiateSaved(doc, payload.module, newId) : payload.kind === "new" ? create(doc, payload.type, newId, payload.settings) : moving;
    if (!made) return doc;
    let item = made;

    let next: EmailDocument;
    if (target.kind === "split") {
      const at = locateModule(base, target.anchorId);
      const anchor = findModule(base, target.anchorId);
      if (!at || at.parentId !== null || !anchor || anchor.type === COLUMNS_TYPE || item.type === COLUMNS_TYPE) return doc;
      const row = create(doc, COLUMNS_TYPE, newModuleId(), { layout: "1-1" });
      const pair = target.side === "left" ? [item, anchor] : [anchor, item];
      const modules = [...base.modules];
      modules[at.index] = { ...row, columns: pair.map((b) => ({ blocks: [fitToColumn(b)] })) };
      next = { ...base, modules };
    } else {
      let dest: Destination;
      if (target.kind === "before") {
        const at = locateModule(base, target.anchorId);
        if (!at) return doc;
        dest = at;
      } else dest = target.parentId === null ? { parentId: null, index: null } : { parentId: target.parentId, column: target.column ?? 0, index: null };
      if (!canPlace(base, item.type, dest)) return doc;
      if (dest.parentId === null && from && from.parentId !== null) item = restoreSidePadding(doc, item);
      next = insert(base, item, dest);
    }
    return shape(next) === shape(doc) ? doc : next;
  },
  duplicate(doc: EmailDocument, id: string, newId = newModuleId()): EmailDocument {
    const loc = locateModule(doc, id);
    const original = findModule(doc, id);
    if (!loc || !original) return doc;
    const copy = freshCopy(original, newId);
    const dest: Destination = loc.parentId === null ? { parentId: null, index: loc.index + 1 } : { parentId: loc.parentId, column: loc.column, index: loc.index + 1 };
    return canPlace(doc, copy.type, dest) ? insert(doc, copy, dest) : doc;
  },
  remove(doc: EmailDocument, id: string): EmailDocument {
    return without(doc, id);
  },
  /** Moves a module to a destination. `dest.index` is the position in the destination list after the module is lifted out. */
  moveTo(doc: EmailDocument, id: string, dest: Destination): EmailDocument {
    const m = findModule(doc, id);
    if (!m || dest.parentId === id) return doc;
    const lifted = without(doc, id);
    return canPlace(lifted, m.type, dest) ? insert(lifted, m, dest) : doc;
  },
  /** Reorders within the top level. */
  move(doc: EmailDocument, id: string, toIndex: number): EmailDocument {
    const from = doc.modules.findIndex((m) => m.id === id);
    if (from < 0 || from === toIndex) return doc;
    return docOps.moveTo(doc, id, { parentId: null, index: toIndex });
  },
  setContent(doc: EmailDocument, id: string, key: string, value: unknown): EmailDocument {
    return mapModule(doc, id, (m) => ({ ...m, content: { ...m.content, [key]: value } }));
  },
  setSetting(doc: EmailDocument, id: string, key: string, value: unknown): EmailDocument {
    return mapModule(doc, id, (m) => {
      const next = { ...m, settings: { ...m.settings, [key]: value } };
      // Changing a row's layout re-shapes its columns; content is kept.
      return m.type === COLUMNS_TYPE && key === "layout" ? { ...next, columns: reflowColumns(m.columns ?? [], value as ColumnLayout) } : next;
    });
  },
  /** Restores brand/module default settings; content (and a row's layout and blocks) is kept. */
  resetSettings(doc: EmailDocument, id: string): EmailDocument {
    return mapModule(doc, id, (m) => {
      const def = getModule(m.type);
      if (!def) return m;
      const defaults = structuredClone(def.defaults(requireBrand(doc.brandId)).settings) as Record<string, unknown>;
      return { ...m, settings: m.type === COLUMNS_TYPE ? { ...defaults, layout: m.settings.layout } : defaults };
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
