import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { GUIDES } from "@/lib/marketing/guides";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { CANIEMAIL_LAST_UPDATE, OUTLOOK_WINDOWS_NOS } from "@/lib/marketing/outlook-nos.generated";

const UPDATED = "12 November 2026";
const TITLE = "Outlook email rendering facts: .oft, .emltpl and what Outlook won't display";
const DESCRIPTION =
  "Plain answers about Outlook email: what .oft and .emltpl template files are and how to open them, which engine each Outlook uses, and the HTML and CSS classic Outlook for Windows ignores.";

export const metadata: Metadata = pageMetadata({ title: "Outlook rendering facts", shareTitle: TITLE, description: DESCRIPTION, path: "/outlook-rendering", type: "article" });

const SRC = {
  oftNew: "https://support.microsoft.com/en-US/Outlook/download-add-and-share-templates-as-oft-files-in-outlook",
  macTemplates: "https://support.microsoft.com/en-us/Outlook/can-i-create-email-templates-in-outlook-for-mac",
  until2029: "https://techcommunity.microsoft.com/t5/outlook-blog/new-outlook-for-windows-a-guide-to-product-availability/ba-p/4078895",
  msg: "https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxmsg/",
  rtf: "https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxrtfex/",
  caniemail: "https://www.caniemail.com/",
};

interface Fact {
  q: string;
  /** Plain text: shown on the page and given to search engines and AI assistants as the answer. */
  a: string;
  source?: { label: string; href: string };
  /** Our own finding from examining files, not a published statement. */
  observed?: boolean;
}

const TEMPLATE_FACTS: Fact[] = [
  {
    q: "What is an .oft file?",
    a: "An .oft file is an Outlook template: a saved, unsent email that Outlook opens as a new message with the subject, body and pictures already in place. Inside, it uses the same binary format as a saved Outlook message (.msg), with a marker that says it is a template. It is not an HTML file, and renaming an .html file to .oft does not make a template.",
    source: { label: "Microsoft: Outlook message file format", href: SRC.msg },
  },
  {
    q: "How do I open an .oft file in classic Outlook for Windows?",
    a: "Double-click the file and a new email opens, ready to edit and send. You can also go to Home, New Items, More Items, Choose Form, then pick \u201cUser Templates in File System\u201d. Outlook keeps its own templates in C:\\Users\\your-name\\AppData\\Roaming\\Microsoft\\Templates.",
    source: { label: "Microsoft Support: templates as .oft files", href: SRC.oftNew },
  },
  {
    q: "Does the new Outlook for Windows open .oft files?",
    a: "Yes, by adding them as templates rather than double-clicking. Go to Settings, Mail, Templates, choose Add, then Add OFT; several .oft files can be added at once. Microsoft rolled this out in late 2025 and says the account needs a qualifying Microsoft 365 subscription.",
    source: { label: "Microsoft Support: templates as .oft files", href: SRC.oftNew },
  },
  {
    q: "Does Outlook for Mac open .oft files?",
    a: "No. Outlook for Mac has its own template format, .emltpl. To make one, write the email and choose File, Save As Template. To use one, choose File, New, Mail From Template. Microsoft lists a Microsoft 365 subscription, or Outlook for Mac version 15.35 or later.",
    source: { label: "Microsoft Support: templates in Outlook for Mac", href: SRC.macTemplates },
  },
  {
    q: "What is inside an .emltpl file?",
    a: "Microsoft publishes no specification for .emltpl. The files we have examined are ordinary email messages saved as text, in the same format as an .eml file: a few headers such as Subject, followed by the HTML body.",
    observed: true,
  },
  {
    q: "Why can't I read an .oft file as HTML?",
    a: "Two reasons. The file is a binary container, not text. And Outlook usually stores the HTML body wrapped inside RTF (Rich Text Format), a scheme Microsoft documents as encapsulated HTML, so the HTML has to be unwrapped before it can be read.",
    source: { label: "Microsoft: HTML inside RTF", href: SRC.rtf },
  },
  {
    q: "Are pictures stored inside an Outlook template?",
    a: "They can be. A template either carries its pictures inside the file, as hidden attachments the body points to, or links to pictures on a web server. Embedded pictures always travel with the email and make the file larger. Linked pictures keep the file small, but Outlook can hold back linked pictures in a received email until the reader chooses to download them.",
  },
  {
    q: "Does Outlook send exactly the HTML that is in the template?",
    a: "No. Classic Outlook for Windows reads and writes email with Microsoft Word\u2019s engine. When a template is opened and sent, what goes out is Outlook\u2019s own rewritten version of the HTML, so the markup has to be simple enough to survive that round trip.",
  },
];

