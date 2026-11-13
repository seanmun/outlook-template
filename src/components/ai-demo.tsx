"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * A recording of the real app: a request, a design comp and four pictures go in, and the AI builds
 * the email. Plays silently while it is on screen; people who ask for less motion get the controls
 * and a still picture instead.
 */
export function AiDemo() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.35 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  return (
    <section aria-labelledby="ai-demo-heading" className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ai-demo-heading" className="font-[family-name:var(--font-display)] text-2xl leading-none text-neutral-900 uppercase">
            Or let AI build it
          </h2>
          <p className="mt-2 text-sm text-neutral-600">Describe the email, add your design and your pictures, and AI builds a first draft you can change by hand. Free with an account.</p>
        </div>
        <Link href="/new" className="flex items-center gap-1 text-sm font-semibold text-red-600 hover:underline">
          Try it <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="border-2 border-neutral-900 bg-white shadow-[5px_5px_0_0_#171717]">
        <video
          ref={video}
          className="block aspect-[16/10] w-full"
          width={1280}
          height={800}
          poster="/demo/ai-build-poster.jpg"
          muted
          loop
          playsInline
          controls
          preload="metadata"
          aria-label="Screen recording: a request, a design and four pictures are added, and AI builds a launch announcement email."
        >
          <source src="/demo/ai-build.mp4" type="video/mp4" />
        </video>
      </div>
      <p className="mt-2 text-xs text-neutral-500">A real recording of this site. The wait for the AI is shortened; it took about 30 seconds.</p>
    </section>
  );
}
