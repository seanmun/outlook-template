"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { SavedModule } from "@/lib/client/saved-modules";
import { docOps, instantiateSaved, type Destination } from "@/lib/editor/state";
import { COLUMNS_TYPE, newModuleId } from "@/lib/email/document";
import { getModule } from "@/lib/email/registry";
import { CONTENT_WIDTH, renderEmailHtml } from "@/lib/email/render";
import { useEditor } from "./context";
import { useDrag, useDragSource } from "./drag";

const THUMB_WIDTH = 270;
const THUMB_MAX_HEIGHT = 120;
/** The renderer's page padding above the email, cropped out of the thumbnail. */
const PAGE_PADDING = 24;

/** A small live picture of a saved module, drawn by the same renderer as the email. */
export function Thumbnail({ html }: { html: string }) {
  const [height, setHeight] = useState(60);
  const scale = THUMB_WIDTH / CONTENT_WIDTH;
  const shown = Math.min(THUMB_MAX_HEIGHT, height * scale);
  return (
    <span className="relative block overflow-hidden rounded-sm bg-white" style={{ width: THUMB_WIDTH, height: shown }} aria-hidden>
      <iframe
        title="Saved module preview"
        tabIndex={-1}
        sandbox="allow-same-origin"
        srcDoc={html}
        scrolling="no"
        onLoad={(e) => {
          const table = e.currentTarget.contentDocument?.querySelector("table table");
          if (table) setHeight(table.getBoundingClientRect().height);
        }}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{ width: CONTENT_WIDTH, height: height + PAGE_PADDING * 2, transform: `scale(${scale}) translateY(-${PAGE_PADDING}px)` }}
      />
      {height * scale > THUMB_MAX_HEIGHT && <span className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />}
    </span>
  );
}

function SavedCard({ item, dest }: { item: SavedModule; dest: Destination }) {
  const { state, change, assets, assetsVersion, saved } = useEditor();
  const drag = useDrag();
  const dragSource = useDragSource();
  const brandId = state.doc.brandId;
  // Checked against this email's brand; null when the brand does not offer that module.
  const usable = useMemo(() => {
    const d = { schemaVersion: 1 as const, brandId, title: "", subject: "", modules: [] };
    const m = instantiateSaved(d, item.module);
    return m ? { ...d, modules: [m] } : null;
  }, [item.module, brandId]);
  const html = useMemo(() => {
    void assetsVersion;
    return usable ? renderEmailHtml(usable, { resolveImage: (s) => assets.previewUrl(s) }) : null;
  }, [usable, assets, assetsVersion]);
  const kind = item.module.type === COLUMNS_TYPE ? "Row" : (getModule(item.module.type)?.name ?? item.module.type);

  return (
    <li className="group relative">
      <button
        type="button"
        disabled={!usable}
        {...(usable ? dragSource({ kind: "saved", module: item.module }, item.name) : {})}
        onClick={() => {
          if (drag.consumeClick()) return;
          const id = newModuleId();
          change((d) => docOps.addSaved(d, item.module, dest, id), { select: id });
        }}
        title={usable ? "Click to add, or drag onto the email" : "This brand does not include that kind of module"}
        className="block w-full cursor-grab rounded-md border bg-neutral-50 p-1.5 text-left transition hover:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {html && <Thumbnail html={html} />}
        <span className="mt-1.5 block truncate pr-5 text-xs font-medium text-neutral-800">{item.name}</span>
        <span className="block text-[11px] text-neutral-500">{usable ? kind : `${kind} · not available in this brand`}</span>
      </button>
      <button
        type="button"
        aria-label={`Remove saved module ${item.name}`}
        title="Remove from saved"
        onClick={() => saved.remove(item.id)}
        className="absolute right-1.5 bottom-2 rounded p-0.5 text-neutral-400 opacity-0 transition group-hover:opacity-100 hover:bg-neutral-200 hover:text-red-600 focus-visible:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

/** The user's saved blocks and rows. `blockDest` is where a clicked block goes; rows always go to the top level. */
export function SavedModules({ blockDest, rowDest }: { blockDest: Destination; rowDest: Destination }) {
  const { saved } = useEditor();
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Saved{saved.items.length > 0 && ` (${saved.items.length})`}</h3>
      {saved.items.length === 0 ? (
        <p className="text-xs text-neutral-500">Build a block or a whole row once, then reuse it: select it on the email and press the bookmark in its toolbar.</p>
      ) : (
        <>
          <ul className="grid gap-1.5">
            {saved.items.map((item) => (
              <SavedCard key={item.id} item={item} dest={item.module.type === COLUMNS_TYPE ? rowDest : blockDest} />
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-neutral-500">{saved.inAccount ? "Saved to your account." : "Saved in this browser."}</p>
        </>
      )}
    </section>
  );
}
