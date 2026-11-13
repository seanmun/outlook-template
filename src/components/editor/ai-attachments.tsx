"use client";
import { useRef, useState } from "react";
import { FileText, ImagePlus, Loader2, ScanSearch, X } from "lucide-react";
import { toast } from "sonner";
import type { AssetClient } from "@/lib/client/stores";
import { MAX_REFERENCE_BYTES } from "@/lib/ai/reference";

/** A design comp the AI looks at for layout and copy. It is never placed in the email. */
export interface CompAttachment {
  name: string;
  base64: string;
  /** Object URL for image comps; null for PDFs. */
  previewUrl: string | null;
}

/** An image uploaded to the library that the AI may place in the email. */
export interface EmailImageAttachment {
  assetId: string;
  name: string;
  width: number;
  height: number;
  thumbUrl: string | null;
}

export const MAX_EMAIL_IMAGES = 8;
const COMP_TYPES = "image/png,image/jpeg,image/gif,image/webp,application/pdf";
const IMAGE_TYPES = "image/png,image/jpeg,image/gif";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(",") + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function DropZone(props: { icon: React.ReactNode; title: string; hint: string; accept: string; multiple?: boolean; busy?: boolean; onFiles: (files: File[]) => void; children?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        props.onFiles([...e.dataTransfer.files]);
      }}
      className={`rounded-md border border-dashed p-2 transition ${over ? "border-neutral-900 bg-neutral-100" : "border-neutral-300"}`}
    >
      <input
        ref={input}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        className="hidden"
        onChange={(e) => {
          props.onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className="flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 text-neutral-500">{props.busy ? <Loader2 className="size-4 animate-spin" /> : props.icon}</span>
        <span className="min-w-0">
          <span className="block text-xs font-medium text-neutral-800">{props.title}</span>
          <span className="block text-[11px] leading-snug text-neutral-500">{props.hint}</span>
        </span>
      </button>
      {props.children}
    </div>
  );
}

export function AiAttachments(props: {
  assets: AssetClient;
  comp: CompAttachment | null;
  images: EmailImageAttachment[];
  onComp: (comp: CompAttachment | null) => void;
  onImages: (update: (images: EmailImageAttachment[]) => EmailImageAttachment[]) => void;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function addComp(files: File[]) {
    const file = files[0];
    if (!file) return;
    if (/\.(psd|psb|fig)$/i.test(file.name)) return void toast.error("Figma and Photoshop files are coming soon. For now, export the design as an image or PDF and add that.");
    if (!COMP_TYPES.split(",").includes(file.type)) return void toast.error("A comp must be a PNG, JPEG, GIF, WebP image or a PDF.");
    if (file.size > MAX_REFERENCE_BYTES) return void toast.error(`A comp must be ${MAX_REFERENCE_BYTES / 1024 / 1024} MB or smaller.`);
    if (props.comp?.previewUrl) URL.revokeObjectURL(props.comp.previewUrl);
    props.onComp({ name: file.name, base64: await fileToBase64(file), previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
  }

  async function addImages(files: File[]) {
    const room = MAX_EMAIL_IMAGES - props.images.length;
    if (files.length > room) toast.message(`Up to ${MAX_EMAIL_IMAGES} images per request. Extra files were skipped.`);
    setUploading(true);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        try {
          const up = await props.assets.upload(file);
          if (up.src.kind !== "asset") continue;
          const added: EmailImageAttachment = { assetId: up.src.assetId, name: file.name, width: up.width, height: up.height, thumbUrl: props.assets.previewUrl(up.src) };
          props.onImages((list) => [...list, added]);
          if (up.width < 600) toast.message(`${file.name} is only ${up.width}px wide. It will look soft at full email width (600px); 1200px is ideal.`);
        } catch (e) {
          toast.error(`${file.name}: ${(e as Error).message}`);
        }
      }
      props.onUploaded();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mb-2 grid grid-cols-2 gap-2">
      <DropZone icon={<ScanSearch className="size-4" />} title="Design comp" hint="For the AI to copy layout and wording. Image or PDF. Figma and Photoshop files are coming soon." accept={COMP_TYPES} onFiles={addComp}>
        {props.comp && (
          <div className="mt-2 flex items-center gap-1.5 rounded bg-neutral-100 p-1">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-white text-neutral-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {props.comp.previewUrl ? <img src={props.comp.previewUrl} alt="" className="max-h-full max-w-full object-contain" /> : <FileText className="size-4" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-700">{props.comp.name}</span>
            <button
              type="button"
              aria-label="Remove comp"
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
              onClick={() => {
                if (props.comp?.previewUrl) URL.revokeObjectURL(props.comp.previewUrl);
                props.onComp(null);
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </DropZone>
      <DropZone icon={<ImagePlus className="size-4" />} title="Images for the email" hint="Photos and logos the AI places for you. Saved to your library." accept={IMAGE_TYPES} multiple busy={uploading} onFiles={addImages}>
        {props.images.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {props.images.map((img) => (
              <li key={img.assetId} className="group relative size-9 overflow-hidden rounded border bg-white" title={`${img.name} (${img.width}×${img.height})`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {img.thumbUrl && <img src={img.thumbUrl} alt={img.name} className="size-full object-cover" />}
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  className="absolute inset-0 hidden items-center justify-center bg-black/55 text-white group-hover:flex focus-visible:flex"
                  onClick={() => props.onImages((list) => list.filter((x) => x.assetId !== img.assetId))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropZone>
    </div>
  );
}
