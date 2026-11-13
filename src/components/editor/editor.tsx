"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DemoBanner } from "@/components/app-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfig } from "@/lib/client/config";
import { useSavedModules } from "@/lib/client/saved-modules";
import { ApiError, storesFor } from "@/lib/client/stores";
import { editorReducer, initialEditorState } from "@/lib/editor/state";
import { getBrand } from "@/lib/email/brands";
import { validateDocument } from "@/lib/email/registry";
import { collectImageSources } from "@/lib/email/render";
import type { EmailDocument } from "@/lib/email/document";
import { EditorContext, type EditorCtx, type SaveStatus } from "./context";
import { TopBar } from "./top-bar";
import { AiPanel } from "./ai-panel";
import { ModulesPanel } from "./modules-panel";
import { Preview } from "./preview";
import { DragProvider } from "./drag";
import { Inspector } from "./inspector";

const AUTOSAVE_MS = 1200;

export function Editor({ id }: { id: string }) {
  const { ready } = useConfig();
  if (!ready) return <div className="p-10 text-sm text-neutral-500">Loading…</div>;
  return <EditorForVisitor id={id} />;
}

function EditorForVisitor({ id }: { id: string }) {
  const config = useConfig();
  const stores = useMemo(() => storesFor(config.mode), [config.mode]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<{ doc: EmailDocument; revision: number } | null>(null);

  useEffect(() => {
    stores.drafts
      .get(id)
      .then((d) => {
        if (!d) return setLoadError("Draft not found.");
        const v = validateDocument(d.document);
        if (!v.ok) return setLoadError(`This draft is invalid and cannot be opened: ${v.issues[0]?.path} ${v.issues[0]?.message}`);
        setInitial({ doc: v.doc, revision: d.revision });
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id, stores]);

  if (loadError)
    return (
      <div className="p-10 text-sm">
        {loadError}{" "}
        <Link className="underline" href="/new">
          Back to drafts
        </Link>
      </div>
    );
  if (!initial) return <div className="p-10 text-sm text-neutral-500">Loading…</div>;
  return <LoadedEditor id={id} initialDoc={initial.doc} initialRevision={initial.revision} stores={stores} />;
}

function LoadedEditor({
  id,
  initialDoc,
  initialRevision,
  stores,
}: {
  id: string;
  initialDoc: EmailDocument;
  initialRevision: number;
  stores: ReturnType<typeof storesFor>;
}) {
  const [state, dispatch] = useReducer(editorReducer, initialDoc, initialEditorState);
  const brand = getBrand(state.doc.brandId)!;
  const search = useSearchParams();
  const [tab, setTab] = useState(search.get("panel") === "ai" || initialDoc.modules.length === 0 ? "ai" : "modules");

  /* ---- autosave with optimistic revisions ---- */
  const revision = useRef(initialRevision);
  const savedVersion = useRef(state.version);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false);

  const save = useCallback(
    async (doc: EmailDocument, version: number) => {
      if (saving.current) return;
      saving.current = true;
      setSaveStatus("saving");
      try {
        const d = await stores.drafts.update(id, doc, revision.current);
        revision.current = d.revision;
        savedVersion.current = version;
        setSaveError(null);
        setSaveStatus("saved");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setSaveStatus("conflict");
        else setSaveStatus("error");
        setSaveError((e as Error).message);
      } finally {
        saving.current = false;
      }
    },
    [id, stores],
  );

  useEffect(() => {
    if (state.version === savedVersion.current || saveStatus === "conflict") return;
    setSaveStatus((s) => (s === "saving" ? s : "unsaved"));
    const t = setTimeout(() => save(state.doc, state.version), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [state.version, state.doc, save, saveStatus]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state.version !== savedVersion.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.version]);

  /* ---- keyboard undo/redo outside text inputs ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, [contenteditable=true]") || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- preview image availability (demo images load from IndexedDB) ---- */
  const [assetsVersion, setAssetsVersion] = useState(0);
  const refreshAssets = useCallback(() => setAssetsVersion((v) => v + 1), []);
  const sourcesKey = JSON.stringify(collectImageSources(state.doc));
  useEffect(() => {
    stores.assets.preload(JSON.parse(sourcesKey)).then(refreshAssets);
  }, [sourcesKey, stores.assets, refreshAssets]);

  const change = useCallback<EditorCtx["change"]>((update, opts) => dispatch({ type: "change", update, ...opts }), []);

  // Saved modules reference the account's own images, so each account (and "no account") keeps its own list.
  const account = useConfig();
  const saved = useSavedModules(account.userId ?? "local", account.mode === "production" && !!account.userId);

  const ctx: EditorCtx = { state, dispatch, change, brand, assets: stores.assets, saveStatus, saveError, assetsVersion, refreshAssets, saved };

  return (
    <EditorContext.Provider value={ctx}>
      <DragProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <DemoBanner />
        <TopBar onRetrySave={() => save(state.doc, state.version)} />
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-80 shrink-0 flex-col border-r bg-white">
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
              <TabsList className="m-2 grid w-auto grid-cols-2">
                <TabsTrigger value="ai">AI assistant</TabsTrigger>
                <TabsTrigger value="modules">Modules</TabsTrigger>
              </TabsList>
              <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col">
                <AiPanel />
              </TabsContent>
              <TabsContent value="modules" className="min-h-0 flex-1 overflow-y-auto">
                <ModulesPanel />
              </TabsContent>
            </Tabs>
          </aside>
          <main className="min-w-0 flex-1 overflow-hidden bg-neutral-100">
            <Preview />
          </main>
          <aside className="w-[22rem] shrink-0 overflow-y-auto border-l bg-white">
            <Inspector />
          </aside>
        </div>
      </div>
      </DragProvider>
    </EditorContext.Provider>
  );
}
