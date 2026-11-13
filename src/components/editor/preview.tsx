"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Moon, Smartphone, Sun, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { UploadedImage } from "@/lib/client/stores";
import { isLowRes, moduleInnerWidth, placeImage } from "@/lib/editor/image-field";
import { playSfx, primeSfx, setSfxEnabled, useSfxEnabled } from "@/lib/client/sfx";
import { domToPlainText, domToRichText } from "@/lib/editor/dom-richtext";
import { resolveDrop, type Box, type RowGeometry } from "@/lib/editor/drop-target";
import { docOps, instantiateSaved, payloadType } from "@/lib/editor/state";
import { isSafeUrl } from "@/lib/email/html";
import { COLUMNS_TYPE, allModules, findModule, locateModule, newModuleId, type EmailDocument } from "@/lib/email/document";
import type { ImageValue } from "@/lib/email/fields";
import { getModule, moduleSupportsBrand } from "@/lib/email/registry";
import { renderEmailHtml } from "@/lib/email/render";
import { darkModePreview } from "@/lib/email/dark-preview";
import { cutOutBackground } from "@/lib/client/remove-background";
import { CanvasToolbar, type EditingField, type TextFormats } from "./canvas-toolbar";
import { useEditor } from "./context";
import { useDrag, type DropResolver } from "./drag";
import { LOW_RES_TIP } from "./fields";
import { ImageLibraryDialog } from "./image-library";

/** One image field of one module. */
type ImageTarget = { moduleId: string; field: string };
const IMAGE_TYPES = /^image\/(png|jpeg|gif)$/;

