"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfig } from "@/lib/client/config";
import { storesFor } from "@/lib/client/stores";
import { getBrand } from "@/lib/email/brands";
import { EXAMPLES, type EmailExample } from "@/lib/email/examples";
import { renderEmailHtml } from "@/lib/email/render";
import { sampleDataUrl } from "@/lib/email/samples";

const FRAME_WIDTH = 680;
const FRAME_HEIGHT = 1080;
const SCALE = 0.4;

/** A live, scaled-down render of an example: the same HTML the exporter writes, shown in a script-less frame. */
function Thumbnail({ example }: { example: EmailExample }) {
  const html = useMemo(() => renderEmailHtml(example.build(), { resolveImage: (src) => (src.kind === "sample" ? sampleDataUrl(src.sampleId) : null) }), [example]);
  return (
    <div className="relative overflow-hidden rounded-t-lg border-b bg-neutral-100" style={{ height: FRAME_HEIGHT * SCALE * 0.72 }} aria-hidden>
      <iframe
        srcDoc={html}
        title=""
        tabIndex={-1}
        sandbox=""
        loading="lazy"
        className="pointer-events-none absolute top-0 left-1/2 origin-top border-0"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `translateX(-50%) scale(${SCALE})` }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}

/** Example emails on the home page. Opening one copies it into a new draft and goes straight to the editor. */
export function ExampleGallery() {
  const config = useConfig();
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);

  async function open(example: EmailExample) {
    if (opening || !config.ready) return;
    setOpening(example.id);
    try {
      const draft = await storesFor(config.mode).drafts.create(example.build());
      router.push(`/editor/${draft.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setOpening(null);
    }
  }

  return (
    <section aria-labelledby="examples-heading" className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="examples-heading" className="font-[family-name:var(--font-display)] text-2xl leading-none text-neutral-900 uppercase">
            Start from an example
          </h2>
          <p className="mt-2 text-sm text-neutral-600">Real output, not mock-ups. Open one and it&apos;s yours to edit: drag blocks, type on the email, download the template.</p>
        </div>
      </div>
      <ul className="grid gap-5 sm:grid-cols-3">
        {EXAMPLES.map((example) => (
          <li key={example.id}>
            <button
              type="button"
              onClick={() => open(example)}
              disabled={!!opening}
              className="group block w-full rounded-lg border-2 border-neutral-200 bg-white text-left transition-all duration-150 hover:-translate-y-1 hover:border-neutral-900 hover:shadow-[5px_5px_0_0_#171717] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60"
            >
              <Thumbnail example={example} />
              <span className="block p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-neutral-900">{example.name}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                    {opening === example.id ? <Loader2 className="size-3.5 animate-spin" /> : <>Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></>}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">{example.blurb}</span>
                <span className="mt-1 block text-[11px] text-neutral-400">{getBrand(example.brandId)?.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
