"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, FileText, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/lib/client/config";
import { storesFor } from "@/lib/client/stores";
import { BRANDS } from "@/lib/email/brands";
import { newEmailDocument, sampleEmailDocument } from "@/lib/email/starter";

/** Where an email starts: pick a brand and a starting point. Existing emails are in the Library. */
export function Workspace() {
  const config = useConfig();
  const { drafts } = useMemo(() => storesFor(config.mode), [config.mode]);
  const router = useRouter();
  const [brandId, setBrandId] = useState(BRANDS[0].id);
  const [busy, setBusy] = useState(false);

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

  return (
    <>
        <section id="new-email" className="scroll-mt-6 rounded-lg border bg-white p-5">
          <h2 className="text-lg font-semibold">New email</h2>
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

        <Link href="/library" className="flex items-center justify-between gap-3 rounded-lg border bg-white p-5 transition hover:border-neutral-900">
          <span>
            <span className="block text-lg font-semibold">Library</span>
            <span className="mt-1 block text-sm text-neutral-500">Reopen an email, or see your saved blocks and images.</span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-neutral-500" />
        </Link>
    </>
  );
}
