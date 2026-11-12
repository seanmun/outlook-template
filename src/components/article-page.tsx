import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { GUIDES } from "@/lib/marketing/guides";

export const ARTICLE_H2 = "font-[family-name:var(--font-display)] text-2xl leading-tight text-neutral-900 uppercase";

/** Readable text inside a white card: headings, paragraphs, lists, tables and code, styled once here. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 border bg-white p-5 text-sm leading-relaxed text-neutral-700 sm:p-6 [&_a]:text-neutral-900 [&_a]:underline [&_a]:underline-offset-2 [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-neutral-900 [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:bg-neutral-950 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-relaxed [&_pre]:text-neutral-200 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em] [&_strong]:text-neutral-900 [&_ul]:list-disc [&_ul]:pl-5">
      {children}
    </div>
  );
}

/** A table that scrolls sideways on small screens instead of squeezing. */
export function DataTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border bg-white">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-neutral-900 text-white">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="p-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="p-3 align-top font-semibold text-neutral-900">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="p-3 align-top text-neutral-700">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shared layout for the guides: tag, title, the answer up front, sections, related reading and the way into the app. */
export function ArticlePage(props: {
  tag: string;
  title: string;
  /** The answer in two or three sentences, before any detail. */
  intro: React.ReactNode;
  updated: string;
  /** This page's own address, so it is left out of "Keep reading". */
  path: string;
  jsonLd?: object;
  cta?: { heading: string; body: string };
  children: React.ReactNode;
}) {
  const related = GUIDES.filter((g) => g.href !== props.path);
  return (
    <div className="grid-paper flex min-h-screen flex-col">
      {/* Escaped so the JSON can never close the script tag early. */}
      {props.jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(props.jsonLd).replace(/</g, "\\u003c") }} />}
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 py-12">
        <header>
          <p className="mb-3 inline-block -rotate-1 bg-red-600 px-2 py-0.5 text-xs font-semibold tracking-wider text-white uppercase">{props.tag}</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] text-neutral-900 uppercase">{props.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-neutral-700">{props.intro}</p>
          <p className="mt-2 text-xs text-neutral-500">Last updated {props.updated}. Not affiliated with Microsoft.</p>
        </header>

        {props.children}

        <section aria-labelledby="cta-heading" className="border-2 border-neutral-900 bg-white p-6 shadow-[5px_5px_0_0_#171717] sm:p-8">
          <h2 id="cta-heading" className={ARTICLE_H2}>
            {props.cta?.heading ?? "Or skip all of this"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            {props.cta?.body ?? "OUTLOOKSUCKS.email builds the tables for you. Drag blocks into place, type on the email, and download an .oft template. Free, no account needed."}
          </p>
          <Link
            href="/new"
            className="mt-5 inline-block border-2 border-neutral-900 bg-red-600 px-5 py-2.5 font-[family-name:var(--font-display)] leading-none tracking-wide text-white uppercase hover:bg-red-500"
          >
            Build an email
          </Link>
        </section>

        <nav aria-labelledby="related-heading" className="space-y-4">
          <h2 id="related-heading" className={ARTICLE_H2}>
            Keep reading
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {related.map((g) => (
              <li key={g.href}>
                <Link href={g.href} className="block h-full border bg-white p-4 hover:border-neutral-900">
                  <span className="font-semibold text-neutral-900">{g.title}</span>
                  <span className="mt-1 block text-sm text-neutral-500">{g.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
