import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLE_H2, ArticlePage } from "@/components/article-page";
import { ExamplePreview } from "@/components/example-open";
import { TEMPLATE_PAGES } from "@/lib/marketing/template-pages";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const PATH = "/templates";
const TITLE = "Free Outlook email templates for internal emails (.oft)";
const DESCRIPTION = "Free Outlook email templates for internal company emails: event invitations, team newsletters and service notices. Edit in the browser and download as an .oft file.";

export const metadata: Metadata = pageMetadata({ title: "Outlook email templates", shareTitle: TITLE, description: DESCRIPTION, path: PATH });

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}${PATH}`,
  isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  hasPart: TEMPLATE_PAGES.map((t) => ({ "@type": "CreativeWork", name: t.heading, url: `${SITE_URL}/templates/${t.slug}` })),
};

export default function Page() {
  return (
    <ArticlePage
      tag="Templates"
      title="Outlook email templates"
      path={PATH}
      updated="12 November 2026"
      jsonLd={jsonLd}
      intro="Free starting points for the emails companies send to their own people. Open one, change the words, pictures and colours in the browser, and download it as an .oft file that opens in Outlook. No account needed."
      cta={{ heading: "None of these fit?", body: "Start from a blank email and build your own from the same blocks: header, picture, text, button, columns, divider, social links and footer." }}
    >
      <section aria-labelledby="list-heading" className="space-y-4">
        <h2 id="list-heading" className={ARTICLE_H2}>
          Pick a starting point
        </h2>
        <ul className="grid gap-5 sm:grid-cols-2">
          {TEMPLATE_PAGES.map((t) => (
            <li key={t.slug}>
              <Link href={`/templates/${t.slug}`} className="group block h-full border-2 border-neutral-200 bg-white transition-all duration-150 hover:-translate-y-1 hover:border-neutral-900 hover:shadow-[5px_5px_0_0_#171717]">
                <ExamplePreview exampleId={t.exampleId} scale={0.4} height={300} title="" />
                <span className="block border-t p-3">
                  <span className="font-semibold text-neutral-900">{t.name}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-neutral-500">{t.goodFor.slice(0, 2).join(". ")}.</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </ArticlePage>
  );
}
