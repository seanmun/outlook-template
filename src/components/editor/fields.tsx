"use client";
import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, Images, Link2, Link2Off, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Brand } from "@/lib/email/brands";
import type { Align, ImageValue, Padding } from "@/lib/email/fields";
import { isSafeUrl } from "@/lib/email/html";
import type { AssetClient, UploadedImage } from "@/lib/client/stores";
import { ImageLibraryDialog } from "./image-library";

export function FieldShell({ label, help, error, htmlFor, children }: { label: string; help?: string; error?: string | null; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-neutral-700">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : help ? <p className="text-xs text-neutral-500">{help}</p> : null}
    </div>
  );
}

export function TextField(props: { id: string; label: string; value: string; maxLength: number; multiline?: boolean; help?: string; onChange: (v: string) => void }) {
  const C = props.multiline ? Textarea : Input;
  return (
    <FieldShell label={props.label} help={props.help} htmlFor={props.id}>
      <C id={props.id} value={props.value} maxLength={props.maxLength} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => props.onChange(e.target.value)} />
    </FieldShell>
  );
}

/** Commits only empty or valid absolute https/http/mailto URLs, so the document never holds an unsafe link. */
export function UrlField(props: { id: string; label: string; value: string; help?: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(props.value);
  const [prev, setPrev] = useState(props.value);
  if (props.value !== prev) {
    setPrev(props.value);
    setDraft(props.value);
  }
  const valid = draft.trim() === "" || isSafeUrl(draft.trim());
  return (
    <FieldShell label={props.label} help={props.help ?? (draft ? undefined : "Empty links are flagged before export.")} error={valid ? null : "Enter a full https://… or mailto: link."} htmlFor={props.id}>
      <Input
        id={props.id}
        value={draft}
        inputMode="url"
        placeholder="https://"
        aria-invalid={!valid}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = e.target.value.trim();
          if (v === "" || isSafeUrl(v)) props.onChange(v);
        }}
      />
    </FieldShell>
  );
}

export function NumberField(props: { id: string; label: string; value: number; min: number; max: number; step?: number; unit?: string; help?: string; onChange: (v: number) => void }) {
  const clamp = (n: number) => Math.max(props.min, Math.min(props.max, Math.round(n)));
  return (
    <FieldShell label={props.label} help={props.help} htmlFor={props.id}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={`${props.label} slider`}
          className="flex-1 accent-neutral-900"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={props.value}
          onChange={(e) => props.onChange(clamp(Number(e.target.value)))}
        />
        <Input
          id={props.id}
          type="number"
          className="h-8 w-20"
          min={props.min}
          max={props.max}
          value={props.value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && e.target.value !== "") props.onChange(clamp(n));
          }}
        />
        {props.unit && <span className="text-xs text-neutral-500">{props.unit}</span>}
      </div>
    </FieldShell>
  );
}

