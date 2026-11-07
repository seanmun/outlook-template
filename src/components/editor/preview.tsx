"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderEmailHtml } from "@/lib/email/render";
import { useEditor } from "./context";

/**
 * Renders the exact HTML the exporters use (plus preview-only annotations) in
 * an iframe so the app's CSS cannot leak in. `sandbox` without allow-scripts:
 * nothing in the email can execute. allow-same-origin lets the parent attach
 * the click-to-select handler and lets /api/assets images load with the session.
 */
export function Preview() {
  const { state, dispatch, assets, assetsVersion } = useEditor();
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);
  const [width, setWidth] = useState<"desktop" | "narrow">("desktop");
  const [html, setHtml] = useState("");

  const rendered = useMemo(() => {
    void assetsVersion;
    try {
      return renderEmailHtml(state.doc, { resolveImage: (s) => assets.previewUrl(s), annotate: true, selectedModuleId: state.selectedId });
    } catch (e) {
      return `<p style="font-family:sans-serif;padding:20px;color:#b91c1c">Preview error: ${String((e as Error).message).replace(/</g, "&lt;")}</p>`;
    }
  }, [state.doc, state.selectedId, assets, assetsVersion]);

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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-white px-3 py-1.5 text-xs text-neutral-500">
        <span>Browser preview: approximate. Outlook rendering can differ, so test in Outlook before sending.</span>
        <div className="flex gap-1">
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
