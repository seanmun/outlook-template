"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfig } from "@/lib/client/config";
import { storesFor } from "@/lib/client/stores";
import { EXAMPLES } from "@/lib/email/examples";
import { renderEmailHtml } from "@/lib/email/render";
import { sampleDataUrl } from "@/lib/email/samples";

const FRAME_WIDTH = 680;

/** A live render of an example email (the same HTML the exporter writes), scaled to fit and shown in a script-less frame. */
export function ExamplePreview({ exampleId, scale = 0.5, height = 420, title }: { exampleId: string; scale?: number; height?: number; title: string }) {
  const example = EXAMPLES.find((e) => e.id === exampleId);
  const html = useMemo(() => (example ? renderEmailHtml(example.build(), { resolveImage: (src) => (src.kind === "sample" ? sampleDataUrl(src.sampleId) : null) }) : ""), [example]);
  if (!example) return null;
  return (
    <div className="relative overflow-hidden bg-neutral-100" style={{ height }}>
      <iframe
        srcDoc={html}
        title={title}
        tabIndex={-1}
        sandbox=""
        loading="lazy"
        className="pointer-events-none absolute top-0 left-1/2 origin-top border-0"
        style={{ width: FRAME_WIDTH, height: height / scale, transform: `translateX(-50%) scale(${scale})` }}
      />
    </div>
  );
}

/** Copies an example into a new draft and opens it in the editor. */
export function OpenExampleButton({ exampleId, children }: { exampleId: string; children: React.ReactNode }) {
  const config = useConfig();
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  async function open() {
    const example = EXAMPLES.find((e) => e.id === exampleId);
    if (opening || !config.ready || !example) return;
    setOpening(true);
    try {
      const draft = await storesFor(config.mode).drafts.create(example.build());
      router.push(`/editor/${draft.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setOpening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className="group inline-flex items-center gap-2.5 border-2 border-neutral-900 bg-red-600 px-5 py-2.5 font-[family-name:var(--font-display)] leading-none tracking-wide text-white uppercase shadow-[5px_5px_0_0_#171717] transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-red-500 hover:shadow-[7px_7px_0_0_#171717] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900 active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0_0_#171717] disabled:opacity-70"
    >
      {children} {opening ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" strokeWidth={3} />}
    </button>
  );
}
