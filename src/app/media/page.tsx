import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { BRAND, logoSvg } from "@/lib/brand/logo";

// Not linked from anywhere and kept out of search: a page to hand to people who ask for the logo.
export const metadata: Metadata = {
  title: "Media kit",
  description: "Logo, colours and fonts for OUTLOOKSUCKS.email.",
  robots: { index: false, follow: false },
};

const FILES = [
  { href: "/brand/logo.svg", label: "Logo (SVG)", note: "Scales to any size. For light backgrounds." },
  { href: "/brand/logo-on-dark.svg", label: "Logo on dark (SVG)", note: "Light grid for dark backgrounds." },
  { href: "/brand/logo-1024.png", label: "Logo (PNG, 1024px)", note: "Transparent background." },
  { href: "/brand/logo-on-dark-1024.png", label: "Logo on dark (PNG, 1024px)", note: "Transparent background." },
  { href: "/brand/avatar-light-1024.png", label: "Profile picture, light (PNG)", note: "Square with padding, for social profiles." },
  { href: "/brand/avatar-dark-1024.png", label: "Profile picture, dark (PNG)", note: "Square with padding, for social profiles." },
  { href: "/brand/lockup.png", label: "Logo with name (PNG)", note: "Transparent, for light backgrounds." },
  { href: "/brand/lockup-on-dark.png", label: "Logo with name on dark (PNG)", note: "Transparent, for dark backgrounds." },
];

const BANNERS = [
  { href: "/brand/banner-1500x500.png", label: "X header", size: "1500 x 500", w: 1500, h: 500 },
  { href: "/brand/banner-1584x396.png", label: "LinkedIn cover", size: "1584 x 396", w: 1584, h: 396 },
  { href: "/brand/share-1200x630.png", label: "Link share image", size: "1200 x 630", w: 1200, h: 630, note: "Shown automatically when the site is linked." },
  { href: "/brand/post-1080x1080.png", label: "Square post", size: "1080 x 1080", w: 1080, h: 1080 },
];

const COLORS = [
  { name: "Brand red", hex: BRAND.red, text: "#FFFFFF" },
  { name: "Ink", hex: BRAND.ink, text: "#FFFFFF" },
  { name: "Paper", hex: BRAND.paper, text: BRAND.ink },
  { name: "White", hex: BRAND.white, text: BRAND.ink },
  { name: "Body grey", hex: "#737373", text: "#FFFFFF" },
  { name: "Muted grey", hex: "#A1A1A1", text: BRAND.ink },
];

function Mark({ id, size, ink, detail }: { id: string; size: number; ink?: string; detail?: "full" | "simple" }) {
  return <span className="inline-block leading-none" dangerouslySetInnerHTML={{ __html: logoSvg({ id, size, ink, detail }) }} />;
}

function Wordmark({ dark }: { dark?: boolean }) {
  return (
    <span className="flex items-baseline font-[family-name:var(--font-display)] text-3xl leading-none whitespace-nowrap sm:text-5xl">
      <span className={dark ? "text-white" : "text-neutral-900"}>OUTLOOK</span>
      <span className="ml-0.5 inline-block -rotate-3 text-red-600">SUCKS</span>
      <span className={`ml-1 font-sans text-sm font-bold sm:text-xl ${dark ? "text-neutral-500" : "text-neutral-400"}`}>.email</span>
    </span>
  );
}

export default function MediaPage() {
  const h2 = "text-xs font-semibold tracking-wider text-neutral-500 uppercase";
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-12 p-6">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Media kit</h1>
          <p className="mt-2 max-w-2xl text-neutral-600">The logo is one lightning bolt cracking a table grid: the tables Outlook forces on every email, broken open.</p>
        </header>

        <section aria-labelledby="logo-heading" className="space-y-4">
          <h2 id="logo-heading" className={h2}>
            Logo
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-center border bg-white p-10">
              <Mark id="m-light" size={220} />
            </div>
            <div className="flex items-center justify-center bg-neutral-900 p-10">
              <Mark id="m-dark" size={220} ink={BRAND.paper} />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-6 border bg-white p-6">
            {[96, 64, 48].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <Mark id={`m-${s}`} size={s} />
                <span className="text-xs text-neutral-500">{s}px</span>
              </div>
            ))}
            {[32, 24, 16].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <Mark id={`m-${s}`} size={s} detail="simple" />
                <span className="text-xs text-neutral-500">{s}px</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-500">Below 48px the logo switches to a simpler grid with heavier lines. That version is the browser tab icon.</p>
        </section>

        <section aria-labelledby="lockup-heading" className="space-y-4">
          <h2 id="lockup-heading" className={h2}>
            Logo with name
          </h2>
          <div className="flex items-center gap-3 overflow-x-auto border bg-white p-8 sm:gap-5">
            <Mark id="l-light" size={72} />
            <Wordmark />
          </div>
          <div className="flex items-center gap-3 overflow-x-auto bg-neutral-900 p-8 sm:gap-5">
            <Mark id="l-dark" size={72} ink={BRAND.paper} />
            <Wordmark dark />
          </div>
        </section>

        <section aria-labelledby="banners-heading" className="space-y-4">
          <h2 id="banners-heading" className={h2}>
            Banners and share images
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {BANNERS.map((b) => (
              <li key={b.href}>
                <a href={b.href} download className="block border bg-white p-3 hover:border-neutral-900">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static brand files, shown at their own shape */}
                  <img src={b.href} alt={`${b.label} preview`} width={b.w} height={b.h} loading="lazy" className="h-auto max-h-64 w-full border object-contain" />
                  <span className="mt-3 block font-semibold text-neutral-900">
                    {b.label} <span className="font-normal text-neutral-500">({b.size})</span>
                  </span>
                  {b.note && <span className="mt-1 block text-sm text-neutral-500">{b.note}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="files-heading" className="space-y-4">
          <h2 id="files-heading" className={h2}>
            Logo files
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {FILES.map((f) => (
              <li key={f.href}>
                <a href={f.href} download className="block border bg-white p-4 hover:border-neutral-900">
                  <span className="font-semibold text-neutral-900">{f.label}</span>
                  <span className="mt-1 block text-sm text-neutral-500">{f.note}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="colors-heading" className="space-y-4">
          <h2 id="colors-heading" className={h2}>
            Colours
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {COLORS.map((c) => (
              <li key={c.name} className="border p-4" style={{ backgroundColor: c.hex, color: c.text }}>
                <span className="block text-sm font-semibold">{c.name}</span>
                <span className="font-mono text-sm">{c.hex}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="type-heading" className="space-y-4">
          <h2 id="type-heading" className={h2}>
            Type
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border bg-white p-6">
              <p className="font-[family-name:var(--font-display)] text-3xl">Bungee</p>
              <p className="mt-2 text-sm text-neutral-500">The name and big headings. Free from Google Fonts.</p>
            </div>
            <div className="border bg-white p-6">
              <p className="text-3xl font-semibold">Geist</p>
              <p className="mt-2 text-sm text-neutral-500">Everything else. Free from Google Fonts.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
