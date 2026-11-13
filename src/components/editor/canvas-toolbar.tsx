"use client";
import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bold, Bookmark, Check, Copy, Eraser, ImageOff, ImagePlus, Images, Italic, Link as LinkIcon, List, Minus, Plus, Trash2, UnfoldVertical, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { moduleInnerWidth } from "@/lib/editor/image-field";
import { docOps } from "@/lib/editor/state";
import { locateModule, newModuleId, type ModuleInstance } from "@/lib/email/document";
import type { Align, ImageValue, Padding } from "@/lib/email/fields";
import { isSafeUrl } from "@/lib/email/html";
import { getModule } from "@/lib/email/registry";
import { useEditor } from "./context";

export interface TextFormats {
  bold: boolean;
  italic: boolean;
  list: boolean;
  link: string | null;
}

export interface EditingField {
  moduleId: string;
  field: string;
  kind: "text" | "richtext";
}

/** The one-line box that replaces the toolbar while an address, a description or a name is typed. */
type Box =
  /** A link on the selected words of a text field. */
  | { kind: "textlink"; value: string }
  /** One of the module's own links (button, image, social icon). `target` names it. */
  | { kind: "link"; value: string; target: string }
  | { kind: "alt"; value: string; field: string }
  | { kind: "save"; value: string };

/**
 * The bar that floats above the selected module on the canvas. Text tools
 * appear while a text field is being edited; module tools are always there.
 */
