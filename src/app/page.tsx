"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { AppHeader, DemoBanner } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/lib/client/config";
import { storesFor, type DraftSummary } from "@/lib/client/stores";
import { BRANDS, getBrand } from "@/lib/email/brands";
import { newEmailDocument, sampleEmailDocument } from "@/lib/email/starter";

export default function Dashboard() {
  const config = useConfig();
  const { drafts } = useMemo(() => storesFor(config.mode), [config.mode]);
  const router = useRouter();
  const [brandId, setBrandId] = useState(BRANDS[0].id);
  const [list, setList] = useState<DraftSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    drafts.list().then(setList).catch((e: Error) => {
      toast.error(e.message);
      setList([]);
    });
  }, [drafts]);

  async function create(kind: "blank" | "sample" | "ai") {
    setBusy(true);
    try {
      const doc =
        kind === "sample" ? sampleEmailDocument(brandId) : kind === "ai" ? { ...newEmailDocument(brandId), modules: [] } : newEmailDocument(brandId);
      const d = await drafts.create(doc);
      router.push(`/editor/${d.id}${kind === "ai" ? "?panel=ai" : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    try {
      await drafts.remove(id);
      setList((l) => l?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-6">
        <section className="rounded-lg border bg-white p-5">
          <h1 className="text-lg font-semibold">New email</h1>
          <p className="mt-1 text-sm text-neutral-500">Pick a brand. Each brand has a fixed set of approved modules.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {BRANDS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBrandId(b.id)}
                className={`rounded-md border p-3 text-left text-sm transition ${brandId === b.id ? "border-neutral-900 ring-1 ring-neutral-900" : "hover:border-neutral-400"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: b.colors.primary }} />
                  <span className="font-medium">{b.name}</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">{b.description}</div>
                {b.isSample && <Badge variant="outline" className="mt-2">Fictional sample</Badge>}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy || !config.ai.enabled} onClick={() => create("ai")} title={config.ai.enabled ? undefined : config.ai.reason}>
              <Sparkles /> Describe it to AI
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => create("blank")}>
              <Plus /> Blank (header, text, footer)
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => create("sample")}>
              <FileText /> Sample content
            </Button>
          </div>
          {!config.ai.enabled && <p className="mt-2 text-xs text-neutral-500">{config.ai.reason}</p>}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Drafts</h2>
          {list === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-neutral-500">No drafts yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-white">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => router.push(`/editor/${d.id}`)}>
                    <div className="truncate text-sm font-medium">{d.title || "Untitled email"}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {getBrand(d.brandId)?.name ?? d.brandId} · {d.subject || "No subject"} · {new Date(d.updatedAt).toLocaleString()}
                    </div>
                  </button>
                  <Button variant="ghost" size="icon" aria-label="Delete draft" onClick={() => remove(d.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
