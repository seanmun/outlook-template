"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AssetClient, LibraryImage, UploadedImage } from "@/lib/client/stores";

/** Grid of every image the user has uploaded; picking one places it without uploading again. */
export function ImageLibraryDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; assets: AssetClient; onPick: (image: UploadedImage) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Image library</DialogTitle>
          <DialogDescription>Every image you have uploaded. Pick one to use it here.</DialogDescription>
        </DialogHeader>
        {props.open && (
          <LibraryGrid
            assets={props.assets}
            onPick={(image) => {
              props.onPick(image);
              props.onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LibraryGrid({ assets, onPick }: { assets: AssetClient; onPick: (image: UploadedImage) => void }) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    assets.list().then(
      (list) => !cancelled && setImages(list),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [assets]);

  if (error) return <p className="text-sm text-red-600">Could not load your images: {error}</p>;
  if (!images) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (images.length === 0) return <p className="text-sm text-neutral-500">No images yet. Upload one and it will appear here for reuse.</p>;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {images.map((image) => (
        <li key={image.src.kind === "asset" ? image.src.assetId : image.src.sampleId}>
          <button
            type="button"
            onClick={() => onPick({ src: image.src, width: image.width, height: image.height })}
            className="group block w-full rounded-md border bg-white p-1.5 text-left transition hover:border-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <span className="flex aspect-square items-center justify-center overflow-hidden rounded bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.thumbUrl} alt={image.name} loading="lazy" className="max-h-full max-w-full object-contain" />
            </span>
            <span className="mt-1.5 block truncate text-xs font-medium text-neutral-800">{image.name}</span>
            <span className="block text-[11px] text-neutral-500">
              {image.width} × {image.height}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
