"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfig } from "@/lib/client/config";
import { localImagesForExport } from "@/lib/client/stores";
import { findContentIssues } from "@/lib/email/issues";
import type { ExporterId } from "@/lib/export/types";
import { useEditor } from "./context";

function StatusPill({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ${good ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
      {label}: {value}
    </span>
  );
}

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const config = useConfig();
  const { state } = useEditor();
  const issues = useMemo(() => (open ? findContentIssues(state.doc) : []), [open, state.doc]);
  const [selected, setSelected] = useState<Set<ExporterId>>(() => new Set(config.exporters.filter((e) => e.availability.enabled && !e.developmentOnly).map((e) => e.id)));
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const toggle = (id: ExporterId) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function run() {
    setBusy(true);
    try {
      const formats = [...selected];
      const body =
        config.mode === "demo"
          ? { document: state.doc, formats, localImages: await localImagesForExport(state.doc) }
          : { document: state.doc, formats };
      const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "email.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Downloaded ${name}`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsAck = issues.length > 0 && !acknowledged;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setAcknowledged(false); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Downloads a ZIP with the selected formats and a README with instructions and verification status.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {config.exporters.map((e) => {
            const v = e.verification;
            const enabled = e.availability.enabled;
            return (
              <label key={e.id} className={`block rounded-md border p-3 text-sm ${enabled ? "cursor-pointer" : "opacity-70"}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" disabled={!enabled} checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {e.label}
                      {e.developmentOnly && <Badge variant="outline">Dev only</Badge>}
                      {!enabled && <Badge variant="secondary">Unavailable</Badge>}
                    </div>
                    <div className="text-xs text-neutral-500">{e.target}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <StatusPill label="Generation" value={v.generation} good={v.generation === "implemented"} />
                      <StatusPill label="Structural checks" value={v.structuralChecks} good={v.structuralChecks === "passed"} />
                      <StatusPill label="Outlook verified" value={v.outlookManual === "verified" ? "yes" : "not yet"} good={v.outlookManual === "verified"} />
                    </div>
                    {!enabled && e.availability.reason && <p className="mt-1.5 text-xs text-neutral-600">{e.availability.reason}</p>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {issues.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> {issues.length} unresolved item{issues.length === 1 ? "" : "s"}
            </div>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {issues.slice(0, 8).map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
              {issues.length > 8 && <li>…and {issues.length - 8} more</li>}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} /> Export anyway (items are listed in the README)
            </label>
          </div>
        )}

        <p className="text-xs text-neutral-500">
          Images are embedded in the files (inline attachments), so recipients never load them from this app. Always send yourself a test from Outlook first.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || selected.size === 0 || needsAck} onClick={run}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} Download ZIP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
