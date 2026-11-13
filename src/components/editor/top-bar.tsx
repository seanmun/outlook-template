"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Redo2, Undo2, Download, AlertTriangle, Check, LayoutTemplate, LibraryBig, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfig } from "@/lib/client/config";
import { storesFor } from "@/lib/client/stores";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
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
  const { state, change, dispatch } = useEditor();
  const config = useConfig();
  const router = useRouter();
  const [exportOpen, setExportOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** The name being typed for a new template; null while the box is closed. */
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  async function saveTemplate() {
    const name = (templateName ?? "").trim();
    if (!name) return;
    setSavingTemplate(true);
    try {
      await storesFor(config.mode).templates.create(name, state.doc);
      toast.success(`Saved the template \u201c${name}\u201d. It is there whenever you start a new email.`);
      setTemplateName(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingTemplate(false);
    }
  }
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
        <Button variant="outline" size="sm" onClick={() => setTemplateName(state.doc.title || "My template")} title="Keep this email as a template to start new emails from">
          <LayoutTemplate /> <span className="hidden xl:inline">Save as template</span>
        </Button>
        <Button variant="outline" size="sm" disabled={leaving} onClick={toLibrary} title="Your emails, templates, saved blocks and images">
          {leaving ? <Loader2 className="animate-spin" /> : <LibraryBig />} Library
        </Button>
        <Button size="sm" onClick={() => setExportOpen(true)}>
          <Download /> Download
        </Button>
      </AppHeader>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <Dialog open={templateName !== null} onOpenChange={(o) => !o && setTemplateName(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>Keeps a copy of this email as it is now. Next time you start an email, you can begin from it.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveTemplate();
            }}
          >
            <label htmlFor="template-name" className="text-sm font-medium">
              Template name
            </label>
            <Input id="template-name" className="mt-1.5" autoFocus maxLength={80} value={templateName ?? ""} onChange={(e) => setTemplateName(e.target.value)} />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setTemplateName(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingTemplate || !(templateName ?? "").trim()}>
                {savingTemplate ? <Loader2 className="animate-spin" /> : <LayoutTemplate />} Save template
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