export function CanvasToolbar(props: {
  module: ModuleInstance;
  editing: EditingField | null;
  formats: TextFormats;
  /** Runs a formatting command on the text selection in the canvas. */
  onFormat: (command: "bold" | "italic" | "insertUnorderedList" | "unlink") => void;
  /** Called before the link box takes focus, so the text selection can be kept. */
  onLinkOpen: () => void;
  /** Applies a link to the kept selection, or gives focus back when url is null. */
  onLinkClose: (url: string | null) => void;
  /** Called before a setting change that re-renders the canvas, so the text cursor can be put back. */
  onBeforeRestyle: () => void;
  /** Starts an upload into, or opens the library for, one of the module's image fields. */
  /** "cutout" removes the picture's plain background and swaps in the transparent version. */
  onImage: (action: "upload" | "library" | "cutout", field: string) => void;
  /** A link the user clicked on the canvas (e.g. one social icon): its box opens straight away. `n` changes per click. */
  linkAsk: { key: string; n: number } | null;
}) {
  const { state, change, brand, saved } = useEditor();
  const m = props.module;
  const def = getModule(m.type);
  const [box, setBox] = useState<Box | null>(null);
  const [palette, setPalette] = useState<"background" | "text" | "links" | "image" | null>(null);
  const [answered, setAnswered] = useState(0);
  if (!def) return null;

  const settings = m.settings as Record<string, unknown>;
  const content = m.content as Record<string, unknown>;
  const setContent = (key: string, value: unknown) => {
    props.onBeforeRestyle();
    change((d) => docOps.setContent(d, m.id, key, value), { coalesceKey: `${m.id}:c:${key}` });
  };

  /* ---- the module's image, if it has one ---- */
  const imageSpec = def.contentFields.find((f) => f.kind === "image");
  const image = imageSpec ? (content[imageSpec.key] as ImageValue) : null;
  const imageMax = imageSpec?.kind === "image" ? Math.min(imageSpec.maxWidth, moduleInnerWidth(state.doc, m.id)) : 0;
  const imageWidth = image ? Math.min(image.width, imageMax) : 0;

  /* ---- the module's own links: url fields in use, and the link on an image ---- */
  const inUse = def.activeLinks?.(content);
  const links = def.contentFields.flatMap((f) => {
    if (f.kind === "url" && (!inUse || inUse.includes(f.key))) return [{ id: f.key, label: f.label, value: String(content[f.key] ?? ""), optional: !!f.optional, apply: (url: string) => setContent(f.key, url) }];
    if (f.kind === "image" && f.allowLink) {
      const img = content[f.key] as ImageValue;
      return [{ id: `${f.key}.link`, label: "Image link", value: img.linkUrl ?? "", optional: true, apply: (url: string) => setContent(f.key, { ...img, linkUrl: url }) }];
    }
    return [];
  });
  const openLink = (id: string) => {
    const target = links.find((l) => l.id === id);
    if (target) setBox({ kind: "link", value: target.value || "https://", target: id });
    setPalette(null);
  };
  if (props.linkAsk && props.linkAsk.n !== answered) {
    setAnswered(props.linkAsk.n);
    openLink(props.linkAsk.key);
  }
  const has = (key: string) => def.settingFields.some((f) => f.key === key);
  const set = (key: string, value: unknown) => {
    props.onBeforeRestyle();
    change((d) => docOps.setSetting(d, m.id, key, value), { coalesceKey: `${m.id}:s:${key}` });
  };

  const field = props.editing ? def.contentFields.find((f) => f.key === props.editing!.field) : undefined;
  const styled = field && (field.kind === "text" || field.kind === "richtext") ? field : undefined;
  const sizeSpec = styled?.sizeSetting ? def.settingFields.find((f) => f.key === styled.sizeSetting) : undefined;
  const size = sizeSpec?.kind === "number" ? { key: sizeSpec.key, value: Number(settings[sizeSpec.key]), min: sizeSpec.min, max: sizeSpec.max } : null;
  const colorKey = styled?.colorSetting && has(styled.colorSetting) ? styled.colorSetting : null;
  const padding = has("padding") ? (settings.padding as Padding) : null;
  const at = locateModule(state.doc, m.id);
  const siblings = at ? (at.parentId === null ? state.doc.modules.length : (state.doc.modules.find((x) => x.id === at.parentId)?.columns?.[at.column].blocks.length ?? 0)) : 0;

  const move = (delta: number) => {
    if (!at) return;
    const index = at.index + delta;
    change((d) => docOps.moveTo(d, m.id, at.parentId === null ? { parentId: null, index } : { parentId: at.parentId, column: at.column, index }), { select: m.id });
  };

  // Buttons never take focus, so the text cursor stays in the canvas while formatting.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const btn = (opts: { label: string; icon: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean }) => (
    <button
      key={opts.label}
      type="button"
      aria-label={opts.label}
      title={opts.label}
      aria-pressed={opts.active}
      disabled={opts.disabled}
      onMouseDown={keep}
      onClick={opts.onClick}
      className={`flex size-7 items-center justify-center rounded text-neutral-200 transition hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent [&_svg]:size-4 ${
        opts.active ? "bg-white/25 text-white" : ""
      } ${opts.danger ? "hover:bg-red-500/80" : ""}`}
    >
      {opts.icon}
    </button>
  );
  const sep = <span className="mx-0.5 h-5 w-px bg-white/20" aria-hidden />;
  const swatches = (key: string) => (
    <div className="absolute top-full left-0 z-10 mt-1 flex gap-1 rounded-md bg-neutral-900 p-1.5 shadow-xl" onMouseDown={keep}>
      {brand.palette.map((p) => (
        <button
          key={p.value}
          type="button"
          aria-label={`${p.label} ${p.value}`}
          title={p.label}
          onClick={() => {
            set(key, p.value);
            setPalette(null);
          }}
          className={`size-6 rounded border ${String(settings[key]).toLowerCase() === p.value.toLowerCase() ? "border-blue-400 ring-2 ring-blue-400" : "border-white/30"}`}
          style={{ background: p.value }}
        />
      ))}
    </div>
  );

  if (box) {
    const value = box.value.trim();
    const spec = {
      textlink: { label: "Link address", placeholder: "https://… or mailto:…", valid: isSafeUrl(value), hint: "Enter an absolute https://, http:// or mailto: address", apply: "Apply link" },
      link: { label: links.find((l) => l.id === (box.kind === "link" ? box.target : ""))?.label ?? "Link", placeholder: "https://… or mailto:… (empty removes the link)", valid: value === "" || value === "https://" || isSafeUrl(value), hint: "Enter an absolute https://, http:// or mailto: address", apply: "Apply link" },
      alt: { label: "Alt text", placeholder: "Describe the image for people who cannot see it", valid: true, hint: "", apply: "Save alt text" },
      save: { label: "Name for this saved module", placeholder: "Name it, e.g. Event sign-up row", valid: value !== "", hint: "Give it a name", apply: "Save for reuse" },
    }[box.kind];
    const close = () => {
      setBox(null);
      if (box.kind === "textlink") props.onLinkClose(null);
    };
    const submit = () => {
      setBox(null);
      if (box.kind === "textlink") props.onLinkClose(value);
      else if (box.kind === "link") links.find((l) => l.id === box.target)?.apply(value === "https://" ? "" : value);
      else if (box.kind === "alt" && image) setContent(box.field, { ...image, alt: value });
      else if (box.kind === "save") {
        const error = saved.save(value, m, state.doc.brandId);
        if (error) toast.error(error);
        else toast.success(`Saved “${value}”. Find it under Saved in the Modules tab.`);
      }
    };
    return (
      <form
        className="flex items-center gap-1 rounded-lg bg-neutral-900 p-1 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (spec.valid) submit();
        }}
      >
        <span className="pl-1.5 text-[11px] font-semibold whitespace-nowrap text-neutral-300">{spec.label}</span>
        <input
          autoFocus
          value={box.value}
          maxLength={box.kind === "alt" ? 300 : box.kind === "save" ? 60 : 2048}
          onChange={(e) => setBox({ ...box, value: e.target.value })}
          onFocus={(e) => box.kind !== "textlink" && e.target.select()}
          onKeyDown={(e) => e.key === "Escape" && close()}
          placeholder={spec.placeholder}
          aria-label={spec.label}
          className="h-7 w-64 rounded bg-white/10 px-2 text-xs text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button type="submit" disabled={!spec.valid} aria-label={spec.apply} title={spec.valid ? spec.apply : spec.hint} className="flex size-7 items-center justify-center rounded text-white hover:bg-white/15 disabled:opacity-30 [&_svg]:size-4">
          <Check />
        </button>
        <button type="button" aria-label="Cancel" onClick={close} className="flex size-7 items-center justify-center rounded text-neutral-300 hover:bg-white/15 [&_svg]:size-4">
          <X />
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-neutral-900 p-1 shadow-xl" role="toolbar" aria-label={`${def.name} tools`} onMouseDown={keep}>
      <span className="px-1.5 text-[11px] font-semibold whitespace-nowrap text-neutral-300">{def.name}</span>
      {props.editing?.kind === "richtext" && (
        <>
          {sep}
          {btn({ label: "Bold", icon: <Bold />, active: props.formats.bold, onClick: () => props.onFormat("bold") })}
          {btn({ label: "Italic", icon: <Italic />, active: props.formats.italic, onClick: () => props.onFormat("italic") })}
          {btn({ label: "Bullet list", icon: <List />, active: props.formats.list, onClick: () => props.onFormat("insertUnorderedList") })}
          {btn({
            label: "Link",
            icon: <LinkIcon />,
            active: !!props.formats.link,
            onClick: () => {
              props.onLinkOpen();
              setBox({ kind: "textlink", value: props.formats.link ?? "https://" });
            },
          })}
          {props.formats.link && btn({ label: "Remove link", icon: <Unlink />, onClick: () => props.onFormat("unlink") })}
        </>
      )}
      {(size || colorKey) && sep}
      {size && (
        <>
          {btn({ label: "Smaller text", icon: <Minus />, disabled: size.value <= size.min, onClick: () => set(size.key, Math.max(size.min, size.value - 1)) })}
          <span className="w-9 text-center text-[11px] font-semibold text-white tabular-nums" title="Text size">
            {size.value}px
          </span>
          {btn({ label: "Larger text", icon: <Plus />, disabled: size.value >= size.max, onClick: () => set(size.key, Math.min(size.max, size.value + 1)) })}
        </>
      )}
      {colorKey && (
        <span className="relative">
          <button type="button" aria-label="Text colour" title="Text colour" onMouseDown={keep} onClick={() => setPalette(palette === "text" ? null : "text")} className="flex size-7 items-center justify-center rounded hover:bg-white/15">
            <span className="flex size-5 items-center justify-center rounded border border-white/40 text-[11px] font-bold" style={{ color: String(settings[colorKey]), background: "#fff" }}>
              A
            </span>
          </button>
          {palette === "text" && swatches(colorKey)}
        </span>
      )}
      {imageSpec && image && (
        <>
          {sep}
          <span className="relative">
            {btn({ label: image.src ? "Change image" : "Add image", icon: <ImagePlus />, active: palette === "image", onClick: () => setPalette(palette === "image" ? null : "image") })}
            {palette === "image" && (
              <div className="absolute top-full left-0 z-10 mt-1 w-52 rounded-md bg-neutral-900 p-1 shadow-xl" role="menu" onMouseDown={keep}>
                {(
                  [
                    ["Upload from your computer", <ImagePlus key="i" />, () => props.onImage("upload", imageSpec.key)],
                    ["Choose from your library", <Images key="i" />, () => props.onImage("library", imageSpec.key)],
                    ...(image.src ? [["Remove background", <Eraser key="i" />, () => props.onImage("cutout", imageSpec.key)] as const] : []),
                    ...(image.src ? [["Remove image", <ImageOff key="i" />, () => setContent(imageSpec.key, { ...image, src: null, naturalWidth: null, naturalHeight: null })] as const] : []),
                  ] as const
                ).map(([label, icon, run]) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPalette(null);
                      run();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] font-medium text-neutral-100 hover:bg-white/15 [&_svg]:size-4"
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </span>
          {image.src && (
            <>
              {btn({
                label: image.alt ? `Alt text: ${image.alt}` : "Add alt text (describes the image)",
                icon: <span className={`text-[10px] font-bold tracking-wide ${image.alt ? "" : "text-amber-300"}`}>ALT</span>,
                onClick: () => setBox({ kind: "alt", value: image.alt, field: imageSpec.key }),
              })}
              {btn({ label: "Narrower image", icon: <Minus />, disabled: imageWidth <= 16, onClick: () => setContent(imageSpec.key, { ...image, width: Math.max(16, imageWidth - 10) }) })}
              <span className="w-10 text-center text-[11px] font-semibold text-white tabular-nums" title="Image width">
                {imageWidth}px
              </span>
              {btn({ label: "Wider image", icon: <Plus />, disabled: imageWidth >= imageMax, onClick: () => setContent(imageSpec.key, { ...image, width: Math.min(imageMax, imageWidth + 10) }) })}
            </>
          )}
        </>
      )}
      {links.length > 0 && (
        <span className="relative">
          {btn({
            label: links.length === 1 ? (links[0].value ? `${links[0].label}: ${links[0].value}` : `${links[0].label}: not set`) : "Links",
            icon: (
              <span className="relative">
                <LinkIcon />
                {links.some((l) => !l.value && !l.optional) && <span className="absolute -top-1 -right-1 size-1.5 rounded-full bg-amber-400" aria-hidden />}
              </span>
            ),
            active: links.some((l) => l.value),
            onClick: () => (links.length === 1 ? openLink(links[0].id) : setPalette(palette === "links" ? null : "links")),
          })}
          {palette === "links" && (
            <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-md bg-neutral-900 p-1 shadow-xl" onMouseDown={keep}>
              {links.map((l) => (
                <button key={l.id} type="button" onClick={() => openLink(l.id)} className="block w-full rounded px-2 py-1 text-left hover:bg-white/15">
                  <span className="block text-[11px] font-semibold text-white">{l.label}</span>
                  <span className={`block truncate text-[11px] ${l.value || l.optional ? "text-neutral-400" : "text-amber-300"}`}>{l.value || "Not set"}</span>
                </button>
              ))}
            </div>
          )}
        </span>
      )}
      {has("align") && (
        <>
          {sep}
          {(["left", "center", "right"] as Align[]).map((a) =>
            btn({ label: `Align ${a}`, icon: a === "left" ? <AlignLeft /> : a === "center" ? <AlignCenter /> : <AlignRight />, active: settings.align === a, onClick: () => set("align", a) }),
          )}
        </>
      )}
      {has("backgroundColor") && (
        <span className="relative">
          <button type="button" aria-label="Background colour" title="Background colour" onMouseDown={keep} onClick={() => setPalette(palette === "background" ? null : "background")} className="flex size-7 items-center justify-center rounded hover:bg-white/15">
            <span className="size-5 rounded border border-white/40" style={{ background: String(settings.backgroundColor) }} />
          </button>
          {palette === "background" && swatches("backgroundColor")}
        </span>
      )}
      {padding && (
        <>
          {btn({ label: "Less space above and below", icon: <Minus />, disabled: padding.top === 0 && padding.bottom === 0, onClick: () => set("padding", { ...padding, top: Math.max(0, padding.top - 4), bottom: Math.max(0, padding.bottom - 4) }) })}
          <span className="flex w-4 justify-center text-neutral-400 [&_svg]:size-3.5" title="Space above and below">
            <UnfoldVertical />
          </span>
          {btn({ label: "More space above and below", icon: <Plus />, disabled: padding.top >= 120 && padding.bottom >= 120, onClick: () => set("padding", { ...padding, top: Math.min(120, padding.top + 4), bottom: Math.min(120, padding.bottom + 4) }) })}
        </>
      )}
      {sep}
      {btn({ label: "Move up", icon: <ArrowUp />, disabled: !at || at.index === 0, onClick: () => move(-1) })}
      {btn({ label: "Move down", icon: <ArrowDown />, disabled: !at || at.index >= siblings - 1, onClick: () => move(1) })}
      {btn({
        label: "Duplicate",
        icon: <Copy />,
        onClick: () => {
          const id = newModuleId();
          change((d) => docOps.duplicate(d, m.id, id), { select: id });
        },
      })}
      {btn({
        label: "Save for reuse",
        icon: <Bookmark />,
        onClick: () => setBox({ kind: "save", value: String(content.headline || content.label || def.name).slice(0, 60) }),
      })}
      {btn({ label: "Delete", icon: <Trash2 />, danger: true, onClick: () => change((d) => docOps.remove(d, m.id)) })}
    </div>
  );
}
