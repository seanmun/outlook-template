import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLE_H2, ArticlePage, Prose } from "@/components/article-page";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const PATH = "/outlook-email-template";
const TITLE = "How to create an Outlook email template (.oft): Windows, new Outlook and Mac";
const DESCRIPTION =
  "Step-by-step: create, save and reuse an email template in classic Outlook for Windows, the new Outlook, Outlook on the web and Outlook for Mac, and how to share one with your team.";

export const metadata: Metadata = pageMetadata({ title: "How to create an Outlook email template", shareTitle: TITLE, description: DESCRIPTION, path: PATH, type: "article" });

const SRC = {
  create: "https://support.microsoft.com/en-us/office/create-an-email-message-template-43ec7142-4dd0-4351-8727-bd0977b6b2d1",
  send: "https://support.microsoft.com/en-us/topic/56c645fc-1b25-4059-808b-55ee72b6bc2d",
  oft: "https://support.microsoft.com/en-US/Outlook/download-add-and-share-templates-as-oft-files-in-outlook",
  mac: "https://support.microsoft.com/en-us/Outlook/can-i-create-email-templates-in-outlook-for-mac",
};

const CLASSIC_CREATE = [
  "On the Home tab, select New Email.",
  "Write the email: subject, text, pictures, links.",
  "In the message window, select File, then Save As.",
  "In the \u201cSave as type\u201d list, choose Outlook Template.",
  "Type a name for the template and select Save.",
];
const CLASSIC_USE = [
  "On the Home tab, select New Items, then More Items, then Choose Form.",
  "In the \u201cLook In\u201d list, choose \u201cUser Templates in File System\u201d.",
  "Select your template and select Open. If it is saved somewhere else, select Browse to find it.",
  "Add recipients, change anything you need, and select Send.",
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      headline: TITLE,
      description: DESCRIPTION,
      url: `${SITE_URL}${PATH}`,
      dateModified: "2026-11-12",
      inLanguage: "en",
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@type": "HowTo",
      name: "Create an email template in classic Outlook for Windows",
      step: CLASSIC_CREATE.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
    },
    {
      "@type": "HowTo",
      name: "Send an email from a template in classic Outlook for Windows",
      step: CLASSIC_USE.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
    },
  ],
};

function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="text-xs text-neutral-500">
      Source:{" "}
      <a href={href} target="_blank" rel="noopener">
        {children}
      </a>
    </p>
  );
}

