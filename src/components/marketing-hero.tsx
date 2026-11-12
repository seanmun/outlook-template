"use client";
import { useState } from "react";
import { ArrowRight, Download, LayoutTemplate, ScanEye, Sparkles } from "lucide-react";
import Link from "next/link";
import { OutlookNoTicker } from "./outlook-no-ticker";

const STEPS = [
  { icon: Sparkles, title: "Start fast", body: "Open an example, drop in a design comp, or describe it. AI builds the first draft from your brand\u2019s blocks." },
  { icon: LayoutTemplate, title: "Edit on the email", body: "Drag blocks into place, split rows into columns, and type straight onto the canvas." },
  { icon: Download, title: "Download & send", body: "Grab an .oft your team opens in Outlook. The table soup is already written." },
];

/** A labelled block of the mock. In X-ray mode it shows the table markup it really is. */
function Part({ xray, tag, className, children }: { xray: boolean; tag: string; className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={`relative mt-1.5 transition-all duration-300 ${className ?? ""} ${
        xray ? "!translate-x-0 !bg-none !bg-transparent outline-1 outline-offset-0 outline-dashed outline-red-500" : "shadow-sm"
      }`}
    >
      <div className={`transition-opacity duration-300 ${xray ? "opacity-0" : "opacity-100"}`}>{children}</div>
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center p-1 text-center font-mono text-[9px] leading-tight text-red-600 transition-opacity duration-300 ${
          xray ? "opacity-100" : "opacity-0"
        }`}
      >
        {tag}
      </span>
    </div>
  );
}

/** A stylised email assembling itself (pure CSS). Hover or tap for the table soup underneath. */
function EmailMock() {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const xray = pinned || hover;
  return (
    <div className="relative mx-auto w-64 select-none sm:w-72">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-full bg-red-500/10 blur-2xl" />
      <button
        type="button"
        aria-pressed={xray}
        aria-label={xray ? "Hide the table markup" : "Show the table markup Outlook needs"}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setPinned((p) => !p)}
        className={`block w-full cursor-pointer border p-3 text-left shadow-xl transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
          xray ? "rotate-0 bg-neutral-950" : "rotate-2 bg-white"
        }`}
      >
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`flex h-3 min-w-0 flex-1 items-center overflow-hidden px-1 font-mono text-[8px] whitespace-nowrap transition-colors ${xray ? "bg-neutral-800 text-red-400" : "bg-neutral-100 text-transparent"}`}>
            &lt;table width=&quot;600&quot; cellpadding=&quot;0&quot;&gt;
          </span>
          {/* Windows-style window buttons: minimise, maximise, close. */}
          <span aria-hidden className={`flex shrink-0 items-center gap-2 pl-1 transition-colors ${xray ? "text-neutral-500" : "text-neutral-400"}`}>
            <span className="h-px w-2 bg-current" />
            <span className="size-2 border border-current" />
            <span className="relative size-2 before:absolute before:top-1/2 before:left-0 before:h-px before:w-full before:rotate-45 before:bg-current after:absolute after:top-1/2 after:left-0 after:h-px after:w-full after:-rotate-45 after:bg-current" />
          </span>
        </div>
        <div className={` p-0.5 transition-all duration-300 ${xray ? "outline-1 outline-dashed outline-red-500/60" : ""}`}>
          <Part xray={xray} tag={'<tr><td bgcolor="#171717"><table><tr><td>'} className="!mt-0 flex h-8 items-center justify-center bg-neutral-900">
            <span className="font-[family-name:var(--font-display)] text-[10px] tracking-wider text-white">YOUR BRAND</span>
          </Part>
          <Part xray={xray} tag={'<tr><td><img width="600" height="260" style="display:block">'} className="h-20 -translate-x-1 bg-gradient-to-br from-sky-600 via-teal-500 to-emerald-400" />
          <Part xray={xray} tag={'<tr><td style="padding:28px 40px"><h1 style="margin:0"><p style="margin:0 0 14px 0">'} className="bg-neutral-50">
            <div className="space-y-1.5 p-2">
              <div className="h-2.5 w-2/3 bg-neutral-800" />
              <div className="h-1.5 w-full bg-neutral-300" />
              <div className="h-1.5 w-11/12 bg-neutral-300" />
              <div className="h-1.5 w-3/4 bg-neutral-300" />
            </div>
          </Part>
          <Part xray={xray} tag={'<tr><td><table align="center"><tr><td bgcolor="#0d9488"><a>'} className="translate-x-1 bg-neutral-50">
            <div className="flex justify-center py-2">
              <span className="bg-teal-600 px-4 py-1 text-[10px] font-semibold text-white">RSVP</span>
            </div>
          </Part>
          <Part xray={xray} tag={"</td></tr></table></td></tr></table>"} className="h-6 bg-neutral-200" />
        </div>
      </button>
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-4 -right-5 border bg-white px-2.5 py-1.5 font-mono text-[11px] shadow-md transition-transform duration-500 ${xray ? "rotate-12" : "rotate-6"}`}
      >
        town-hall<span className="text-red-600">.oft</span>
      </div>
      <p className="mt-6 flex items-center justify-center gap-1 text-center text-[11px] text-neutral-500">
        <ScanEye className="size-3.5" />
        {xray ? "Yep. Tables all the way down." : "Hover (or tap) to see what Outlook demands"}
      </p>
    </div>
  );
}

