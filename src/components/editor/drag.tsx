"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { playSfx } from "@/lib/client/sfx";
import type { DropHit } from "@/lib/editor/drop-target";
import { docOps, type DragPayload } from "@/lib/editor/state";
import { newModuleId } from "@/lib/email/document";
import { useEditor } from "./context";

/** Given a pointer position on screen, says where a drop would land (in screen coordinates), or null when not over the email. */
export type DropResolver = (clientX: number, clientY: number, payload: DragPayload) => DropHit | null;

interface DragApi {
  begin(payload: DragPayload, label: string, clientX: number, clientY: number): void;
  move(clientX: number, clientY: number): void;
  end(): void;
  cancel(): void;
  isActive(): boolean;
  /** True once, right after a drag: lets a button ignore the click that ends a drag started on it. */
  consumeClick(): boolean;
  setResolver(resolver: DropResolver | null): void;
}

const DragContext = createContext<DragApi | null>(null);

export function useDrag(): DragApi {
  const v = useContext(DragContext);
  if (!v) throw new Error("DragProvider missing");
  return v;
}

/** Makes an element a drag source: press and move a few pixels to start dragging; a plain click still works. */
export function useDragSource() {
  const drag = useDrag();
  return useCallback(
    (payload: DragPayload, label: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const { clientX: sx, clientY: sy } = e;
        const stop = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", stop);
        };
        const onMove = (ev: PointerEvent) => {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          stop();
          drag.begin(payload, label, ev.clientX, ev.clientY);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", stop);
      },
      style: { touchAction: "none" as const },
    }),
    [drag],
  );
}

interface ActiveDrag {
  payload: DragPayload;
  label: string;
  x: number;
  y: number;
  hit: DropHit | null;
}

export function DragProvider({ children }: { children: React.ReactNode }) {
  const { change } = useEditor();
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const current = useRef<ActiveDrag | null>(null);
  const resolver = useRef<DropResolver | null>(null);
  const dragged = useRef(false);

  const api = useMemo<DragApi>(() => {
    const update = (next: ActiveDrag | null) => {
      current.current = next;
      setActive(next);
    };
    return {
      begin(payload, label, x, y) {
        playSfx("move");
        update({ payload, label, x, y, hit: resolver.current?.(x, y, payload) ?? null });
      },
      move(x, y) {
        const d = current.current;
        if (d) update({ ...d, x, y, hit: resolver.current?.(x, y, d.payload) ?? null });
      },
      end() {
        const d = current.current;
        if (!d) return;
        update(null);
        dragged.current = true;
        setTimeout(() => (dragged.current = false), 0);
        if (!d.hit) return;
        const { payload, hit } = d;
        const id = payload.kind === "move" ? payload.id : newModuleId();
        change((doc) => docOps.drop(doc, payload, hit.target, id), { select: id });
      },
      cancel() {
        update(null);
      },
      isActive: () => !!current.current,
      consumeClick() {
        const was = dragged.current;
        dragged.current = false;
        return was;
      },
      setResolver(r) {
        resolver.current = r;
      },
    };
  }, [change]);

  const dragging = !!active;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => api.move(e.clientX, e.clientY);
    const up = () => api.end();
    const key = (e: KeyboardEvent) => e.key === "Escape" && api.cancel();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", api.cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", api.cancel);
      window.removeEventListener("keydown", key);
    };
  }, [dragging, api]);

  const hit = active?.hit;
  return (
    <DragContext.Provider value={api}>
      {children}
      {active && (
        // Sits above everything, including the preview iframe, so the pointer keeps reporting to this window.
        <div className="fixed inset-0 z-[70] cursor-grabbing select-none" data-drag-layer>
          {hit && (
            <div
              className={`pointer-events-none fixed rounded-sm ${hit.mark === "fill" ? "border-2 border-dashed border-blue-500 bg-blue-500/15" : "bg-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,.25),0_0_18px_rgba(37,99,235,.7)]"} animate-pulse`}
              style={{ left: hit.box.left, top: hit.box.top, width: hit.box.right - hit.box.left, height: hit.box.bottom - hit.box.top }}
              data-drop-mark={hit.mark}
            >
              {hit.label && (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white">{hit.label}</span>
              )}
            </div>
          )}
          <div
            className={`pointer-events-none fixed flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold shadow-lg transition-colors ${
              hit ? "border-blue-600 bg-blue-600 text-white" : "border-neutral-300 bg-white text-neutral-700"
            }`}
            style={{ left: active.x + 14, top: active.y + 14, transform: "rotate(-2deg)" }}
          >
            {active.label}
          </div>
        </div>
      )}
    </DragContext.Provider>
  );
}
