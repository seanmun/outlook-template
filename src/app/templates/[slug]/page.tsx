import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLE_H2, ArticlePage, Prose } from "@/components/article-page";
import { ExamplePreview, OpenExampleButton } from "@/components/example-open";
import { TEMPLATE_PAGES, templatePage } from "@/lib/marketing/template-pages";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return TEMPLATE_PAGES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = templatePage((await params).slug);
  if (!page) return {};
  return pageMetadata({ title: page.heading, shareTitle: `${page.heading} (free .oft)`, description: page.description, path: `/templates/${page.slug}` });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const page = templatePage((await params).slug);
  if (!page) notFound();
  const path = `/templates/${page.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: page.heading,
    description: page.description,
    url: `${SITE_URL}${path}`,
    isAccessibleForFree: true,
    encodingFormat: "application/vnd.ms-outlook",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
  const others = TEMPLATE_PAGES.filter((t) => t.slug !== page.slug);

  return (
    <ArticlePage tag="Free template" title={page.heading} path={path} updated="12 November 2026" jsonLd={jsonLd} intro={page.description}>
      <section aria-labelledby="preview-heading" className="space-y-4">
        <h2 id="preview-heading" className={ARTICLE_H2}>
          The template
        </h2>
        <div className="border-2 border-neutral-900 bg-white">
          <ExamplePreview exampleId={page.exampleId} scale={0.75} height={560} title={`Preview of the ${page.name.toLowerCase()} email template`} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t-2 border-neutral-900 p-5">
            <OpenExampleButton exampleId={page.exampleId}>Use this template</OpenExampleButton>
            <span className="text-xs text-neutral-500">Opens in the editor. Free, no account needed.</span>
          </div>
        </div>
        <p className="text-xs text-neutral-500">The brand, names and wording in the preview are invented samples. Everything is yours to change.</p>
      </section>

      <section aria-labelledby="for-heading" className="space-y-4">
        <h2 id="for-heading" className={ARTICLE_H2}>
          What it is good for
        </h2>
        <Prose>
          <ul>
            {page.goodFor.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Prose>
      </section>

      <section aria-labelledby="contains-heading" className="space-y-4">
        <h2 id="contains-heading" className={ARTICLE_H2}>
          What is in it
        </h2>
        <Prose>
          <ul>
            {page.contains.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p>Every block is table-based HTML written for classic Outlook for Windows, with the pictures embedded in the file.</p>
        </Prose>
      </section>

      <section aria-labelledby="how-heading" className="space-y-4">
        <h2 id="how-heading" className={ARTICLE_H2}>
          How to use it
        </h2>
        <Prose>
          <ol>
            <li>Select &ldquo;Use this template&rdquo;. It opens in the editor as your own copy.</li>
            <li>Click any text to rewrite it, drop in your own pictures, and drag blocks to reorder, add or remove them.</li>
            <li>Download it as an .oft file.</li>
            <li>
              Open the file in Outlook, add recipients and send. Steps for each version of Outlook are in{" "}
              <Link href="/outlook-email-template">How to create an Outlook email template</Link>.
            </li>
          </ol>
        </Prose>
      </section>

      <section aria-labelledby="tips-heading" className="space-y-4">
        <h2 id="tips-heading" className={ARTICLE_H2}>
          Writing tips
        </h2>
        <Prose>
          <ul>
            {page.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Prose>
      </section>

      <section aria-labelledby="more-heading" className="space-y-4">
        <h2 id="more-heading" className={ARTICLE_H2}>
          More templates
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {others.map((t) => (
            <li key={t.slug}>
              <Link href={`/templates/${t.slug}`} className="block h-full border bg-white p-4 hover:border-neutral-900">
                <span className="font-semibold text-neutral-900">{t.heading}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </ArticlePage>
  );
}
