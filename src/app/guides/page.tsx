import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { GUIDES, TEMPLATES_LINK } from "@/lib/marketing/guides";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const TITLE = "Outlook email guides: templates, rendering and file types";
const DESCRIPTION = "Plain-language guides to email in Microsoft Outlook: how to create and share templates, why emails look different in Outlook, rounded buttons, and what .oft, .msg and .emltpl files are.";

export const metadata: Metadata = pageMetadata({ title: "Guides", shareTitle: TITLE, description: DESCRIPTION, path: "/guides" });

/** Escaped so the JSON can never close the script tag early. */
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/guides`,
  isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: `${SITE_URL}${g.href}` })),
}).replace(/</g, "\\u003c");

export default function GuidesPage() {
  return (
    <div className="grid-paper flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-6 py-12">
        <header>
          <p className="mb-3 inline-block -rotate-1 bg-red-600 px-2 py-0.5 text-xs font-semibold tracking-wider text-white uppercase">Outlook, explained</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] text-neutral-900 uppercase">Guides</h1>
          <p className="mt-4 text-base leading-relaxed text-neutral-700">
            Plain answers about email in Microsoft Outlook: making and sharing templates, why Outlook draws email the way it does, and what to do about it.
          </p>
        </header>

        <ul className="space-y-4">
          {GUIDES.map((g, i) => (
            <li key={g.href}>
              <Link
                href={g.href}
                className="group flex gap-4 border-2 border-neutral-200 bg-white p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-neutral-900 hover:shadow-[5px_5px_0_0_#171717] sm:p-6"
              >
                <span className="font-[family-name:var(--font-display)] text-3xl leading-none text-red-600">{i + 1}</span>
                <span>
                  <span className="block text-lg font-semibold text-neutral-900 group-hover:underline group-hover:underline-offset-2">{g.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-neutral-600">{g.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <section aria-labelledby="templates-heading" className="border-2 border-neutral-900 bg-white p-6 shadow-[5px_5px_0_0_#171717] sm:p-8">
          <h2 id="templates-heading" className="font-[family-name:var(--font-display)] text-2xl leading-tight text-neutral-900 uppercase">
            Rather start from a template?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">{TEMPLATES_LINK.blurb} Edit in the browser and download as an .oft file. Free, no account needed.</p>
          <Link
            href={TEMPLATES_LINK.href}
            className="mt-5 inline-block border-2 border-neutral-900 bg-red-600 px-5 py-2.5 font-[family-name:var(--font-display)] leading-none tracking-wide text-white uppercase hover:bg-red-500"
          >
            See the templates
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