const ENGINES = [
  { app: "Classic Outlook for Windows (2007 to Microsoft 365)", engine: "Microsoft Word", note: "The hard one. Most of this page is about it." },
  { app: "New Outlook for Windows", engine: "Web browser engine", note: "Behaves like Outlook on the web." },
  { app: "Outlook on the web and Outlook.com", engine: "Web browser engine", note: "Modern CSS mostly works; some styles are filtered." },
  { app: "Outlook for Mac", engine: "WebKit (Apple\u2019s browser engine)", note: "Close to Apple Mail." },
];

const RENDERING_FACTS: Fact[] = [
  {
    q: "Why do emails look different in Outlook?",
    a: "Classic Outlook for Windows has drawn email with Microsoft Word\u2019s layout engine since Outlook 2007, not with a web browser. Word understands a small, old subset of HTML and CSS, so anything built for browsers (flexible layouts, rounded corners, background pictures) is ignored or drawn differently.",
  },
  {
    q: "How long will classic Outlook for Windows be around?",
    a: "Microsoft has said it will keep supporting existing installations of classic Outlook for Windows until at least 2029. Emails sent inside companies will keep meeting the Word engine for years.",
    source: { label: "Microsoft: new Outlook availability guide", href: SRC.until2029 },
  },
  {
    q: "How should an email be laid out for Outlook?",
    a: "With HTML tables and fixed pixel widths, usually 600 pixels wide. Classic Outlook for Windows does not support display:flex, display:grid, float or position, so tables are the only layout tool that holds. Writing styles directly on each element is the safest approach, because style blocks do not always survive Outlook rewriting the email.",
  },
  {
    q: "Do rounded corners work in Outlook?",
    a: "Not with CSS. Classic Outlook for Windows ignores border-radius, so buttons and boxes come out square. Rounded buttons need either a shape drawn in VML, Microsoft\u2019s older drawing language, or a picture of a button.",
  },
  {
    q: "Do background images and gradients work in Outlook?",
    a: "Not with CSS. Classic Outlook for Windows ignores background-image, linear-gradient and radial-gradient. A background picture needs VML, and a flat background colour should always be set as the fallback.",
  },
  {
    q: "Do shadows, transparency and animation work in Outlook?",
    a: "No. Classic Outlook for Windows ignores box-shadow, text-shadow, opacity, rgba() colours, transitions, CSS animation and :hover effects. Use solid colours and expect a still email.",
  },
  {
    q: "Which image formats work in Outlook?",
    a: "PNG, JPEG and GIF. Classic Outlook for Windows does not display WebP, AVIF or SVG embedded in the email. Give every picture an explicit width and height in pixels, because Outlook otherwise shows it at its original size.",
  },
  {
    q: "Why are my images or spacing the wrong size in Outlook?",
    a: "On high-resolution Windows screens, classic Outlook scales parts of an email unevenly unless the email tells it to work at 96 pixels per inch. A small Office settings block in the email fixes this. Line spacing also needs the Outlook-only rule mso-line-height-rule: exactly to match other apps.",
  },
  {
    q: "Do web fonts work in Outlook?",
    a: "Not reliably. Classic Outlook for Windows generally falls back to fonts installed on the reader\u2019s computer, so stick to common ones such as Arial, Verdana and Georgia, and always list a fallback.",
  },
  {
    q: "Does Outlook support dark mode styles or media queries?",
    a: "Classic Outlook for Windows does not support the prefers-color-scheme media query, so dark-mode styles written for other apps are ignored. Build the email at a fixed width and it will look the same at every window size.",
  },
  {
    q: "Can an email contain a form or a script in Outlook?",
    a: "No. Classic Outlook for Windows does not support form fields, audio, or any script, and it has no support for interactive formats such as AMP for Email. Link to a web page instead.",
  },
];

/** Escaped so the JSON can never close the script tag early. */
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  name: TITLE,
  url: `${SITE_URL}/outlook-rendering`,
  dateModified: "2026-11-12",
  inLanguage: "en",
  isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  mainEntity: [...TEMPLATE_FACTS, ...RENDERING_FACTS].map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
}).replace(/</g, "\\u003c");

