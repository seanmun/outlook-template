"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Redo2, Undo2, Download, AlertTriangle, Check, LibraryBig, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { docOps } from "@/lib/editor/state";
import { useEditor } from "./context";
import { ExportDialog } from "./export-dialog";

function SaveIndicator({ onRetry }: { onRetry: () => void }) {
  const { saveStatus, saveError } = useEditor();
  switch (saveStatus) {
    case "saved":
      return (
        <span className="flex items-center gap-1 text-xs text-neutral-500">
          <Check className="size-3.5" /> Saved
        </span>
      );
    case "saving":
      return (
        <span className="flex items-center gap-1 text-xs text-neutral-500">
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </span>
      );
    case "unsaved":
      return <span className="text-xs text-neutral-500">Unsaved changes</span>;
    case "conflict":
      return (
        <span className="flex items-center gap-1 text-xs text-red-600" title={saveError ?? ""}>
          <AlertTriangle className="size-3.5" /> Changed elsewhere. Reload to continue
        </span>
      );
    case "error":
      return (
        <button className="flex items-center gap-1 text-xs text-red-600 underline" title={saveError ?? ""} onClick={onRetry}>
          <AlertTriangle className="size-3.5" /> Save failed. Retry
        </button>
      );
  }
}

export function TopBar({ onRetrySave, saveNow }: { onRetrySave: () => void; saveNow: () => Promise<void> }) {
  const { state, change, dispatch, brand } = useEditor();
  const router = useRouter();
  const [exportOpen, setExportOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Saves first, so nothing typed in the last second is lost, then opens the Library. */
  async function toLibrary() {
    setLeaving(true);
    try {
      await saveNow();
    } finally {
      router.push("/library");
    }
  }
  return (
    <>
      <AppHeader>
        <Input
          aria-label="Project name"
          className="h-8 w-56"
          value={state.doc.title}
          maxLength={200}
          placeholder="Project name (internal)"
          onChange={(e) => change((d) => docOps.setField(d, "title", e.target.value), { coalesceKey: "title" })}
        />
        <Badge variant="secondary" className="shrink-0">
          {brand.name}
        </Badge>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor="subject" className="shrink-0 text-xs text-neutral-500">
            Subject
          </label>
          <Input
            id="subject"
            className="h-8 min-w-0 flex-1"
            value={state.doc.subject}
            maxLength={300}
            placeholder="Email subject line"
            onChange={(e) => change((d) => docOps.setField(d, "subject", e.target.value), { coalesceKey: "subject" })}
          />
        </div>
        <SaveIndicator onRetry={onRetrySave} />
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (⌘Z)" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })}>
            <Redo2 />
          </Button>
        </div>
        <Button variant="outline" size="sm" disabled={leaving} onClick={toLibrary} title="Your emails, saved blocks and images">
          {leaving ? <Loader2 className="animate-spin" /> : <LibraryBig />} Library
        </Button>
        <Button size="sm" onClick={() => setExportOpen(true)}>
          <Download /> Download
        </Button>
      </AppHeader>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </>
  );
}
