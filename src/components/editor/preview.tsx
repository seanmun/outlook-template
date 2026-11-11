"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playSfx, primeSfx, setSfxEnabled, useSfxEnabled } from "@/lib/client/sfx";
import { allModules, type EmailDocument } from "@/lib/email/document";
import { renderEmailHtml } from "@/lib/email/render";
import { useEditor } from "./context";

/**
 * Renders the exact HTML the exporters use (plus preview-only annotations) in
 * an iframe so the app's CSS cannot leak in. `sandbox` without allow-scripts:
 * nothing in the email can execute. allow-same-origin lets the parent attach
 * the click-to-select handler and lets /api/assets images load with the session.
 */
/** What changed between two versions of the document, for the drop animation and sounds. */
function diffModules(before: EmailDocument, after: EmailDocument) {
  const old = new Set(allModules(before).map((m) => m.id));
  const now = allModules(after);
  const nowIds = new Set(now.map((m) => m.id));
  // A new row animates as one piece, so blocks inside a new row are not listed separately.
  const added = after.modules.flatMap((m) => (old.has(m.id) ? (m.columns?.flatMap((c) => c.blocks) ?? []).filter((b) => !old.has(b.id)).map((b) => b.id) : [m.id]));
  const removed = [...old].filter((id) => !nowIds.has(id)).length;
  const order = (d: EmailDocument) => allModules(d).map((m) => m.id).join(",");
  return { added, removed, moved: !added.length && !removed && order(before) !== order(after) };
}

export function Preview() {
  const { state, dispatch, assets, assetsVersion } = useEditor();
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);
  const [width, setWidth] = useState<"desktop" | "narrow">("desktop");
  const [html, setHtml] = useState("");
  const sound = useSfxEnabled();

  // Newly added modules drop into place once. Any later re-render (another edit, a selection change) clears them.
  const [seen, setSeen] = useState({ doc: state.doc, selectedId: state.selectedId, dropped: [] as string[] });
  if (seen.doc !== state.doc) setSeen({ doc: state.doc, selectedId: state.selectedId, dropped: diffModules(seen.doc, state.doc).added });
  else if (seen.selectedId !== state.selectedId) setSeen({ doc: state.doc, selectedId: state.selectedId, dropped: [] });

  const lastDoc = useRef(state.doc);
  useEffect(() => {
    const change = diffModules(lastDoc.current, state.doc);
    lastDoc.current = state.doc;
    if (change.added.length) playSfx("drop", change.added.length);
    else if (change.removed) playSfx("remove");
    else if (change.moved) playSfx("move");
  }, [state.doc]);

  const rendered = useMemo(() => {
    void assetsVersion;
    try {
      return renderEmailHtml(state.doc, { resolveImage: (s) => assets.previewUrl(s), annotate: true, selectedModuleId: state.selectedId, animateModuleIds: seen.dropped });
    } catch (e) {
      return `<p style="font-family:sans-serif;padding:20px;color:#b91c1c">Preview error: ${String((e as Error).message).replace(/</g, "&lt;")}</p>`;
    }
  }, [state.doc, state.selectedId, assets, assetsVersion, seen.dropped]);

  // Light debounce so typing doesn't reload the frame on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setHtml(rendered), 120);
    return () => clearTimeout(t);
  }, [rendered]);

  function onLoad() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.defaultView?.scrollTo(0, scroll.current);
    doc.addEventListener("scroll", () => (scroll.current = doc.defaultView?.scrollY ?? 0), { passive: true });
    doc.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest?.("[data-module-id]");
      if ((e.target as HTMLElement).closest?.("a")) e.preventDefault();
      dispatch({ type: "select", id: el?.getAttribute("data-module-id") ?? null });
    });
  }

  return (
    <div className="flex h-full flex-col" onPointerDownCapture={primeSfx}>
      <div className="flex items-center justify-between border-b bg-white px-3 py-1.5 text-xs text-neutral-500">
        <span>Browser preview: approximate. Outlook rendering can differ, so test in Outlook before sending.</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={sound ? "Turn sound effects off" : "Turn sound effects on"}
            title={sound ? "Sound effects on" : "Sound effects off"}
            onClick={() => {
              setSfxEnabled(!sound);
              if (!sound) playSfx("move");
            }}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button variant={width === "desktop" ? "secondary" : "ghost"} size="icon-sm" aria-label="Desktop width" onClick={() => setWidth("desktop")}>
            <Monitor />
          </Button>
          <Button
            variant={width === "narrow" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Narrow width (phone)"
            title="Phone width. Layout is a fixed 600px with no responsive breakpoints; phones usually scale it down."
            onClick={() => setWidth("narrow")}
          >
            <Smartphone />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
        <iframe
          ref={frame}
          title="Email preview"
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={onLoad}
          className="h-full rounded border bg-white shadow-sm"
          style={{ width: width === "desktop" ? 680 : 375 }}
        />
      </div>
    </div>
  );
}
