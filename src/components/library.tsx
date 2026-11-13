"use client";
/**
 * The Library: everything a person has made or uploaded. Three kinds of thing (emails, saved
 * blocks, images), each shown as a card with a few recent items on the overview page and in
 * full on its own page. Signed in, it is the account's; signed out, it is this browser's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Plus, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Thumbnail } from "@/components/editor/saved-modules";
import { useConfig } from "@/lib/client/config";
import { useSavedModules, type SavedModule } from "@/lib/client/saved-modules";
import { storesFor, type AssetClient, type DraftSummary, type LibraryImage, type TemplateList } from "@/lib/client/stores";
import { getBrand } from "@/lib/email/brands";
import { formatMb, limitsFor } from "@/lib/limits";
import { TeamName } from "@/components/team";
import { COLUMNS_TYPE, type EmailDocument } from "@/lib/email/document";
import { defaultTemplates, emailFromTemplate, type Template } from "@/lib/email/templates";
import { getModule } from "@/lib/email/registry";
import { collectImageSources, renderEmailHtml } from "@/lib/email/render";

export const LIBRARY_SECTIONS = {
  emails: { title: "Emails", blurb: "Every email saves itself as you work." },
  templates: { title: "Templates", blurb: "Start a new email from one of these. Save your own from the editor with \u201cSave as template\u201d." },
  blocks: { title: "Saved blocks", blurb: "Blocks and rows you saved for reuse. Add them to any email from the Saved list in the editor." },
  images: { title: "Images", blurb: "Every picture you have uploaded. Use one in the editor with “Choose from your library”." },
} as const;
export type LibrarySection = keyof typeof LIBRARY_SECTIONS;

/** Which Library is in view, where its things are kept, and how much it can hold. */
function useWhere() {
  const config = useConfig();
  const inAccount = config.mode === "production" && !!config.userId;
  const team = inAccount && !!config.workspaceId;
  return {
    config,
    inAccount,
    team,
    /** The key that keeps one Library's browser-side lists apart from another's. */
    scope: config.workspaceId ?? config.userId ?? "local",
    /** Limits apply to accounts and team spaces; a visitor's browser has no set limit. */
    limits: inAccount ? limitsFor(team) : null,
    where: team ? "Shared with everyone in this team space." : inAccount ? "Saved to your account." : "Saved in this browser only.",
  };
}

/** "12 of 50", turning amber when nearly full and red when full. */
function Usage({ used, limit, format = String, note }: { used: number; limit: number; format?: (n: number) => string; note?: string }) {
  const share = used / limit;
  return (
    <span className={`ml-2 text-sm font-normal ${share >= 1 ? "text-red-600" : share >= 0.8 ? "text-amber-700" : "text-neutral-500"}`}>
      {format(used)} of {format(limit)}
      {note ? ` ${note}` : ""}
      {share >= 1 ? " (full)" : share >= 0.8 ? " (nearly full)" : ""}
    </span>
  );
}

