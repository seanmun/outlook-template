"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TextAd } from "@/components/ad-slot";
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

/** The format picker and verification badges are for whoever is developing the app, never for visitors. */
const DEVELOPER_VIEW = process.env.NODE_ENV === "development";

/** Pulls the one template out of the ZIP the server sends, so visitors get a file they can open straight away. */
async function templateFrom(zip: Blob): Promise<{ name: string; file: Blob } | null> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(zip);
  const entry = Object.values(archive.files).find((f) => !f.dir && /\.(oft|emltpl)$/i.test(f.name));
  if (!entry) return null;
  const type = entry.name.toLowerCase().endsWith(".oft") ? "application/vnd.ms-outlook" : "message/rfc822";
  return { name: entry.name.split("/").pop()!, file: new Blob([await entry.async("arraybuffer")], { type }) };
}

const BOTH_README = [
  "Your email, as two Outlook templates",
  "====================================",
  "",
  "There are two files here. They hold the same email.",
  "",
  "  The file ending in .oft     is for Outlook on Windows.",
  "  The file ending in .emltpl  is for Outlook on a Mac.",
  "",
  "Open the one for your computer. Outlook starts a new email with",
  "everything in place. Add who it is going to, send it to yourself",
  "first to check it, then send it for real.",
  "",
  "Each file only opens on its own kind of computer. If you are",
  "passing this on, give each person the file that matches theirs.",
  "",
].join("\r\n");

/** Repacks the server's ZIP for a visitor who wants both: the two templates and a plain note, without the developer README. */
async function bothFrom(zip: Blob): Promise<Blob | null> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(zip);
  const templates = Object.values(archive.files).filter((f) => !f.dir && /\.(oft|emltpl)$/i.test(f.name));
  if (templates.length < 2) return null;
  const out = new JSZip();
  for (const f of templates) out.file(f.name.split("/").pop()!, await f.async("arraybuffer"));
  out.file("READ ME FIRST.txt", BOTH_README);
  return out.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const config = useConfig();
  const { state } = useEditor();
  const issues = useMemo(() => (open ? findContentIssues(state.doc) : []), [open, state.doc]);
  const [selected, setSelected] = useState<Set<ExporterId>>(() => new Set(config.exporters.filter((e) => e.availability.enabled && !e.developmentOnly).map((e) => e.id)));
  const [developerView, setDeveloperView] = useState(false);
  const macAvailable = config.exporters.some((e) => e.id === "emltpl" && e.availability.enabled);
  // Which Outlook the file is for. Starts on the visitor's own kind of computer; they can switch.
  const [computer, setComputer] = useState<"windows" | "mac" | "both">(() => (macAvailable && typeof navigator !== "undefined" && /Mac/i.test(navigator.platform ?? navigator.userAgent) ? "mac" : "windows"));
  const mac = macAvailable && computer === "mac";
  const both = macAvailable && computer === "both";
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
      // Visitors always get the Outlook template. Other formats are only offered in the developer view.
      const formats: ExporterId[] = developerView ? [...selected] : both ? ["oft", "emltpl"] : [mac ? "emltpl" : "oft"];
      const body =
        config.mode === "demo"
          ? { document: state.doc, formats, localImages: await localImagesForExport(state.doc) }
          : { document: state.doc, formats };
      const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Export failed (${res.status})`);
      }
      const zip = await res.blob();
      const zipName = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "email.zip";
      // One template: hand over the .oft itself, not a ZIP to unpack. If that fails for any reason, the ZIP still works.
      const single = developerView || both ? null : await templateFrom(zip).catch(() => null);
      const blob = single?.file ?? (both && !developerView ? ((await bothFrom(zip).catch(() => null)) ?? zip) : zip);
      const name = single?.name ?? zipName;
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

  const needsAck = developerView && issues.length > 0 && !acknowledged;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setAcknowledged(false);
          setDeveloperView(false);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {!developerView ? (
          <>
            <DialogHeader>
              <DialogTitle>Download your email</DialogTitle>
              <DialogDescription>
                {both
                  ? "You get two files in one zip: an Outlook template for Windows and one for Mac. Open the one for your computer and Outlook starts a new email with everything in place."
                  : "You get one file, an Outlook template. Open it and Outlook starts a new email with everything in place."}
              </DialogDescription>
            </DialogHeader>

            {macAvailable && (
              <div role="radiogroup" aria-label="Which Outlook is this for?" className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["windows", "Outlook on Windows", ""],
                    ["mac", "Outlook on Mac", ""],
                    ["both", "Both", "One zip with both files"],
                  ] as const
                ).map(([id, label, note]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={computer === id}
                    onClick={() => setComputer(id)}
                    className={`rounded-md border p-3 text-left text-sm transition ${computer === id ? "border-neutral-900 ring-1 ring-neutral-900" : "hover:border-neutral-400"}`}
                  >
                    <span className="block font-medium">{label}</span>
                    {note && <span className="block text-xs text-neutral-500">{note}</span>}
                  </button>
                ))}
              </div>
            )}

            <ol className="space-y-2 text-sm text-neutral-700">
              {[
                both ? "Download the zip, unzip it, and open the file for your computer. Outlook opens a new email." : "Download the file and open it. Outlook opens a new email.",
                "Add who it is going to.",
                "Send it to yourself first to check it, then send it for real.",
              ].map((step, n) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{n + 1}</span>
                  {/* The last step is the one people skip and regret, so it stands out. */}
                  <span className={`pt-0.5 ${n === 2 ? "font-bold text-red-600" : ""}`}>{step}</span>
                </li>
              ))}
            </ol>

            {issues.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="size-4" /> Worth fixing before you send
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {issues.slice(0, 8).map((i, n) => (
                    <li key={n}>{i.message}</li>
                  ))}
                  {issues.length > 8 && <li>…and {issues.length - 8} more</li>}
                </ul>
                <p className="mt-2 text-xs">You can still download now and fix these later.</p>
              </div>
            )}

            <p className="text-xs text-neutral-500">
              {both
                ? "You get a zip with two files: one for Outlook on Windows (.oft) and one for Outlook on a Mac (.emltpl). Each only opens on its own kind of computer."
                : mac
                ? "This file is for Outlook on a Mac. It will not open in Outlook on Windows; choose Windows above for that."
                : macAvailable
                  ? "This file is for Outlook on Windows. It will not open in Outlook on a Mac; choose Mac above for that."
                  : "For Outlook on Windows. Outlook for Mac cannot open this kind of file."}{" "}
              Your pictures are saved inside the file, so they always show.
            </p>
            {DEVELOPER_VIEW && (
              <button type="button" className="self-start text-xs text-neutral-500 underline" onClick={() => setDeveloperView(true)}>
                Developer view: formats and verification status
              </button>
            )}
          </>
        ) : (
          <>
        <DialogHeader>
          <DialogTitle>Export (developer view)</DialogTitle>
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

          </>
        )}

        <TextAd placement="export-dialog" />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || selected.size === 0 || needsAck} onClick={run}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} {developerView ? "Download ZIP" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
