"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playSfx, primeSfx, setSfxEnabled, useSfxEnabled } from "@/lib/client/sfx";
import { resolveDrop, type Box, type RowGeometry } from "@/lib/editor/drop-target";
import { COLUMNS_TYPE, allModules, findModule, type EmailDocument } from "@/lib/email/document";
import { getModule } from "@/lib/email/registry";
import { renderEmailHtml } from "@/lib/email/render";
import { useEditor } from "./context";
import { useDrag, type DropResolver } from "./drag";

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

  /* ---- drag and drop onto the email ---- */
  const drag = useDrag();
  const docRef = useRef(state.doc);
  useEffect(() => {
    docRef.current = state.doc;
  }, [state.doc]);

  useEffect(() => {
    const resolver: DropResolver = (clientX, clientY, payload) => {
      const f = frame.current;
      const d = f?.contentDocument;
      const win = d?.defaultView;
      if (!f || !d || !win) return null;
      const fr = f.getBoundingClientRect();
      if (clientX < fr.left || clientX > fr.right || clientY < fr.top || clientY > fr.bottom) return null;
      const x = clientX - fr.left;
      const y = clientY - fr.top;
      // Nudge the email along when the pointer is near the top or bottom of the preview.
      if (y < 48) win.scrollBy(0, -14);
      else if (y > fr.height - 48) win.scrollBy(0, 14);

      const box = (el: Element): Box => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const find = (id: string) => d.querySelector(`[data-module-id="${CSS.escape(id)}"]`);
      const rows: RowGeometry[] = docRef.current.modules.flatMap((m) => {
        const el = find(m.id);
        if (!el) return [];
        const cells = m.columns ? [...el.querySelectorAll("[data-column]")] : [];
        return [
          {
            id: m.id,
            box: box(el),
            ...(m.columns && cells.length === m.columns.length
              ? { columns: m.columns.map((c, i) => ({ box: box(cells[i]), blocks: c.blocks.flatMap((b) => { const be = find(b.id); return be ? [{ id: b.id, box: box(be) }] : []; }) })) }
              : {}),
          },
        ];
      });
      const moving = payload.kind === "move" ? findModule(docRef.current, payload.id) : undefined;
      const table = d.querySelector("table table");
      const hit = resolveDrop(rows, x, y, {
        draggingRow: (moving?.type ?? (payload.kind === "new" ? payload.type : "")) === COLUMNS_TYPE,
        movingId: moving?.id,
        content: table ? box(table) : { left: 40, top: 24, right: fr.width - 40, bottom: 104 },
      });
      // Convert to screen coordinates and keep the mark inside the preview frame.
      const clampY = (v: number) => Math.max(fr.top, Math.min(fr.bottom, v + fr.top));
      return { ...hit, box: { left: hit.box.left + fr.left, right: hit.box.right + fr.left, top: clampY(hit.box.top), bottom: clampY(hit.box.bottom) } };
    };
    drag.setResolver(resolver);
    return () => drag.setResolver(null);
  }, [drag]);

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
      if (drag.consumeClick()) return;
      dispatch({ type: "select", id: el?.getAttribute("data-module-id") ?? null });
    });

    // Press on a module and move to drag it. While the button is held the browser may keep
    // sending pointer events to this frame, so they are forwarded in screen coordinates.
    let pressed: { id: string; x: number; y: number } | null = null;
    const toScreen = (e: PointerEvent) => {
      const fr = frame.current!.getBoundingClientRect();
      return [e.clientX + fr.left, e.clientY + fr.top] as const;
    };
    doc.addEventListener("pointerdown", (e) => {
      const id = e.button === 0 ? (e.target as HTMLElement).closest?.("[data-module-id]")?.getAttribute("data-module-id") : null;
      pressed = id ? { id, x: e.clientX, y: e.clientY } : null;
    });
    doc.addEventListener("pointermove", (e) => {
      const [sx, sy] = toScreen(e);
      if (drag.isActive()) return drag.move(sx, sy);
      if (!pressed || Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 6) return;
      const m = findModule(docRef.current, pressed.id);
      if (m) drag.begin({ kind: "move", id: m.id }, getModule(m.type)?.name ?? m.type, sx, sy);
      pressed = null;
    });
    doc.addEventListener("pointerup", () => {
      pressed = null;
      if (drag.isActive()) drag.end();
    });
    doc.addEventListener("dragstart", (e) => e.preventDefault());
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