export function ColorField(props: { id: string; label: string; value: string; brand: Brand; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(props.value);
  const [prev, setPrev] = useState(props.value);
  if (props.value !== prev) {
    setPrev(props.value);
    setDraft(props.value);
  }
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft);
  return (
    <FieldShell label={props.label} error={valid ? null : "Use #rrggbb"} htmlFor={props.id}>
      <div className="flex flex-wrap items-center gap-1.5">
        {props.brand.palette.map((p) => (
          <button
            key={p.value}
            type="button"
            title={`${p.label} ${p.value}`}
            aria-label={`${p.label} ${p.value}`}
            onClick={() => props.onChange(p.value)}
            className={`size-6 rounded border ${props.value.toLowerCase() === p.value.toLowerCase() ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
            style={{ background: p.value }}
          />
        ))}
        <Input
          id={props.id}
          className="h-7 w-24 font-mono text-xs"
          value={draft}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) props.onChange(e.target.value.toLowerCase());
          }}
        />
      </div>
    </FieldShell>
  );
}

export function AlignField(props: { label: string; value: Align; onChange: (v: Align) => void }) {
  const opts: { v: Align; icon: React.ReactNode }[] = [
    { v: "left", icon: <AlignLeft /> },
    { v: "center", icon: <AlignCenter /> },
    { v: "right", icon: <AlignRight /> },
  ];
  return (
    <FieldShell label={props.label}>
      <div className="flex gap-1" role="radiogroup" aria-label={props.label}>
        {opts.map((o) => (
          <Button key={o.v} type="button" size="icon-sm" role="radio" aria-checked={props.value === o.v} aria-label={o.v} variant={props.value === o.v ? "secondary" : "ghost"} onClick={() => props.onChange(o.v)}>
            {o.icon}
          </Button>
        ))}
      </div>
    </FieldShell>
  );
}

const PADDING_MIN = 0;
const PADDING_MAX = 120;
const PADDING_STEP = 5;
const clampPadding = (n: number) => Math.max(PADDING_MIN, Math.min(PADDING_MAX, Math.round(n)));

/** One side of the padding cross: label, then [−] [number] [+]. Buttons step by 5; the box takes any exact value. */
function PaddingSide(props: { id: string; side: keyof Padding; value: number; onSet: (v: number) => void }) {
  const [draft, setDraft] = useState(String(props.value));
  const [prev, setPrev] = useState(props.value);
  if (props.value !== prev) {
    setPrev(props.value);
    setDraft(String(props.value));
  }
  const label = props.side.charAt(0).toUpperCase() + props.side.slice(1);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <label htmlFor={props.id} className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      <div className="flex items-center rounded-md border">
        <button
          type="button"
          aria-label={`Decrease ${props.side} padding by ${PADDING_STEP}`}
          className="flex size-7 items-center justify-center text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
          disabled={props.value <= PADDING_MIN}
          onClick={() => props.onSet(clampPadding(props.value - PADDING_STEP))}
        >
          <Minus className="size-3.5" />
        </button>
        <input
          id={props.id}
          type="text"
          inputMode="numeric"
          aria-label={`${label} padding in pixels`}
          className="h-7 w-9 border-x bg-transparent text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-neutral-400"
          value={draft}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
            setDraft(raw);
            if (raw !== "") props.onSet(clampPadding(Number(raw)));
          }}
          onBlur={() => setDraft(String(props.value))}
        />
        <button
          type="button"
          aria-label={`Increase ${props.side} padding by ${PADDING_STEP}`}
          className="flex size-7 items-center justify-center text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
          disabled={props.value >= PADDING_MAX}
          onClick={() => props.onSet(clampPadding(props.value + PADDING_STEP))}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function PaddingField(props: { id: string; label: string; value: Padding; onChange: (v: Padding) => void }) {
  const allEqual = props.value.top === props.value.right && props.value.right === props.value.bottom && props.value.bottom === props.value.left;
  const [linked, setLinked] = useState(allEqual);
  const set = (side: keyof Padding, v: number) => props.onChange(linked ? { top: v, right: v, bottom: v, left: v } : { ...props.value, [side]: v });
  const side = (s: keyof Padding) => <PaddingSide id={`${props.id}-${s}`} side={s} value={props.value[s]} onSet={(v) => set(s, v)} />;
  return (
    <FieldShell label={props.label} help={`± buttons step by ${PADDING_STEP}px. Type in the box for an exact value (${PADDING_MIN}–${PADDING_MAX}).`}>
      <div className="grid grid-cols-3 items-center justify-items-center gap-y-1.5 rounded-md bg-neutral-50 py-2">
        <div />
        {side("top")}
        <div />
        {side("left")}
        <Button
          type="button"
          size="icon-sm"
          variant={linked ? "secondary" : "ghost"}
          aria-pressed={linked}
          aria-label={linked ? "Unlink sides" : "Link all sides"}
          title={linked ? "Sides linked: changing one sets all four" : "Link all sides"}
          onClick={() => setLinked((l) => !l)}
        >
          {linked ? <Link2 /> : <Link2Off />}
        </Button>
        {side("right")}
        <div />
        {side("bottom")}
        <div />
      </div>
    </FieldShell>
  );
}

export function ImageField(props: {
  id: string;
  label: string;
  value: ImageValue;
  maxWidth: number;
  allowLink?: boolean;
  help?: string;
  assets: AssetClient;
  previewUrl: string | null;
  onChange: (v: ImageValue) => void;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const v = props.value;
  const ratio = v.naturalWidth && v.naturalHeight ? v.naturalHeight / v.naturalWidth : null;

  function applyImage(up: UploadedImage) {
    const width = Math.min(props.maxWidth, up.width, v.src ? v.width : props.maxWidth);
    props.onChange({ ...v, src: up.src, naturalWidth: up.width, naturalHeight: up.height, width: Math.max(16, width) });
    props.onUploaded();
    if (up.width < width * 2) toast.message("Tip: images at 2× display width look sharper on high-DPI screens.");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      applyImage(await props.assets.upload(file));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <FieldShell label={props.label} help={props.help}>
      <div className="space-y-2 rounded-md border p-2">
        <div className="flex items-center gap-2">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100 text-[10px] text-neutral-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {v.src && props.previewUrl ? <img src={props.previewUrl} alt="" className="max-h-full max-w-full object-contain" /> : "No image"}
          </div>
          <div className="flex flex-col gap-1">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <ImagePlus /> {uploading ? "Uploading…" : v.src ? "Replace" : "Upload"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLibraryOpen(true)}>
              <Images /> Library
            </Button>
            <ImageLibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} assets={props.assets} onPick={applyImage} />
            {v.src && (
              <Button type="button" size="sm" variant="ghost" onClick={() => props.onChange({ ...v, src: null, naturalWidth: null, naturalHeight: null })}>
                <Trash2 /> Remove
              </Button>
            )}
          </div>
        </div>
        <TextField id={`${props.id}-alt`} label="Alt text" value={v.alt} maxLength={300} help="Describes the image for screen readers and when images are blocked." onChange={(alt) => props.onChange({ ...v, alt })} />
        <NumberField
          id={`${props.id}-width`}
          label="Display width"
          unit="px"
          min={16}
          max={props.maxWidth}
          value={Math.min(v.width, props.maxWidth)}
          help={ratio ? `Height ${Math.round(Math.min(v.width, props.maxWidth) * ratio)}px (keeps aspect ratio). Limited by module padding.` : "Height follows the image's aspect ratio."}
          onChange={(width) => props.onChange({ ...v, width })}
        />
        {props.allowLink && <UrlField id={`${props.id}-link`} label="Image link (optional)" value={v.linkUrl ?? ""} help="Optional." onChange={(linkUrl) => props.onChange({ ...v, linkUrl })} />}
      </div>
    </FieldShell>
  );
}

/** Keeps a callback ref fresh without re-subscribing listeners. */
export function useLatest<T>(value: T) {
  const r = useRef(value);
  useEffect(() => {
    r.current = value;
  }, [value]);
  return r;
}