function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="divide-y border bg-white">
      {facts.map((f) => (
        <div key={f.q} className="p-5 sm:p-6">
          <dt>
            <h3 className="text-base font-semibold text-neutral-900">{f.q}</h3>
          </dt>
          <dd className="mt-2 text-sm leading-relaxed text-neutral-700">
            <p>{f.a}</p>
            {f.source && (
              <p className="mt-2 text-xs text-neutral-500">
                Source:{" "}
                <a href={f.source.href} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-neutral-900">
                  {f.source.label}
                </a>
              </p>
            )}
            {f.observed && <p className="mt-2 text-xs text-neutral-500">This is our own finding from examining files, not a statement from Microsoft.</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function OutlookRenderingPage() {
  const h2 = "font-[family-name:var(--font-display)] text-2xl leading-tight text-neutral-900 uppercase";
  return (
    <div className="grid-paper flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-12 px-6 py-12">
        <header>
          <p className="mb-3 inline-block -rotate-1 bg-red-600 px-2 py-0.5 text-xs font-semibold tracking-wider text-white uppercase">Outlook, explained</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.05] text-neutral-900 uppercase">Outlook rendering facts</h1>
          <p className="mt-4 text-base leading-relaxed text-neutral-700">
            Plain answers about email in Microsoft Outlook: what the template files are, which engine each version of Outlook uses, and what classic Outlook for
            Windows will not display. Template files come first, because that is the part the rest of the internet skips.
          </p>
          <p className="mt-2 text-xs text-neutral-500">Last updated {UPDATED}. Not affiliated with Microsoft.</p>
        </header>

        <section aria-labelledby="templates-heading" className="space-y-4">
          <h2 id="templates-heading" className={h2}>
            Outlook template files: .oft and .emltpl
          </h2>
          <FactList facts={TEMPLATE_FACTS} />
        </section>

        <section aria-labelledby="engines-heading" className="space-y-4">
          <h2 id="engines-heading" className={h2}>
            Which engine each Outlook uses
          </h2>
          <div className="overflow-x-auto border bg-white">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-neutral-900 text-white">
                <tr>
                  <th scope="col" className="p-3 font-semibold">
                    Outlook
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    Draws email with
                  </th>
                  <th scope="col" className="p-3 font-semibold">
                    In practice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ENGINES.map((e) => (
                  <tr key={e.app}>
                    <th scope="row" className="p-3 font-semibold text-neutral-900">
                      {e.app}
                    </th>
                    <td className="p-3 text-neutral-700">{e.engine}</td>
                    <td className="p-3 text-neutral-700">{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="rendering-heading" className="space-y-4">
          <h2 id="rendering-heading" className={h2}>
            What classic Outlook for Windows does to an email
          </h2>
          <FactList facts={RENDERING_FACTS} />
        </section>

        <section aria-labelledby="list-heading" className="space-y-4">
          <h2 id="list-heading" className={h2}>
            {OUTLOOK_WINDOWS_NOS.length} features classic Outlook for Windows does not support
          </h2>
          <p className="text-sm leading-relaxed text-neutral-700">
            Every HTML and CSS feature that{" "}
            <a href={SRC.caniemail} target="_blank" rel="noopener" className="text-neutral-900 underline underline-offset-2">
              Can I email
            </a>{" "}
            records as unsupported in every tested version of classic Outlook for Windows. Each one links to its test results. Data last updated{" "}
            {CANIEMAIL_LAST_UPDATE}; Can I email is by Rémi Parmentier and contributors, MIT licence.
          </p>
          <ul className="flex flex-wrap gap-1.5 border bg-white p-5">
            {OUTLOOK_WINDOWS_NOS.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noopener" className="inline-block bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-800 hover:bg-red-600 hover:text-white">
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="cta-heading" className="border-2 border-neutral-900 bg-white p-6 shadow-[5px_5px_0_0_#171717] sm:p-8">
          <h2 id="cta-heading" className={h2}>
            Or skip all of this
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            OUTLOOKSUCKS.email builds the tables for you. Drag blocks into place, type on the email, and download an .oft template. Free, no account needed.
          </p>
          <Link
            href="/new"
            className="mt-5 inline-block border-2 border-neutral-900 bg-red-600 px-5 py-2.5 font-[family-name:var(--font-display)] leading-none tracking-wide text-white uppercase hover:bg-red-500"
          >
            Build an email
          </Link>
        </section>
        <nav aria-labelledby="related-heading" className="space-y-4">
          <h2 id="related-heading" className={h2}>
            Keep reading
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {GUIDES.filter((g) => g.href !== "/outlook-rendering").map((g) => (
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