export function MarketingHero() {
  return (
    // The brackets sit outside the card, so they live on a wrapper the card's clipping can't reach.
    <div className="corner-marks">
    <section className="relative overflow-hidden border bg-white">
      <div className="relative grid items-center gap-10 p-8 sm:p-10 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="mb-3 inline-block -rotate-1 bg-red-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-white">
            Internal email, minus the pain
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] text-neutral-900 sm:text-5xl">
            Outlook sucks.
            <br />
            <span className="text-red-600">Your emails</span> don&apos;t have to.
          </h1>
          <p className="mt-4 max-w-md text-neutral-600">
            Describe the email. AI assembles it from your brand&apos;s approved building blocks. Polish it in a visual editor, then download a template your
            team opens in Outlook and sends.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href="/new"
              className="group inline-flex items-center gap-2.5 border-2 border-neutral-900 bg-red-600 px-6 py-3 font-[family-name:var(--font-display)] text-lg leading-none tracking-wide text-white uppercase shadow-[5px_5px_0_0_#171717] transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-red-500 hover:shadow-[7px_7px_0_0_#171717] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900 active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0_0_#171717]"
            >
              Build an email <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" strokeWidth={3} />
            </Link>
            <span className="text-xs text-neutral-500">No HTML. No table hacks. No crying.</span>
          </div>
          <figure className="mt-5 max-w-md">
            <code className="block bg-neutral-950 px-3 py-2 font-mono text-xs leading-relaxed break-all text-neutral-300">
              <span className="text-red-400">&lt;table&gt;</span>&lt;tr&gt;&lt;td&gt;<span className="text-red-400">&lt;table&gt;</span>&lt;tr&gt;&lt;td&gt;
              <span className="text-red-400">&lt;table&gt;</span>&lt;tr&gt;&lt;td&gt;<span className="animate-pulse text-neutral-500">▍</span>
            </code>
            <figcaption className="mt-1.5 text-xs text-neutral-500">
              Classic Outlook for Windows still renders email with Microsoft Word. We write the table soup so you don&apos;t have to.
            </figcaption>
          </figure>
        </div>
        <EmailMock />
      </div>
      <OutlookNoTicker />
      <div className="relative grid border-t bg-neutral-50/80 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex gap-3 border-b p-5 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
            <span className="font-[family-name:var(--font-display)] text-2xl leading-none text-red-600">{i + 1}</span>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <s.icon className="size-4 text-neutral-500" /> {s.title}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
    </div>
  );
}