export default function Page() {
  return (
    <ArticlePage
      tag="How to"
      title="How to create an Outlook email template"
      path={PATH}
      updated="12 November 2026"
      jsonLd={jsonLd}
      intro={
        <>
          In classic Outlook for Windows, write the email, then choose File, Save As, and pick &ldquo;Outlook Template&rdquo;. That saves an .oft file you can
          reopen as a fresh email any time. The new Outlook and Outlook for Mac do it differently; each is below, followed by how to share a template with your
          team and how to make one that looks designed.
        </>
      }
      cta={{
        heading: "Want one that looks designed?",
        body: "Outlook\u2019s own editor can only do so much. Build the email here by dragging blocks into place, download it as an .oft, and it opens in Outlook like any template you saved yourself. Free, no account needed.",
      }}
    >
      <section aria-labelledby="classic-heading" className="space-y-4">
        <h2 id="classic-heading" className={ARTICLE_H2}>
          Classic Outlook for Windows
        </h2>
        <Prose>
          <h3>Create the template</h3>
          <ol>
            {CLASSIC_CREATE.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p>
            Outlook saves templates in <code>C:\Users\your-name\AppData\Roaming\Microsoft\Templates</code> unless you choose another folder.
          </p>
          <h3>Send an email from it</h3>
          <ol>
            {CLASSIC_USE.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p>
            Double-clicking an .oft file in File Explorer does the same thing: a new email opens with everything in place. Changes you make to that email are
            not saved back to the template.
          </p>
          <Source href={SRC.create}>Microsoft Support: Create email templates in Outlook</Source>
        </Prose>
      </section>

      <section aria-labelledby="new-heading" className="space-y-4">
        <h2 id="new-heading" className={ARTICLE_H2}>
          New Outlook for Windows and Outlook on the web
        </h2>
        <Prose>
          <p>
            These two share a feature called Mail Templates. Microsoft says the account needs a qualifying Microsoft 365 subscription. Templates are stored with
            your account, not as files on your computer.
          </p>
          <h3>Create the template</h3>
          <ol>
            <li>On the Home tab, select New, then Mail, and write the email.</li>
            <li>On the Message tab, select Mail template, then &ldquo;Save email as template&rdquo;.</li>
            <li>Type a name and select Save.</li>
          </ol>
          <h3>Send an email from it</h3>
          <ol>
            <li>On the Home tab, select New, then &ldquo;Mail from template&rdquo;.</li>
            <li>Choose the template from the list. It opens as a new draft.</li>
            <li>Add recipients, change anything you need, and select Send.</li>
          </ol>
          <h3>Add an .oft file someone sent you</h3>
          <ol>
            <li>Open Settings, then Mail, then Templates.</li>
            <li>Select Add, then &ldquo;Add OFT&rdquo;.</li>
            <li>Select Choose, pick one or more .oft files, and select Add.</li>
          </ol>
          <p>From the same Templates page, &ldquo;Save as OFT&rdquo; downloads one of your templates as a file.</p>
          <Source href={SRC.oft}>Microsoft Support: Download, add, and share templates as .oft files</Source>
        </Prose>
      </section>

      <section aria-labelledby="mac-heading" className="space-y-4">
        <h2 id="mac-heading" className={ARTICLE_H2}>
          Outlook for Mac
        </h2>
        <Prose>
          <p>
            Outlook for Mac does not use .oft files. Its templates are saved as .emltpl files. Microsoft lists a Microsoft 365 subscription, or Outlook for Mac
            version 15.35 or later.
          </p>
          <h3>Create the template</h3>
          <ol>
            <li>Select the email you want to use as a template.</li>
            <li>Select File, then &ldquo;Save As Template&rdquo;.</li>
            <li>Type a name, choose where to save it, and select Save.</li>
          </ol>
          <h3>Send an email from it</h3>
          <ol>
            <li>Select File, then New, then &ldquo;Mail From Template&rdquo;.</li>
            <li>Choose the template (its name ends in .emltpl) and select Open.</li>
            <li>Add your content and recipients, and select Send.</li>
          </ol>
          <Source href={SRC.mac}>Microsoft Support: Can I create email templates in Outlook for Mac?</Source>
        </Prose>
      </section>

      <section aria-labelledby="share-heading" className="space-y-4">
        <h2 id="share-heading" className={ARTICLE_H2}>
          Share a template with your team
        </h2>
        <Prose>
          <ul>
            <li>
              <strong>Send the file.</strong> An .oft is an ordinary file: attach it to an email or put it on a shared drive. Colleagues on classic Outlook
              double-click it; colleagues on the new Outlook add it under Settings, Mail, Templates.
            </li>
            <li>
              <strong>From the new Outlook,</strong> open the draft and choose &ldquo;Forward as OFT&rdquo; on the Message tab. Outlook attaches the template to a
              new email for you.
            </li>
            <li>
              <strong>Mac and Windows don&apos;t share a format.</strong> A Windows .oft will not open in Outlook for Mac, and a Mac .emltpl will not open in
              Outlook for Windows. See <Link href="/oft-vs-msg-vs-emltpl">.oft vs .msg vs .emltpl</Link>.
            </li>
          </ul>
        </Prose>
      </section>

      <section aria-labelledby="limits-heading" className="space-y-4">
        <h2 id="limits-heading" className={ARTICLE_H2}>
          Why templates made in Outlook look plain
        </h2>
        <Prose>
          <p>
            A template can only contain what Outlook&apos;s editor can produce, and classic Outlook for Windows draws email with Microsoft Word&apos;s engine.
            Columns, banners and buttons are awkward to build by hand there, and layouts copied in from a web page usually fall apart. The reliable approach is
            table-based HTML written for that engine, which is what dedicated email builders output. The details are in{" "}
            <Link href="/outlook-rendering">Outlook rendering facts</Link>, and there are ready-made starting points in{" "}
            <Link href="/templates">Outlook email templates</Link>.
          </p>
          <Source href={SRC.send}>Microsoft Support: Send an email message based on a template</Source>
        </Prose>
      </section>
    </ArticlePage>
  );
}
