"use client";
import { useEffect, useState } from "react";
import { CANIEMAIL_LAST_UPDATE, OUTLOOK_WINDOWS_GREATEST_HITS, OUTLOOK_WINDOWS_NOS } from "@/lib/marketing/outlook-nos.generated";

const INTERVAL_MS = 2600;

/** Greatest hits in order, then the rest shuffled. Shuffled on the client only, to keep hydration stable. */
function rotationOrder(): number[] {
  const hits = Array.from({ length: OUTLOOK_WINDOWS_GREATEST_HITS }, (_, i) => i);
  const rest = Array.from({ length: OUTLOOK_WINDOWS_NOS.length - OUTLOOK_WINDOWS_GREATEST_HITS }, (_, i) => i + OUTLOOK_WINDOWS_GREATEST_HITS);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...hits, ...rest];
}

export function OutlookNoTicker() {
  // Server and first client render both start at item 0; the shuffle happens on the first tick.
  const [{ step, order }, setRotation] = useState<{ step: number; order: number[] | null }>({ step: 0, order: null });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setRotation((r) => ({ step: r.step + 1, order: r.order ?? rotationOrder() })), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused]);

  const index = order ? order[step % order.length] : 0;
  const feature = OUTLOOK_WINDOWS_NOS[index];

  return (
    <div
      className="relative overflow-hidden border-t bg-neutral-950 px-8 py-6 text-white sm:px-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-[3.5rem] text-lg leading-snug sm:min-h-0 sm:text-xl" aria-live="polite" aria-atomic="true">
          <span className="text-neutral-400">Does </span>
          <a
            key={`q-${step}`}
            href={feature.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-neutral-800 px-1.5 py-0.5 font-mono text-red-400 underline-offset-4 hover:underline motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
          >
            {feature.title}
          </a>
          <span className="text-neutral-400"> work in Outlook for Windows?</span>
        </p>
        <span
          key={`a-${step}`}
          aria-hidden
          className="shrink-0 -rotate-6 self-start border-4 border-red-600 px-3 py-0.5 font-[family-name:var(--font-display)] text-4xl leading-none text-red-600 motion-safe:animate-in motion-safe:zoom-in-150 motion-safe:fade-in motion-safe:duration-200 motion-safe:delay-300 motion-safe:fill-mode-backwards sm:self-auto"
        >
          NO.
        </span>
        <span className="sr-only">No.</span>
      </div>
      <p className="mt-3 text-[11px] text-neutral-500">
        {OUTLOOK_WINDOWS_NOS.length} features with zero support in classic Outlook for Windows, per{" "}
        <a href="https://www.caniemail.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">
          Can I email
        </a>{" "}
        (data updated {CANIEMAIL_LAST_UPDATE}). Hover to pause.
      </p>
    </div>
  );
}
