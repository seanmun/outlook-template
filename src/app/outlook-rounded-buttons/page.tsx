import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLE_H2, ArticlePage, DataTable, Prose } from "@/components/article-page";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const PATH = "/outlook-rounded-buttons";
const TITLE = "Rounded buttons in Outlook email: why border-radius fails and three ways around it";
const DESCRIPTION =
  "Classic Outlook for Windows ignores CSS border-radius, so email buttons come out square. The three options (square table button, VML shape, picture), with code and trade-offs.";

export const metadata: Metadata = pageMetadata({ title: "Rounded buttons in Outlook", shareTitle: TITLE, description: DESCRIPTION, path: PATH, type: "article" });

const FAQ = [
  {
    q: "Why are my email buttons square in Outlook?",
    a: "Classic Outlook for Windows draws email with Microsoft Word’s engine, which ignores the CSS border-radius property. A button that is rounded in Gmail, Apple Mail and the new Outlook shows with square corners there.",
  },
  {
    q: "How do I make a rounded button in Outlook?",
    a: "Either draw the button as a VML rounded rectangle inside an Outlook-only comment, with a normal HTML button for every other email app, or use a picture of a button. If rounded corners are not essential, a square button made from a padded table cell is the most reliable choice.",
  },
  {
    q: "Does border-radius work in the new Outlook?",
    a: "Yes. The new Outlook for Windows, Outlook on the web and Outlook for Mac use browser engines and support border-radius. Only classic Outlook for Windows, which uses Word, ignores it.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Article", headline: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}`, dateModified: "2026-11-12", inLanguage: "en", publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL } },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

const SQUARE = `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" bgcolor="#1D4ED8"
        style="padding:12px 28px; background-color:#1D4ED8; border-radius:8px;">
      <a href="https://example.com" target="_blank"
         style="font-family:Arial,sans-serif; font-size:16px; font-weight:bold;
                color:#ffffff; text-decoration:none; display:inline-block;">
        Read more
      </a>
    </td>
  </tr>
</table>`;

const VML = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
             xmlns:w="urn:schemas-microsoft-com:office:word"
             href="https://example.com"
             style="height:44px; v-text-anchor:middle; width:200px;"
             arcsize="18%" stroke="f" fillcolor="#1D4ED8">
  <w:anchorlock/>
  <center style="color:#ffffff; font-family:Arial,sans-serif;
                 font-size:16px; font-weight:bold;">Read more</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="https://example.com" target="_blank"
   style="background-color:#1D4ED8; border-radius:8px; color:#ffffff;
          display:inline-block; font-family:Arial,sans-serif; font-size:16px;
          font-weight:bold; line-height:44px; text-align:center;
          text-decoration:none; width:200px;">Read more</a>
<!--<![endif]-->`;

const IMAGE = `<a href="https://example.com" target="_blank">
  <img src="button.png" width="200" height="44" alt="Read more"
       border="0" style="display:block; border:0;">
</a>`;

export default function Page() {
  return (
    <ArticlePage
      tag="Outlook, explained"
      title="Rounded buttons in Outlook"
      path={PATH}
      updated="12 November 2026"
      jsonLd={jsonLd}
      intro={
        <>
          Classic Outlook for Windows ignores the CSS <code className="bg-neutral-200 px-1 font-mono text-[0.9em]">border-radius</code> property, so a rounded
          button shows with square corners. You have three options: accept a square button, draw the button as a VML shape that only Outlook sees, or use a
          picture of a button. Each has a cost.
        </>
      }
    >
      <section aria-labelledby="why-heading" className="space-y-4">
        <h2 id="why-heading" className={ARTICLE_H2}>
          Why it happens
        </h2>
        <Prose>
          <p>
            Classic Outlook for Windows has drawn email with Microsoft Word&apos;s layout engine since Outlook 2007, and Word does not support{" "}
            <a href="https://www.caniemail.com/features/css-border-radius/" target="_blank" rel="noopener">
              border-radius
            </a>
            . The new Outlook for Windows, Outlook on the web and Outlook for Mac use browser engines and round corners normally, so the problem is specific
            to the classic Windows app, which many companies still run. More in <Link href="/outlook-rendering">Outlook rendering facts</Link>.
          </p>
        </Prose>
      </section>

      <section aria-labelledby="compare-heading" className="space-y-4">
        <h2 id="compare-heading" className={ARTICLE_H2}>
          The three options compared
        </h2>
        <DataTable
          head={["Method", "Rounded in classic Outlook", "Text stays editable", "Shows with pictures blocked", "Catch"]}
          rows={[
            ["Padded table cell", "No, square", "Yes", "Yes", "Rounded everywhere except classic Outlook for Windows."],
            ["VML shape", "Yes", "Yes, with care", "Yes", "Needs a fixed width and height, so long labels can be cut off. Two copies of every button to maintain."],
            ["Picture", "Yes", "No", "No, shows the alt text", "The label can't be edited in Outlook, and a blocked picture leaves no button."],
          ]}
        />
      </section>

      <section aria-labelledby="square-heading" className="space-y-4">
        <h2 id="square-heading" className={ARTICLE_H2}>
          1. The padded table cell
        </h2>
        <Prose>
          <p>
            The colour and padding go on a table cell and the link sits inside it. Every email app draws this correctly. Apps that support{" "}
            <code>border-radius</code> round the corners; classic Outlook for Windows shows the same button square. Nothing breaks, and the label is ordinary
            text anyone can edit.
          </p>
          <pre>
            <code>{SQUARE}</code>
          </pre>
          <p>Put the padding on the cell, not on the link: Outlook does not reliably honour padding on links.</p>
        </Prose>
      </section>

      <section aria-labelledby="vml-heading" className="space-y-4">
        <h2 id="vml-heading" className={ARTICLE_H2}>
          2. The VML shape
        </h2>
        <Prose>
          <p>
            VML is Microsoft&apos;s older drawing language, and Word understands it. The button is written twice: a VML rounded rectangle inside a comment that
            only Word-based Outlook reads, and a normal HTML button that every other app reads.
          </p>
          <pre>
            <code>{VML}</code>
          </pre>
          <ul>
            <li>
              <code>arcsize</code> is the corner size as a percentage of the shorter side: 18% of a 44px-tall button is about 8px.
            </li>
            <li>The width and height are fixed. A label that outgrows them is cut off, so size the button for its longest wording.</li>
            <li>Change the label, colour or link in both copies.</li>
          </ul>
        </Prose>
      </section>

      <section aria-labelledby="image-heading" className="space-y-4">
        <h2 id="image-heading" className={ARTICLE_H2}>
          3. The picture
        </h2>
        <Prose>
          <p>A picture of a button looks identical everywhere, including classic Outlook, as long as pictures are shown.</p>
          <pre>
            <code>{IMAGE}</code>
          </pre>
          <ul>
            <li>Always set the alt text to the button&apos;s label. It is all the reader sees when pictures are blocked, and it is what screen readers announce.</li>
            <li>Save the picture at twice the display size so it stays sharp on high-resolution screens, and set the width and height in the HTML.</li>
            <li>Nobody can reword the button in Outlook; a new label means a new picture.</li>
          </ul>
        </Prose>
      </section>

      <section aria-labelledby="templates-heading" className="space-y-4">
        <h2 id="templates-heading" className={ARTICLE_H2}>
          Rounded buttons in Outlook templates
        </h2>
        <Prose>
          <p>
            Everything above is established practice for email that is sent from a mailing tool. An Outlook template (.oft) adds a step: Outlook opens it in its
            own editor and rewrites the HTML before sending, and not everything survives that.
          </p>
          <p>
            We are testing all three methods through that round trip in classic Outlook for Windows and will publish the results here. Until then,
            OUTLOOKSUCKS.email exports square buttons, the one method that cannot fail.
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
        </Prose>
      </section>
    </ArticlePage>
  );
}
