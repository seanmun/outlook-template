import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLE_H2, ArticlePage, DataTable, Prose } from "@/components/article-page";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const PATH = "/guides/oft-vs-msg-vs-emltpl";
const TITLE = ".oft vs .msg vs .emltpl vs .eml: Outlook file types explained";
const DESCRIPTION =
  "What each Outlook email file is for: .oft is a Windows template, .msg is one saved message, .emltpl is a Mac template and .eml is a standard email file. Which app opens which.";

export const metadata: Metadata = pageMetadata({ title: ".oft vs .msg vs .emltpl", shareTitle: TITLE, description: DESCRIPTION, path: PATH, type: "article" });

const FAQ = [
  {
    q: "What is the difference between .oft and .msg?",
    a: "Both are Outlook for Windows files with the same internal format. A .msg file is one saved email, kept as a record. An .oft file is a template: opening it starts a new, unsent email with the content already in place. The file carries a marker that tells Outlook which of the two it is.",
  },
  {
    q: "Can I rename a .msg or .html file to .oft?",
    a: "No. An .html file is text and an .oft is a binary container, so renaming one to the other gives a file Outlook cannot read. To turn an email into a template, open it in Outlook and use File, Save As, Outlook Template.",
  },
  {
    q: "Can Outlook for Mac open an .oft file?",
    a: "No. Outlook for Mac uses its own template format, .emltpl, and a Mac .emltpl does not open in Outlook for Windows either. A template for both needs one file of each kind.",
  },
  {
    q: "What is an .emltpl file?",
    a: "An email template saved by Outlook for Mac with File, Save As Template. Microsoft publishes no specification for it; the files we have examined are ordinary email messages in text form, like an .eml file.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Article", headline: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}`, dateModified: "2026-11-12", inLanguage: "en", publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL } },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

export default function Page() {
  return (
    <ArticlePage
      tag="Outlook, explained"
      title=".oft vs .msg vs .emltpl"
      path={PATH}
      updated="12 November 2026"
      jsonLd={jsonLd}
      intro={
        <>
          An .oft file is an Outlook for Windows template: open it and you get a new email to send. A .msg file is one saved email, kept as a record. An .emltpl
          file is the template format of Outlook for Mac. An .eml file is a standard saved email that most mail apps can open. They are not interchangeable, and
          renaming one to another does not convert it.
        </>
      }
    >
      <section aria-labelledby="table-heading" className="space-y-4">
        <h2 id="table-heading" className={ARTICLE_H2}>
          At a glance
        </h2>
        <DataTable
          head={["File", "What it is", "Made by", "When you open it", "Use it for"]}
          rows={[
            [".oft", "Outlook template", "Outlook for Windows: File, Save As, Outlook Template", "A new, unsent email opens with the content in place", "Emails you send again and again"],
            [".msg", "One saved Outlook message", "Outlook for Windows: File, Save As, or dragging an email to a folder", "That email opens, with its sender, date and attachments", "Keeping or handing over a copy of a specific email"],
            [".emltpl", "Outlook for Mac template", "Outlook for Mac: File, Save As Template", "A new email opens from the template", "Reusable emails on a Mac"],
            [".eml", "Standard email file", "Most email apps", "That email opens in your mail app", "Moving single emails between different apps"],
          ]}
        />
      </section>

      <section aria-labelledby="oft-heading" className="space-y-4">
        <h2 id="oft-heading" className={ARTICLE_H2}>
          .oft: the Windows template
        </h2>
        <Prose>
          <p>
            An .oft holds a complete unsent email: subject, formatted body, pictures and attachments. Classic Outlook for Windows opens it as a new message when
            you double-click it. The new Outlook for Windows and Outlook on the web can add .oft files as templates under Settings, Mail, Templates, which
            Microsoft says needs a qualifying Microsoft 365 subscription. Outlook for Mac does not open them.
          </p>
          <p>
            Steps for each version are in <Link href="/guides/outlook-email-template">How to create an Outlook email template</Link>.
          </p>
        </Prose>
      </section>

      <section aria-labelledby="msg-heading" className="space-y-4">
        <h2 id="msg-heading" className={ARTICLE_H2}>
          .msg: one saved message
        </h2>
        <Prose>
          <p>
            A .msg is a snapshot of a single email as Outlook for Windows stores it, including who sent it, when, and any attachments. Inside, it is the same
            kind of binary container as an .oft; the difference is a marker that says &ldquo;message&rdquo; or &ldquo;template&rdquo;, and what Outlook does
            when you open it. Opening a .msg shows that email. Opening an .oft starts a new one.
          </p>
        </Prose>
      </section>

      <section aria-labelledby="emltpl-heading" className="space-y-4">
        <h2 id="emltpl-heading" className={ARTICLE_H2}>
          .emltpl: the Mac template
        </h2>
        <Prose>
          <p>
            Outlook for Mac saves templates with File, Save As Template, and opens them with File, New, Mail From Template. Microsoft publishes no specification
            for the format. The files we have examined are plain email messages in text form, the same shape as an .eml: a few headers, then the HTML body. That
            is our own finding, not a statement from Microsoft.
          </p>
        </Prose>
      </section>

      <section aria-labelledby="eml-heading" className="space-y-4">
        <h2 id="eml-heading" className={ARTICLE_H2}>
          .eml: the standard one
        </h2>
        <Prose>
          <p>
            An .eml is an email saved in the internet&apos;s standard message format, readable as text and understood by most mail apps on every system. It is a
            saved message, not a template: it opens as the email it was.
          </p>
        </Prose>
      </section>

      <section aria-labelledby="faq-heading" className="space-y-4">
        <h2 id="faq-heading" className={ARTICLE_H2}>
          Quick answers
        </h2>
        <Prose>
          {FAQ.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p className="mt-1">{f.a}</p>
            </div>
          ))}
          <p>
            More on how these files work inside, and on how Outlook draws email, in <Link href="/guides/outlook-rendering">Outlook rendering facts</Link>.
          </p>
        </Prose>
      </section>
    </ArticlePage>
  );
}