/** One kind of thing: a heading with its count, a line saying where it is kept, and the items. */
function Card(props: { section: LibrarySection; count: number | null; usage?: React.ReactNode; preview: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  const { where } = useWhere();
  const { title, blurb } = LIBRARY_SECTIONS[props.section];
  return (
    <section aria-labelledby={`${props.section}-heading`} className="rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:flex-nowrap">
        <div className="min-w-0">
          <h2 id={`${props.section}-heading`} className="text-lg font-semibold">
            {title}
            {props.usage ?? (props.count ? <span className="ml-1.5 text-sm font-normal text-neutral-500">{props.count}</span> : null)}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {blurb} {where}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {props.action}
          {props.preview && (
            <Link href={`/library/${props.section}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              View all <ArrowRight />
            </Link>
          )}
        </div>
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-neutral-500">{children}</p>;

/* ---------------- Emails ---------------- */

const EMAIL_WIDTH = 680;

/**
 * A small picture of an email: the same HTML the editor shows, scaled to the card and cropped to its top.
 * The email is only loaded and drawn once its card is on screen, so a long library stays quick.
 * `load` must be stable (wrap it in useCallback), since a new function means "load again".
 */
export function EmailThumb({ load }: { load: () => Promise<EmailDocument | null> }) {
  const { config } = useWhere();
  const { assets } = useMemo(() => storesFor(config.mode), [config.mode]);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [html, setHtml] = useState<string | null | "none">(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let stale = false;
    const sized = new ResizeObserver(() => setWidth(el.clientWidth));
    sized.observe(el);
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        load()
          .then(async (doc) => {
            if (!doc) throw new Error("gone");
            await assets.preload(collectImageSources(doc));
            return renderEmailHtml(doc, { resolveImage: (s) => assets.previewUrl(s) });
          })
          .then((h) => !stale && setHtml(h))
          .catch(() => !stale && setHtml("none"));
      },
      { rootMargin: "200px" },
    );
    seen.observe(el);
    return () => {
      stale = true;
      sized.disconnect();
      seen.disconnect();
    };
  }, [load, assets]);

  const scale = width / EMAIL_WIDTH;
  return (
    <div ref={box} className="relative aspect-[4/5] overflow-hidden bg-neutral-100" aria-hidden>
      {html && html !== "none" && width > 0 && (
        // No scripts can run in the frame. "allow-same-origin" only lets the account's own pictures load.
        <iframe
          srcDoc={html}
          title=""
          tabIndex={-1}
          sandbox="allow-same-origin"
          scrolling="no"
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: EMAIL_WIDTH, height: (width * 1.25) / scale, transform: `scale(${scale})` }}
        />
      )}
      {html === "none" && <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">No preview</span>}
    </div>
  );
}

/** The preview for a saved email, fetched by id. */
function SavedEmailThumb({ id }: { id: string }) {
  const { config } = useWhere();
  const { drafts } = useMemo(() => storesFor(config.mode), [config.mode]);
  const load = useCallback(() => drafts.get(id).then((d) => d?.document ?? null), [drafts, id]);
  return <EmailThumb load={load} />;
}

export function EmailsCard({ preview = false }: { preview?: boolean }) {
  const { config, limits } = useWhere();
  const { drafts } = useMemo(() => storesFor(config.mode), [config.mode]);
  const router = useRouter();
  const [list, setList] = useState<DraftSummary[] | null>(null);

  useEffect(() => {
    let stale = false;
    drafts
      .list()
      .then((l) => !stale && setList(l))
      .catch((e: Error) => {
        if (stale) return;
        toast.error(e.message);
        setList([]);
      });
    return () => {
      stale = true;
    };
  }, [drafts]);

  async function remove(d: DraftSummary) {
    if (!confirm(`Delete "${d.title || "Untitled email"}"? This cannot be undone.`)) return;
    try {
      await drafts.remove(d.id);
      setList((l) => l?.filter((x) => x.id !== d.id) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const shown = preview ? list?.slice(0, 4) : list;
  return (
    <Card
      section="emails"
      count={list?.length ?? null}
      usage={limits && list ? <Usage used={list.length} limit={limits.emails} /> : undefined}
      preview={preview}
      action={
        <Link href="/new" className={buttonVariants({ size: "sm" })}>
          <Plus /> New email
        </Link>
      }
    >
      {!shown ? (
        <Empty>Loading…</Empty>
      ) : shown.length === 0 ? (
        <Empty>No emails yet. Start one with &ldquo;New email&rdquo;.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((d) => (
            <li key={d.id} className="group relative">
              <button
                className="block w-full overflow-hidden rounded-md border text-left transition hover:border-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                onClick={() => router.push(`/editor/${d.id}`)}
              >
                <SavedEmailThumb id={d.id} />
                <span className="block border-t p-2.5">
                  <span className="block truncate text-sm font-medium">{d.title || "Untitled email"}</span>
                  <span className="block truncate text-xs text-neutral-500">{d.subject || "No subject"}</span>
                  <span className="block truncate text-[11px] text-neutral-400">
                    {new Date(d.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {getBrand(d.brandId)?.name ?? d.brandId}
                  </span>
                </span>
              </button>
              {!preview && (
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute top-2 right-2 bg-white opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label={`Delete email ${d.title || "Untitled email"}`}
                  onClick={() => remove(d)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- Templates ---------------- */

/** Loads the person's templates. If that fails (offline, or the account store is unreachable), the starter templates still show. */
export function useTemplates() {
  const { config } = useWhere();
  const { templates: store, drafts } = useMemo(() => storesFor(config.mode), [config.mode]);
  const router = useRouter();
  const [list, setList] = useState<TemplateList | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      store
        .list()
        .then(setList)
        .catch(() => setList({ templates: defaultTemplates(), removedStarters: 0 })),
    [store],
  );
  useEffect(() => {
    let stale = false;
    store
      .list()
      .then((l) => !stale && setList(l))
      .catch(() => !stale && setList({ templates: defaultTemplates(), removedStarters: 0 }));
    return () => {
      stale = true;
    };
  }, [store]);

  /** Makes a new email from the template (or a blank one) and opens it. */
  const start = useCallback(
    async (key: string, doc: EmailDocument, query = "") => {
      if (starting) return;
      setStarting(key);
      try {
        const d = await drafts.create(doc);
        router.push(`/editor/${d.id}${query}`);
      } catch (e) {
        toast.error((e as Error).message);
        setStarting(null);
      }
    },
    [drafts, router, starting],
  );

  const remove = useCallback(
    async (t: Template) => {
      const ask = t.isDefault ? `Remove the starter template "${t.name}"? You can bring starter templates back later.` : `Delete the template "${t.name}"? Emails already made from it are not affected.`;
      if (!confirm(ask)) return;
      try {
        await store.remove(t.id);
        await reload();
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [store, reload],
  );

  const restoreStarters = useCallback(async () => {
    try {
      await store.restoreStarters();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [store, reload]);

  return { list, starting, start, remove, restoreStarters };
}

/** One template: its preview and name. Clicking it starts a new email from it. */
export function TemplateTile({ template, busy, onStart, onRemove }: { template: Template; busy: boolean; onStart: () => void; onRemove?: () => void }) {
  const load = useCallback(() => Promise.resolve(template.document), [template.document]);
  return (
    <li className="group relative">
      <button
        disabled={busy}
        onClick={onStart}
        title={`Start a new email from "${template.name}"`}
        className="block w-full overflow-hidden rounded-md border text-left transition hover:border-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60"
      >
        <EmailThumb load={load} />
        <span className="block border-t p-2.5">
          <span className="block truncate text-sm font-medium">{template.name}</span>
          <span className="block truncate text-xs text-neutral-500">{template.isDefault ? "Starter template" : `Saved ${new Date(template.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}</span>
        </span>
      </button>
      {onRemove && (
        <Button
          variant="outline"
          size="icon"
          className="absolute top-2 right-2 bg-white opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={`Remove template ${template.name}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

export function TemplatesCard({ preview = false }: { preview?: boolean }) {
  const { list, starting, start, remove, restoreStarters } = useTemplates();
  const { limits } = useWhere();
  const shown = preview ? list?.templates.slice(0, 4) : list?.templates;
  const own = list?.templates.filter((t) => !t.isDefault).length ?? 0;
  return (
    <Card
      section="templates"
      count={list?.templates.length ?? null}
      // Starter templates are free; only the ones a person saved count towards the limit.
      usage={limits && list && own > 0 ? <Usage used={own} limit={limits.templates} note="saved by you" /> : undefined}
      preview={preview}
    >
      {!shown ? (
        <Empty>Loading…</Empty>
      ) : shown.length === 0 ? (
        <Empty>No templates. Open an email and choose &ldquo;Save as template&rdquo; to make one.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((t) => (
            <TemplateTile key={t.id} template={t} busy={!!starting} onStart={() => start(t.id, emailFromTemplate(t))} onRemove={preview ? undefined : () => remove(t)} />
          ))}
        </ul>
      )}
      {!preview && list && list.removedStarters > 0 && (
        <button type="button" className="mt-3 text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-900" onClick={restoreStarters}>
          Bring back the starter templates ({list.removedStarters} removed)
        </button>
      )}
    </Card>
  );
}

/* ---------------- Saved blocks ---------------- */

function BlockCard({ item, assets, onRemove }: { item: SavedModule; assets: AssetClient; onRemove?: () => void }) {
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
    <li className="flex flex-col rounded-md border p-2">
      <div className="flex min-h-16 items-center justify-center overflow-hidden bg-neutral-50">{html && <Thumbnail html={html} />}</div>
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.name}</div>
          <div className="text-xs text-neutral-500">{kind}</div>
        </div>
        {onRemove && (
          <Button variant="ghost" size="icon" aria-label={`Remove saved block ${item.name}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}

export function BlocksCard({ preview = false }: { preview?: boolean }) {
  const { config, inAccount, scope, limits } = useWhere();
  const { assets } = useMemo(() => storesFor(config.mode), [config.mode]);
  const saved = useSavedModules(scope, inAccount, limits?.savedBlocks);
  // In the browser-only store, pictures inside saved blocks can be drawn only once the image list has been read.
  const [imagesReady, setImagesReady] = useState(false);
  useEffect(() => {
    let stale = false;
    assets
      .list()
      .catch(() => [])
      .then(() => !stale && setImagesReady(true));
    return () => {
      stale = true;
    };
  }, [assets]);

  const shown = preview ? saved.items.slice(0, 3) : saved.items;
  return (
    <Card section="blocks" count={saved.items.length} usage={limits ? <Usage used={saved.items.length} limit={limits.savedBlocks} /> : undefined} preview={preview}>
      {shown.length === 0 ? (
        <Empty>None yet. In the editor, select a block or row and press the bookmark in its toolbar.</Empty>
      ) : (
        <ul key={imagesReady ? "ready" : "loading"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <BlockCard
              key={item.id}
              item={item}
              assets={assets}
              onRemove={
                preview
                  ? undefined
                  : () => {
                      if (confirm(`Remove the saved block "${item.name}"? Emails that already use it are not affected.`)) saved.remove(item.id);
                    }
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- Images ---------------- */

export function ImagesCard({ preview = false }: { preview?: boolean }) {
  const { config, limits } = useWhere();
  const { assets } = useMemo(() => storesFor(config.mode), [config.mode]);
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      assets
        .list()
        .then(setImages)
        .catch(() => setImages([])),
    [assets],
  );
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

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    const wait = toast.loading(files.length === 1 ? "Uploading image…" : `Uploading ${files.length} images…`);
    let added = 0;
    const problems: string[] = [];
    for (const file of files) {
      try {
        await assets.upload(file);
        added++;
      } catch (e) {
        problems.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    await load();
    toast.dismiss(wait);
    setBusy(false);
    if (added) toast.success(added === 1 ? "Image added to your library." : `${added} images added to your library.`);
    for (const p of problems) toast.error(p);
  }

  const shown = preview ? images?.slice(0, 4) : images;
  return (
    <Card
      section="images"
      count={images?.length ?? null}
      usage={limits && images ? <Usage used={images.reduce((sum, img) => sum + img.bytes, 0)} limit={limits.imageBytes} format={formatMb} /> : undefined}
      preview={preview}
      action={
        <>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void upload(files);
            }}
          />
          <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <Upload /> Upload images
          </Button>
        </>
      }
    >
      {!shown ? (
        <Empty>Loading…</Empty>
      ) : shown.length === 0 ? (
        <Empty>None yet. Upload PNG, JPEG or GIF pictures (up to 5 MB each) to have them ready for any email.</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shown.map((img) => (
            <li key={img.src.kind === "asset" ? img.src.assetId : img.thumbUrl} className="rounded-md border p-2">
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
    </Card>
  );
}

/* ---------------- Pages ---------------- */

export function LibraryOverview() {
  const { team } = useWhere();
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{team ? <TeamName fallback="Team space" /> : "Library"}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {team
            ? "Your team\u2019s shared Library. Everyone in the team can open, change and reuse what is here. Switch back to your own Library from the menu at the top."
            : "Your emails, templates, saved blocks and images in one place."}
        </p>
      </header>
      <EmailsCard preview />
      <TemplatesCard preview />
      <BlocksCard preview />
      <ImagesCard preview />
    </>
  );
}

export function LibrarySectionView({ section }: { section: LibrarySection }) {
  return (
    <>
      <Link href="/library" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 hover:text-neutral-900">
        <ArrowLeft className="size-4" /> Library
      </Link>
      {section === "emails" ? <EmailsCard /> : section === "templates" ? <TemplatesCard /> : section === "blocks" ? <BlocksCard /> : <ImagesCard />}
    </>
  );
}
