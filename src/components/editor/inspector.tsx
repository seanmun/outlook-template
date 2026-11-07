"use client";
import { useMemo } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { docOps } from "@/lib/editor/state";
import type { Align, ImageValue, Padding } from "@/lib/email/fields";
import { findContentIssues } from "@/lib/email/issues";
import { getModule } from "@/lib/email/registry";
import type { RichText } from "@/lib/email/richtext";
import { CONTENT_WIDTH } from "@/lib/email/render";
import { useEditor } from "./context";
import { AlignField, ColorField, ImageField, NumberField, PaddingField, TextField, UrlField } from "./fields";
import { RichTextField } from "./rich-text-field";

function EmailOverview() {
  const { state, dispatch, brand } = useEditor();
  const issues = useMemo(() => findContentIssues(state.doc), [state.doc]);
  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <h2 className="font-semibold">Email</h2>
        <p className="text-xs text-neutral-500">Select a module in the preview or the Modules tab to edit it.</p>
      </div>
      <div className="rounded-md border p-3 text-xs text-neutral-600">
        <div className="font-medium text-neutral-800">{brand.name}</div>
        <div>{brand.description}</div>
        <div className="mt-1">Fonts: {brand.fontFamily} (web-safe; no web fonts in email)</div>
      </div>
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          <AlertTriangle className="size-3.5" /> Unresolved ({issues.length})
        </h3>
        {issues.length === 0 ? (
          <p className="text-xs text-neutral-500">Nothing flagged.</p>
        ) : (
          <ul className="space-y-1">
            {issues.map((i, n) => (
              <li key={n}>
                <button className="w-full rounded px-2 py-1 text-left text-xs hover:bg-amber-50" onClick={() => i.moduleId && dispatch({ type: "select", id: i.moduleId })}>
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Inspector() {
  const { state, change, dispatch, brand, assets, refreshAssets } = useEditor();
  const m = state.doc.modules.find((x) => x.id === state.selectedId);
  if (!m) return <EmailOverview />;
  const def = getModule(m.type);
  if (!def) return <div className="p-4 text-sm">Unknown module type “{m.type}”.</div>;

  const content = m.content as Record<string, unknown>;
  const settings = m.settings as Record<string, unknown>;
  const setC = (key: string, value: unknown, coalesce = false) => change((d) => docOps.setContent(d, m.id, key, value), coalesce ? { coalesceKey: `${m.id}:c:${key}` } : undefined);
  const setS = (key: string, value: unknown, coalesce = false) => change((d) => docOps.setSetting(d, m.id, key, value), coalesce ? { coalesceKey: `${m.id}:s:${key}` } : undefined);
  const padding = settings.padding as Padding | undefined;
  const innerWidth = CONTENT_WIDTH - (padding ? padding.left + padding.right : 0);

  return (
    <div className="space-y-4 p-4" key={m.id}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{def.name}</h2>
          <p className="text-xs text-neutral-500">{def.description}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "select", id: null })}>
          Done
        </Button>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Content</h3>
        {def.contentFields.map((f) => {
          const id = `${m.id}-${f.key}`;
          switch (f.kind) {
            case "text":
              return <TextField key={f.key} id={id} label={f.label} help={f.help} maxLength={f.maxLength} multiline={f.multiline} value={String(content[f.key] ?? "")} onChange={(v) => setC(f.key, v, true)} />;
            case "url":
              return <UrlField key={f.key} id={id} label={f.label} help={f.help} value={String(content[f.key] ?? "")} onChange={(v) => setC(f.key, v, true)} />;
            case "richtext":
              return <RichTextField key={f.key} id={id} label={f.label} help={f.help} value={content[f.key] as RichText} onChange={(v) => setC(f.key, v, true)} />;
            case "image": {
              const img = content[f.key] as ImageValue;
              return (
                <ImageField
                  key={f.key}
                  id={id}
                  label={f.label}
                  help={f.help}
                  value={img}
                  maxWidth={Math.min(f.maxWidth, innerWidth)}
                  allowLink={f.allowLink}
                  assets={assets}
                  previewUrl={img.src ? assets.previewUrl(img.src) : null}
                  onUploaded={refreshAssets}
                  onChange={(v) => setC(f.key, v, true)}
                />
              );
            }
          }
        })}
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Settings</h3>
          <Button variant="ghost" size="sm" onClick={() => change((d) => docOps.resetSettings(d, m.id))} title="Restore this brand's default settings for the module (content is kept)">
            <RotateCcw /> Reset to defaults
          </Button>
        </div>
        {def.settingFields.map((f) => {
          const id = `${m.id}-s-${f.key}`;
          switch (f.kind) {
            case "color":
              return <ColorField key={f.key} id={id} label={f.label} brand={brand} value={String(settings[f.key])} onChange={(v) => setS(f.key, v)} />;
            case "align":
              return <AlignField key={f.key} label={f.label} value={settings[f.key] as Align} onChange={(v) => setS(f.key, v)} />;
            case "padding":
              return <PaddingField key={f.key} id={id} label={f.label} value={settings[f.key] as Padding} onChange={(v) => setS(f.key, v, true)} />;
            case "number":
              return <NumberField key={f.key} id={id} label={f.label} min={f.min} max={f.max} step={f.step} unit={f.unit} help={f.help} value={Number(settings[f.key])} onChange={(v) => setS(f.key, v, true)} />;
            case "select":
              return null;
          }
        })}
      </section>
    </div>
  );
}
