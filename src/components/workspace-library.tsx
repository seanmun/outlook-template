"use client";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Thumbnail } from "@/components/editor/saved-modules";
import { useConfig } from "@/lib/client/config";
import { useSavedModules, type SavedModule } from "@/lib/client/saved-modules";
import { storesFor, type AssetClient, type LibraryImage } from "@/lib/client/stores";
import { COLUMNS_TYPE } from "@/lib/email/document";
import { getModule } from "@/lib/email/registry";
import { renderEmailHtml } from "@/lib/email/render";

function SavedBlockCard({ item, assets, onRemove }: { item: SavedModule; assets: AssetClient; onRemove: () => void }) {
  // Drawn as the only thing in an email of the brand it was saved from. Null if that brand no longer offers it.
  const html = useMemo(() => {
    try {
      return renderEmailHtml({ schemaVersion: 1, brandId: item.brandId, title: "", subject: "", modules: [item.module] }, { resolveImage: (s) => assets.previewUrl(s) });
    } catch {
      return null;
    }
  }, [item, assets]);
  const kind = item.module.type === COLUMNS_TYPE ? "Row" : (getModule(item.module.type)?.name ?? item.module.type);
  return (
    <li className="flex flex-col border bg-white p-2">
      <div className="flex min-h-16 items-center justify-center overflow-hidden bg-neutral-50">{html && <Thumbnail html={html} />}</div>
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.name}</div>
          <div className="text-xs text-neutral-500">{kind}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label={`Remove saved block ${item.name}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/** The user's saved blocks and uploaded images, shown under their emails on the "My emails" page. */
export function WorkspaceLibrary() {
  const config = useConfig();
  const inAccount = config.mode === "production" && !!config.userId;
  const { assets } = useMemo(() => storesFor(config.mode), [config.mode]);
  const saved = useSavedModules(config.userId ?? "local", inAccount);
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const where = inAccount ? "Saved to your account." : "Saved in this browser only.";

  useEffect(() => {
    let stale = false;
    assets
      .list()
      .then((l) => !stale && setImages(l))
      .catch(() => !stale && setImages([]));
    return () => {
      stale = true;
    };
  }, [assets]);

  return (
    <>
      <section aria-labelledby="saved-blocks-heading">
        <h2 id="saved-blocks-heading" className="mb-1 text-sm font-semibold text-neutral-700">
          Saved blocks{saved.items.length > 0 && ` (${saved.items.length})`}
        </h2>
        <p className="mb-2 text-xs text-neutral-500">Blocks and rows you saved for reuse. Add them to any email from the Saved list in the editor. {where}</p>
        {saved.items.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet. In the editor, select a block or row and press the bookmark in its toolbar.</p>
        ) : (
          // Images in saved blocks are only available once the image list has loaded, so the cards are keyed to redraw then.
          <ul key={images ? "ready" : "loading"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.items.map((item) => (
              <SavedBlockCard
                key={item.id}
                item={item}
                assets={assets}
                onRemove={() => {
                  if (confirm(`Remove the saved block "${item.name}"? Emails that already use it are not affected.`)) saved.remove(item.id);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="images-heading">
        <h2 id="images-heading" className="mb-1 text-sm font-semibold text-neutral-700">
          Your images{images && images.length > 0 ? ` (${images.length})` : ""}
        </h2>
        <p className="mb-2 text-xs text-neutral-500">Every picture you have uploaded. Pick one in the editor with &ldquo;Choose from your library&rdquo;. {where}</p>
        {images === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : images.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet. Drop a picture onto an email in the editor to upload it.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((img) => (
              <li key={img.src.kind === "asset" ? img.src.assetId : img.thumbUrl} className="border bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, per-user images served by our own API or held in the browser */}
                <img src={img.thumbUrl} alt="" loading="lazy" className="h-24 w-full bg-neutral-50 object-contain" />
                <div className="mt-1.5 truncate text-xs font-medium" title={img.name}>
                  {img.name}
                </div>
                <div className="text-[11px] text-neutral-500">
                  {img.width} × {img.height}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
