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
import { storesFor, type AssetClient, type DraftSummary, type LibraryImage } from "@/lib/client/stores";
import { getBrand } from "@/lib/email/brands";
import { COLUMNS_TYPE } from "@/lib/email/document";
import { getModule } from "@/lib/email/registry";
import { renderEmailHtml } from "@/lib/email/render";

export const LIBRARY_SECTIONS = {
  emails: { title: "Emails", blurb: "Every email saves itself as you work." },
  blocks: { title: "Saved blocks", blurb: "Blocks and rows you saved for reuse. Add them to any email from the Saved list in the editor." },
  images: { title: "Images", blurb: "Every picture you have uploaded. Use one in the editor with “Choose from your library”." },
} as const;
export type LibrarySection = keyof typeof LIBRARY_SECTIONS;

function useWhere() {
  const config = useConfig();
  const inAccount = config.mode === "production" && !!config.userId;
  return { config, inAccount, where: inAccount ? "Saved to your account." : "Saved in this browser only." };
}

/** One kind of thing: a heading with its count, a line saying where it is kept, and the items. */
function Card(props: { section: LibrarySection; count: number | null; preview: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  const { where } = useWhere();
  const { title, blurb } = LIBRARY_SECTIONS[props.section];
  return (
    <section aria-labelledby={`${props.section}-heading`} className="rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:flex-nowrap">
        <div className="min-w-0">
          <h2 id={`${props.section}-heading`} className="text-lg font-semibold">
            {title}
            {props.count ? <span className="ml-1.5 text-sm font-normal text-neutral-500">{props.count}</span> : null}
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

export function EmailsCard({ preview = false }: { preview?: boolean }) {
  const { config } = useWhere();
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
        <ul className="divide-y rounded-md border">
          {shown.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => router.push(`/editor/${d.id}`)}>
                <div className="truncate text-sm font-medium">{d.title || "Untitled email"}</div>
                <div className="truncate text-xs text-neutral-500">
                  {getBrand(d.brandId)?.name ?? d.brandId} · {d.subject || "No subject"} · {new Date(d.updatedAt).toLocaleString()}
                </div>
              </button>
              {!preview && (
                <Button variant="ghost" size="icon" aria-label={`Delete email ${d.title || "Untitled email"}`} onClick={() => remove(d)}>
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
  const { config, inAccount } = useWhere();
  const { assets } = useMemo(() => storesFor(config.mode), [config.mode]);
  const saved = useSavedModules(config.userId ?? "local", inAccount);
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
    <Card section="blocks" count={saved.items.length} preview={preview}>
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
  const { config } = useWhere();
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
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Library</h1>
        <p className="mt-1 text-sm text-neutral-500">Your emails, saved blocks and images in one place.</p>
      </header>
      <EmailsCard preview />
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
      {section === "emails" ? <EmailsCard /> : section === "blocks" ? <BlocksCard /> : <ImagesCard />}
    </>
  );
}