/**
 * The canvas. Renders the exact HTML the exporters use (plus preview-only
 * annotations) in an iframe so the app's CSS cannot leak in. `sandbox` without
 * allow-scripts: nothing in the email can execute. allow-same-origin lets this
 * component attach its own handlers (select, drag, edit text in place) and lets
 * /api/assets images load with the session.
 *
 * Images are placed on the canvas too: click an empty image, double-click a
 * filled one, or drop a picture from the desktop onto the email.
 *
 * Text is edited directly in the frame. While that happens the frame is not
 * re-rendered (the browser already shows what was typed); the stored text is
 * read back from the frame on every input and never taken from its markup as-is.
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
  const { state, dispatch, change, assets, assetsVersion, refreshAssets, brand } = useEditor();
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);
  const [width, setWidth] = useState<"desktop" | "narrow">("desktop");
  /** Preview only: shows the email recoloured the way dark-themed mail apps do. The email itself is unchanged. */
  const [dark, setDark] = useState(false);
  const [html, setHtml] = useState("");
  const sound = useSfxEnabled();

  // Newly added modules drop into place on the render that first shows them.
  const [seen, setSeen] = useState({ doc: state.doc, dropped: [] as string[] });
  if (seen.doc !== state.doc) setSeen({ doc: state.doc, dropped: diffModules(seen.doc, state.doc).added });

  /* ---- editing text in place ---- */
  const [editing, setEditing] = useState<EditingField | null>(null);
  const editingEl = useRef<HTMLElement | null>(null);
  /** Documents produced by typing on the canvas: the frame already shows them, so they need no re-render. */
  const typed = useRef(new WeakSet<EmailDocument>());
  /** Keeps the text selection alive while the link box has focus. */
  const linkHold = useRef<Range | null>(null);
  /** Counts focus entering a text field, so a late "focus left" check can tell that focus has since come back. */
  const focusCount = useRef(0);
  /** The field to put the cursor back into after the next re-render. */
  const refocus = useRef<{ moduleId: string; field: string } | null>(null);
  const [formats, setFormats] = useState<TextFormats>({ bold: false, italic: false, list: false, link: null });
  /** Where the selected module sits in the frame, for placing the toolbar. */
  const [selBox, setSelBox] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null);
  /** True while the "show padding" key is held. */
  const [showPadding, setShowPadding] = useState(false);
  const selectedRef = useRef(state.selectedId);

  const measure = useCallback(() => {
    const d = frame.current?.contentDocument;
    const id = selectedRef.current;
    d?.querySelectorAll("[data-selected]").forEach((el) => el.removeAttribute("data-selected"));
    const el = id ? d?.querySelector(`[data-module-id="${CSS.escape(id)}"]`) : null;
    if (!el) return setSelBox(null);
    el.setAttribute("data-selected", "");
    const r = el.getBoundingClientRect();
    setSelBox({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }, []);

  useEffect(() => {
    selectedRef.current = state.selectedId;
    measure();
  }, [state.selectedId, measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Hold Option/Alt (or Shift, when not typing in a text field) to see the selected module's padding.
  const paddingKey = useCallback((e: KeyboardEvent) => {
    const held = e.type === "keydown";
    if (e.key === "Alt" || (e.key === "Shift" && !editingEl.current)) setShowPadding(held);
    else if (!held && e.key === "Shift") setShowPadding(false);
  }, []);
  useEffect(() => {
    const off = () => setShowPadding(false);
    window.addEventListener("keydown", paddingKey);
    window.addEventListener("keyup", paddingKey);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", paddingKey);
      window.removeEventListener("keyup", paddingKey);
      window.removeEventListener("blur", off);
    };
  }, [paddingKey]);

  const readFormats = useCallback(() => {
    const d = frame.current?.contentDocument;
    const node = d?.getSelection()?.anchorNode;
    const el = node instanceof d!.defaultView!.Element ? node : node?.parentElement;
    const link = el?.closest("a")?.getAttribute("href") ?? null;
    if (!d || !editingEl.current?.contains(node ?? null)) return;
    setFormats({ bold: d.queryCommandState("bold"), italic: d.queryCommandState("italic"), list: d.queryCommandState("insertUnorderedList"), link });
  }, []);

  /* ---- drag and drop onto the email ---- */
  const drag = useDrag();
  const docRef = useRef(state.doc);
  useEffect(() => {
    docRef.current = state.doc;
  }, [state.doc]);

  /* ---- images placed on the canvas ---- */
  const fileInput = useRef<HTMLInputElement>(null);
  /** The image field the file picker was opened for. */
  const pickFor = useRef<ImageTarget | null>(null);
  const [library, setLibrary] = useState<ImageTarget | null>(null);
  /** A module link clicked on the canvas; the toolbar opens its box. */
  const [linkAsk, setLinkAsk] = useState<{ moduleId: string; key: string; n: number } | null>(null);

  const imageFieldOf = (doc: EmailDocument, moduleId: string) => {
    const m = findModule(doc, moduleId);
    const spec = m && getModule(m.type)?.contentFields.find((f) => f.kind === "image");
    return m && spec?.kind === "image" ? { m, spec } : null;
  };
  /** Puts a picture into an image field and selects that module. */
  const putImage = useCallback(
    (target: ImageTarget, picture: UploadedImage, addAfter?: { afterId: string | null }) => {
      const build = (d: EmailDocument) => {
        if (addAfter) {
          // A new image block for the picture: below the module it was dropped on, or at the end.
          const at = addAfter.afterId ? locateModule(d, addAfter.afterId) : null;
          d = docOps.add(d, "hero", !at ? { parentId: null, index: null } : { ...at, index: at.index + 1 }, target.moduleId);
        }
        const m = findModule(d, target.moduleId);
        const spec = m && getModule(m.type)?.contentFields.find((f) => f.key === target.field);
        if (!m || spec?.kind !== "image") return null;
        const placed = placeImage(m.content[target.field] as ImageValue, picture, Math.min(spec.maxWidth, moduleInnerWidth(d, m.id)));
        return { doc: docOps.setContent(d, m.id, target.field, placed), placed };
      };
      change((d) => build(d)?.doc ?? d, { select: target.moduleId });
      refreshAssets();
      const now = build(docRef.current);
      if (now && isLowRes(now.placed)) toast.message(LOW_RES_TIP);
    },
    [change, refreshAssets],
  );
  /** Uploads a file, then places it: into `target`, or as a new image block after `afterId` (or at the end). */
  const uploadImage = useCallback(
    async (file: File, where: { target: ImageTarget } | { afterId: string | null }) => {
      const wait = toast.loading("Uploading image…");
      try {
        const picture = await assets.upload(file);
        if ("target" in where) putImage(where.target, picture);
        else putImage({ moduleId: newModuleId(), field: "image" }, picture, where);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        toast.dismiss(wait);
      }
    },
    [assets, putImage],
  );
  /** Swaps the picture in an image field for a copy with its plain background removed. Undo brings the original back. */
  const cutOutImage = useCallback(
    async (target: ImageTarget) => {
      const m = findModule(docRef.current, target.moduleId);
      const src = (m?.content[target.field] as ImageValue | undefined)?.src;
      const url = src ? assets.previewUrl(src) : null;
      if (!src || !url) return void toast.error("There is no picture here yet.");
      const wait = toast.loading("Removing the background…");
      try {
        const picture = await assets.upload(await cutOutBackground(url));
        putImage(target, picture);
        toast.success("Background removed. Undo brings the original back.");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        toast.dismiss(wait);
      }
    },
    [assets, putImage],
  );
  const canAddImageBlock = (() => {
    const hero = getModule("hero");
    return !!hero && moduleSupportsBrand(hero, brand);
  })();
  const openPicker = useCallback((target: ImageTarget) => {
    pickFor.current = target;
    fileInput.current?.click();
  }, []);

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
      if (payload.kind === "saved" && !instantiateSaved(docRef.current, payload.module)) return null;
      const table = d.querySelector("table table");
      const hit = resolveDrop(rows, x, y, {
        draggingRow: payloadType(docRef.current, payload) === COLUMNS_TYPE,
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
      const light = renderEmailHtml(state.doc, { resolveImage: (s) => assets.previewUrl(s), annotate: true, animateModuleIds: seen.dropped });
      return dark ? darkModePreview(light) : light;
    } catch (e) {
      return `<p style="font-family:sans-serif;padding:20px;color:#b91c1c">Preview error: ${String((e as Error).message).replace(/</g, "&lt;")}</p>`;
    }
  }, [state.doc, assets, assetsVersion, seen.dropped, dark]);
  const renderedRef = useRef(rendered);
  useEffect(() => {
    renderedRef.current = rendered;
  }, [rendered]);

  // Light debounce so a burst of changes reloads the frame once. Text typed on the canvas is already on screen.
  useEffect(() => {
    if (editingEl.current && typed.current.has(state.doc)) return;
    const t = setTimeout(() => setHtml(rendered), 120);
    return () => clearTimeout(t);
  }, [rendered, state.doc]);

  function onLoad() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const win = doc.defaultView!;
    win.scrollTo(0, scroll.current);
    doc.addEventListener(
      "scroll",
      () => {
        scroll.current = win.scrollY;
        measure();
      },
      { passive: true },
    );

    /* ---- text fields become editable in place ---- */
    const fieldOf = (target: EventTarget | null) => {
      const el = target instanceof win.Element ? target.closest<HTMLElement>("[data-field]") : null;
      const moduleId = el?.closest("[data-module-id]")?.getAttribute("data-module-id");
      const field = el?.getAttribute("data-field");
      const kind = el?.getAttribute("data-field-kind") === "richtext" ? ("richtext" as const) : ("text" as const);
      return el && moduleId && field ? { el, moduleId, field, kind } : null;
    };
    doc.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
      el.setAttribute("contenteditable", el.getAttribute("data-field-kind") === "richtext" ? "true" : "plaintext-only");
      el.setAttribute("spellcheck", "true");
    });
    try {
      doc.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      // Older engines: paragraphs fall back to <div>, which is read the same way.
    }
    editingEl.current = null;
    setEditing(null);
    measure();

    doc.addEventListener("focusin", (e) => {
      const f = fieldOf(e.target);
      if (!f) return;
      focusCount.current++;
      editingEl.current = f.el;
      setEditing({ moduleId: f.moduleId, field: f.field, kind: f.kind });
      dispatch({ type: "select", id: f.moduleId });
      readFormats();
    });
    doc.addEventListener("focusout", (e) => {
      if (!fieldOf(e.target)) return;
      // Wait a tick: focus may be moving to another field, or to the link box and back.
      const at = focusCount.current;
      setTimeout(() => {
        if (linkHold.current || focusCount.current !== at) return;
        editingEl.current = null;
        setEditing(null);
        setHtml(renderedRef.current); // Replace the browser's editing markup with the real render.
      }, 0);
    });
    doc.addEventListener("input", (e) => {
      const f = fieldOf(e.target);
      const m = f && findModule(docRef.current, f.moduleId);
      const spec = m && getModule(m.type)?.contentFields.find((c) => c.key === f.field);
      if (!f || !spec) return;
      const value = spec.kind === "richtext" ? domToRichText(f.el) : domToPlainText(f.el, spec.kind === "text" ? spec.maxLength : 200);
      change(
        (d) => {
          const next = docOps.setContent(d, f.moduleId, f.field, value);
          typed.current.add(next);
          return next;
        },
        { coalesceKey: `${f.moduleId}:c:${f.field}` },
      );
      readFormats();
      measure();
    });
    doc.addEventListener("selectionchange", readFormats);
    doc.addEventListener("paste", (e) => {
      // Paste as plain text; formatting is added with the toolbar.
      if (!fieldOf(e.target)) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      doc.execCommand("insertText", false, fieldOf(e.target)!.kind === "text" ? text.replace(/\s*[\n\r]+\s*/g, " ") : text);
    });
    doc.addEventListener("keydown", paddingKey);
    doc.addEventListener("keyup", paddingKey);
    win.addEventListener("blur", () => setShowPadding(false));
    doc.addEventListener("keydown", (e) => {
      const f = fieldOf(e.target);
      const mod = e.metaKey || e.ctrlKey;
      if (f) {
        if (e.key === "Escape" || (e.key === "Enter" && f.kind === "text")) {
          e.preventDefault();
          f.el.blur();
        }
        return;
      }
      // Not typing: the keyboard acts on the selected module and on history.
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedRef.current) {
        e.preventDefault();
        const id = selectedRef.current;
        change((d) => docOps.remove(d, id));
      } else if (e.key === "Escape") dispatch({ type: "select", id: null });
    });
    const back = refocus.current;
    refocus.current = null;
    if (back) {
      const el = doc.querySelector<HTMLElement>(`[data-module-id="${CSS.escape(back.moduleId)}"] [data-field="${CSS.escape(back.field)}"], [data-module-id="${CSS.escape(back.moduleId)}"][data-field="${CSS.escape(back.field)}"]`);
      if (el) {
        el.focus();
        const range = doc.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        doc.getSelection()?.removeAllRanges();
        doc.getSelection()?.addRange(range);
      }
    }

    /** The module under an event, with the image field or link the event landed on, if any. */
    const hitOf = (e: Event) => {
      const t = e.target as HTMLElement;
      const moduleId = t.closest?.("[data-module-id]")?.getAttribute("data-module-id") ?? null;
      const imageEl = t.closest?.("[data-image-field]");
      return { moduleId, imageEl, imageField: imageEl?.getAttribute("data-image-field") ?? null, link: t.closest?.("[data-link]")?.getAttribute("data-link") ?? null };
    };
    doc.addEventListener("click", (e) => {
      const hit = hitOf(e);
      if ((e.target as HTMLElement).closest?.("a")) e.preventDefault();
      if (drag.consumeClick()) return;
      dispatch({ type: "select", id: hit.moduleId });
      // A clicked link (e.g. one social icon) opens its address box; an empty image opens the file picker.
      setLinkAsk((prev) => (hit.moduleId && hit.link ? { moduleId: hit.moduleId, key: hit.link, n: (prev?.n ?? 0) + 1 } : null));
      if (hit.moduleId && hit.imageField && hit.imageEl?.tagName !== "IMG") openPicker({ moduleId: hit.moduleId, field: hit.imageField });
    });
    doc.addEventListener("dblclick", (e) => {
      const hit = hitOf(e);
      if (hit.moduleId && hit.imageField) openPicker({ moduleId: hit.moduleId, field: hit.imageField });
    });

    // Pictures dropped from the desktop: onto a module with an image, they replace it; anywhere else they become a new image block.
    const carriesFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    doc.addEventListener("dragover", (e) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });
    doc.addEventListener("drop", (e) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      const file = [...e.dataTransfer!.files].find((f) => IMAGE_TYPES.test(f.type));
      if (!file) return void toast.error("Drop a PNG, JPEG or GIF image.");
      const { moduleId } = hitOf(e);
      const field = moduleId ? imageFieldOf(docRef.current, moduleId)?.spec.key : undefined;
      if (moduleId && field) void uploadImage(file, { target: { moduleId, field } });
      else if (canAddImageBlock) void uploadImage(file, { afterId: moduleId });
      else toast.error("Drop the image onto a block that has an image.");
    });

    // Press on a module and move to drag it. While the button is held the browser may keep
    // sending pointer events to this frame, so they are forwarded in screen coordinates.
    let pressed: { id: string; x: number; y: number } | null = null;
    const toScreen = (e: PointerEvent) => {
      const fr = frame.current!.getBoundingClientRect();
      return [e.clientX + fr.left, e.clientY + fr.top] as const;
    };
    doc.addEventListener("pointerdown", (e) => {
      // Inside the field being edited, pressing and moving selects text instead of dragging the block.
      const typing = editingEl.current?.contains(e.target as Node);
      const id = e.button === 0 && !typing ? (e.target as HTMLElement).closest?.("[data-module-id]")?.getAttribute("data-module-id") : null;
      pressed = id ? { id, x: e.clientX, y: e.clientY } : null;
    });
    doc.addEventListener("pointermove", (e) => {
      const [sx, sy] = toScreen(e);
      if (drag.isActive()) return drag.move(sx, sy);
      if (!pressed || Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 6) return;
      const m = findModule(docRef.current, pressed.id);
      if (m) {
        (doc.activeElement as HTMLElement | null)?.blur();
        doc.getSelection()?.removeAllRanges();
        drag.begin({ kind: "move", id: m.id }, getModule(m.type)?.name ?? m.type, sx, sy);
      }
      pressed = null;
    });
    doc.addEventListener("pointerup", () => {
      pressed = null;
      if (drag.isActive()) drag.end();
    });
    doc.addEventListener("dragstart", (e) => e.preventDefault());
  }

  /* ---- toolbar actions that reach into the frame ---- */
  const format = (command: "bold" | "italic" | "insertUnorderedList" | "unlink") => {
    frame.current?.contentDocument?.execCommand(command);
    readFormats();
  };
  const openLink = () => {
    const sel = frame.current?.contentDocument?.getSelection();
    linkHold.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  };
  const closeLink = (url: string | null) => {
    const d = frame.current?.contentDocument;
    const range = linkHold.current;
    linkHold.current = null;
    const el = editingEl.current;
    if (!d || !el) return;
    el.focus();
    const sel = d.getSelection();
    if (range && sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (!url || !isSafeUrl(url)) return;
    const inLink = (sel?.anchorNode instanceof d.defaultView!.Element ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest("a");
    if (sel?.isCollapsed && inLink) {
      // Cursor inside an existing link: change where it goes.
      const whole = d.createRange();
      whole.selectNodeContents(inLink);
      sel.removeAllRanges();
      sel.addRange(whole);
    }
    if (sel?.isCollapsed) d.execCommand("insertText", false, url);
    else d.execCommand("createLink", false, url);
    if (sel?.isCollapsed && !inLink) {
      // Nothing was selected, so the address itself was typed in; select it and link it.
      const node = sel.anchorNode;
      if (node && node.nodeType === 3) {
        const r2 = d.createRange();
        r2.setStart(node, Math.max(0, sel.anchorOffset - url.length));
        r2.setEnd(node, sel.anchorOffset);
        sel.removeAllRanges();
        sel.addRange(r2);
        d.execCommand("createLink", false, url);
        sel.collapseToEnd();
      }
    }
    readFormats();
  };
  const selected = state.selectedId ? findModule(state.doc, state.selectedId) : undefined;
  const pad = selected?.settings.padding as { top: number; right: number; bottom: number; left: number } | undefined;
  const frameWidth = width === "desktop" ? 680 : 375;

  return (
    <div className="flex h-full flex-col" onPointerDownCapture={primeSfx}>
      <div className="flex items-center justify-between border-b bg-white px-3 py-1.5 text-xs text-neutral-500">
        <span>Click text to edit it. Drop pictures onto the email. Drag blocks to move them. Hold Option (Alt) to see padding.</span>
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
          <Button
            variant={dark ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={dark}
            aria-label={dark ? "Turn dark mode preview off" : "Preview in dark mode"}
            title="Dark mode preview: roughly how Outlook and other mail apps recolour your email for people using a dark theme. Pictures are not changed, and neither is your email."
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun /> : <Moon />}
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
        <div className="relative h-full shrink-0" style={{ width: frameWidth }}>
          <iframe ref={frame} title="Email canvas" sandbox="allow-same-origin" srcDoc={html} onLoad={onLoad} className={`h-full w-full rounded border shadow-sm ${dark ? "border-neutral-700 bg-neutral-900" : "bg-white"}`} />
          {selected && selBox && pad && showPadding && (
            // Padding shown the way browser inspectors do: a tinted band per side with its size in pixels.
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded" data-padding-overlay>
              {(
                [
                  ["top", pad.top, { left: selBox.left, top: selBox.top, width: selBox.right - selBox.left, height: pad.top }],
                  ["bottom", pad.bottom, { left: selBox.left, top: selBox.bottom - pad.bottom, width: selBox.right - selBox.left, height: pad.bottom }],
                  ["left", pad.left, { left: selBox.left, top: selBox.top + pad.top, width: pad.left, height: Math.max(0, selBox.bottom - selBox.top - pad.top - pad.bottom) }],
                  ["right", pad.right, { left: selBox.right - pad.right, top: selBox.top + pad.top, width: pad.right, height: Math.max(0, selBox.bottom - selBox.top - pad.top - pad.bottom) }],
                ] as const
              ).map(([side, value, box]) => (
                <div key={side} className="absolute flex items-center justify-center bg-emerald-400/35 outline outline-1 outline-emerald-500/60" style={box} data-padding-side={side}>
                  <span className="rounded bg-emerald-700 px-1 py-px text-[10px] leading-tight font-bold text-white tabular-nums shadow">{value}</span>
                </div>
              ))}
            </div>
          )}
          {selected && selBox && !drag.isActive() && (
            <div
              className="pointer-events-none absolute right-1 left-1 z-20 flex"
              // Above the module when there is room (growing upward if the tools wrap), otherwise just under its top edge.
              style={selBox.top >= 46 ? { bottom: `calc(100% - ${selBox.top - 6}px)` } : { top: Math.max(4, Math.min(selBox.top + 6, selBox.bottom - 40)) }}
              data-canvas-toolbar
            >
              {/* Lines the bar up with the module's left edge, giving way when the bar needs the room. */}
              <div className="min-w-0 shrink" style={{ flexBasis: Math.max(0, selBox.left - 4) }} />
              <div className="pointer-events-auto max-w-full shrink-0">
              <CanvasToolbar
                key={selected.id}
                module={selected}
                editing={editing?.moduleId === selected.id ? editing : null}
                formats={formats}
                onFormat={format}
                onLinkOpen={openLink}
                onLinkClose={closeLink}
                onBeforeRestyle={() => {
                  refocus.current = editing ? { moduleId: editing.moduleId, field: editing.field } : null;
                }}
                onImage={(action, field) => {
                  const target = { moduleId: selected.id, field };
                  if (action === "upload") openPicker(target);
                  else if (action === "library") setLibrary(target);
                  else void cutOutImage(target);
                }}
                linkAsk={linkAsk?.moduleId === selected.id ? linkAsk : null}
              />
              </div>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            aria-label="Upload an image"
            onChange={(e) => {
              const file = e.target.files?.[0];
              const target = pickFor.current;
              e.target.value = "";
              if (file && target) void uploadImage(file, { target });
            }}
          />
          <ImageLibraryDialog open={!!library} onOpenChange={(open) => !open && setLibrary(null)} assets={assets} onPick={(picture) => library && putImage(library, picture)} />
        </div>
      </div>
    </div>
  );
}
