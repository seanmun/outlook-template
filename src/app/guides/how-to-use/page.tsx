import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLE_H2, ArticlePage, Prose } from "@/components/article-page";
import FIGURES from "@/lib/marketing/guide-figures.generated.json";
import { pageMetadata, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const PATH = "/guides/how-to-use";
const TITLE = "How to use OUTLOOKSUCKS.email: every tool explained";
const DESCRIPTION = "A picture guide to the OUTLOOKSUCKS.email editor: starting an email, the toolbar on every block, pictures, dark mode preview, templates, downloading for Outlook, the Library and team spaces.";

export const metadata: Metadata = pageMetadata({ title: "User guide", shareTitle: TITLE, description: DESCRIPTION, path: PATH, type: "article" });

type FigureName = keyof typeof FIGURES;
/** What each numbered marker on a picture means: the marker's key in the generated file, a short name, and what it does. */
type Notes = [key: string, name: string, does: string][];

/**
 * A screenshot of the real app with numbered markers on it, and a list underneath saying what
 * each number is. The pictures and marker positions come from scripts run against the app, so
 * they show the tools exactly as they are.
 */
function Figure({ name, notes }: { name: FigureName; notes: Notes }) {
  const fig = FIGURES[name];
  const placed = notes.flatMap(([key, label, does]) => {
    const at = fig.callouts.find((c) => c.key === key);
    return at ? [{ key, label, does, at }] : [];
  });
  return (
    <figure className="space-y-3">
      <div className="overflow-x-auto border bg-neutral-100 p-2">
        {/* The min-width keeps small tools readable on phones; the picture scrolls sideways there. */}
        <div className="relative mx-auto" style={{ maxWidth: fig.width, minWidth: Math.min(fig.width, 560) }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot shown at its own size, with markers placed over it by percentage */}
          <img src={fig.src} alt={fig.alt} width={fig.width} height={fig.height} loading="lazy" className="block h-auto w-full" />
          {placed.map((p, i) => (
            <span
              key={p.key}
              aria-hidden
              className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-red-600 text-[11px] leading-none font-bold text-white shadow"
              style={{ left: `${p.at.x}%`, top: `${p.at.y}%` }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      <figcaption>
        <ol className="grid gap-x-6 gap-y-2 text-sm leading-relaxed text-neutral-700 sm:grid-cols-2">
          {placed.map((p, i) => (
            <li key={p.key} className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] leading-none font-bold text-white">{i + 1}</span>
              <span>
                <strong className="text-neutral-900">{p.label}.</strong> {p.does}
              </span>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}${PATH}`,
  dateModified: "2026-11-13",
  inLanguage: "en",
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default function Page() {
  return (
    <ArticlePage
      tag="User guide"
      title="User guide"
      path={PATH}
      updated="13 November 2026"
      jsonLd={jsonLd}
      intro={
        <>
          Start from a template or a blank email, change it by clicking and dragging right on the email, then download a file that opens in Outlook. This page
          shows every tool, with a numbered picture for each part of the screen.
        </>
      }
      cta={{ heading: "Ready to try it?", body: "It is free and you do not need an account. Start from a template and you will have something to send in a few minutes." }}
    >
      <section aria-labelledby="start-heading" className="space-y-4">
        <h2 id="start-heading" className={ARTICLE_H2}>
          1. Start an email
        </h2>
        <Prose>
          <p>
            Go to <Link href="/new">Start an email</Link>. Pick a template to begin with something finished, or the blank email to build your own. Either way
            everything can be changed afterwards. Three templates show at first; &ldquo;View more templates&rdquo; shows the rest. At the top of that page
            you can also describe the email in words and let AI build a first draft, when AI is switched on for your account.
          </p>
        </Prose>
        <Figure
          name="start"
          notes={[
            ["blank", "Blank email", "A heading, some text and a footer, in a plain black-and-white look."],
            ["template", "A template", "Click one to open your own copy of it. Templates you save yourself appear first."],
          ]}
        />
      </section>

      <section aria-labelledby="editor-heading" className="space-y-4">
        <h2 id="editor-heading" className={ARTICLE_H2}>
          2. The editor at a glance
        </h2>
        <Figure
          name="editor"
          notes={[
            ["topbar", "Top bar", "Name the email, set its subject, undo, save as a template, open your Library, and download."],
            ["blocks", "Blocks", "The building pieces. Drag one onto the email, or click it to add it. Rows of columns are at the top; your saved blocks are at the bottom."],
            ["canvas", "The email", "This is what you are making. Click any text to type. Click a block to select it and show its toolbar. Drag a block to move it."],
            ["settings", "Settings", "Everything about the selected block in one list, for when you want exact numbers. It also lists things worth fixing before you send."],
          ]}
        />
      </section>

      <section aria-labelledby="text-heading" className="space-y-4">
        <h2 id="text-heading" className={ARTICLE_H2}>
          3. The toolbar on a block
        </h2>
        <Prose>
          <p>
            Click a block and a dark toolbar appears above it. This is the one for a text block, shown while typing. Other blocks have the same toolbar with a
            few buttons swapped.
          </p>
        </Prose>
        <Figure
          name="toolbar-text"
          notes={[
            ["name", "Block name", "Which kind of block is selected."],
            ["format", "Bold, italic, list, link", "Select some words first, then click. These show while you are typing in the text."],
            ["size", "Text size", "Minus makes the text smaller, plus makes it bigger. The number is the size."],
            ["colour", "Text colour", "Pick a colour for the text."],
            ["align", "Alignment", "Left, centre or right."],
            ["background", "Background colour", "The colour behind this block."],
            ["spacing", "Space above and below", "Minus tightens it, plus adds room. Hold Option (Alt) to see the spacing drawn on the email."],
            ["move", "Move up, move down", "Shift the block one place. You can also drag it."],
            ["duplicate", "Duplicate", "Makes a copy right below."],
            ["save", "Save for reuse", "Keeps this block in your saved blocks, ready to drop into any email."],
            ["delete", "Delete", "Removes the block. Undo brings it back."],
          ]}
        />
      </section>

      <section aria-labelledby="picture-heading" className="space-y-4">
        <h2 id="picture-heading" className={ARTICLE_H2}>
          4. Pictures
        </h2>
        <Prose>
          <p>
            To add a picture, drop a file from your computer onto the email, or add a picture block and click it. Click a picture to get its toolbar. The first
            button opens the picture menu.
          </p>
        </Prose>
        <Figure
          name="toolbar-picture"
          notes={[
            ["change", "Picture menu", "Opens the four choices below."],
            ["alt", "Description", "A few words describing the picture. It shows when pictures are blocked and is read aloud by screen readers."],
            ["width", "Picture width", "Minus makes it narrower, plus makes it wider."],
            ["link", "Link", "Make the picture clickable by giving it a web address."],
            ["upload", "Upload from your computer", "Choose a PNG, JPEG or GIF file, up to 5 MB."],
            ["library", "Choose from your library", "Reuse a picture you have uploaded before."],
            ["cutout", "Remove background", "Clears a plain background (such as white behind a logo) so the picture sits cleanly on any colour. Undo brings the original back."],
            ["remove", "Remove image", "Empties the block so you can put a different picture in."],
          ]}
        />
      </section>

      <section aria-labelledby="button-heading" className="space-y-4">
        <h2 id="button-heading" className={ARTICLE_H2}>
          5. Buttons
        </h2>
        <Prose>
          <p>Click the words on a button to change them. Use the toolbar to say where the button goes.</p>
        </Prose>
        <Figure
          name="toolbar-button"
          notes={[
            ["link", "Button link", "The web address the button opens. An amber dot means it has not been set yet."],
            ["background", "Background colour", "The colour behind the button's row. The button's own colour is in the settings panel on the right."],
          ]}
        />
      </section>

      <section aria-labelledby="view-heading" className="space-y-4">
        <h2 id="view-heading" className={ARTICLE_H2}>
          6. Check how it looks
        </h2>
        <Figure
          name="canvas-bar"
          notes={[
            ["sound", "Sound effects", "Turns the small sounds on or off."],
            ["dark", "Dark mode preview", "Shows roughly how the email looks for people who use a dark theme. Your email is not changed. Watch for pictures with a white background."],
            ["desktop", "Desktop width", "The normal view."],
            ["phone", "Phone width", "How wide a phone screen is. Outlook emails do not rearrange themselves on phones, so keep columns simple."],
          ]}
        />
      </section>

      <section aria-labelledby="topbar-heading" className="space-y-4">
        <h2 id="topbar-heading" className={ARTICLE_H2}>
          7. The top bar
        </h2>
        <Figure
          name="top-bar"
          notes={[
            ["name", "Name", "What the email is called in your Library. Only you see it."],
            ["subject", "Subject", "The subject line people see in their inbox."],
            ["saved", "Saved", "Your work saves itself as you go. This tells you when it has."],
            ["undo", "Undo and redo", "Step back or forward through your changes."],
            ["template", "Save as template", "Keep this email as a starting point for future ones."],
            ["library", "Library", "Your emails, templates, saved blocks and images."],
            ["download", "Download", "Get the file to open in Outlook."],
          ]}
        />
      </section>

      <section aria-labelledby="download-heading" className="space-y-4">
        <h2 id="download-heading" className={ARTICLE_H2}>
          8. Download and send
        </h2>
        <Figure
          name="download"
          notes={[
            ["windows", "Outlook on Windows", "Downloads a file ending in .oft."],
            ["mac", "Outlook on Mac", "Downloads a file ending in .emltpl."],
            ["both", "Both", "One zip with both files and a short note saying which is which. Handy when you are passing the email on."],
            ["go", "Download", "Then open the file. Outlook starts a new email with everything in place. Add who it is going to, and send it to yourself first to check it."],
          ]}
        />
        <Prose>
          <p>
            More on opening these files in each version of Outlook: <Link href="/guides/outlook-email-template">How to create an Outlook email template</Link>.
          </p>
        </Prose>
      </section>

      <section aria-labelledby="library-heading" className="space-y-4">
        <h2 id="library-heading" className={ARTICLE_H2}>
          9. Your Library
        </h2>
        <Prose>
          <p>
            The <Link href="/library">Library</Link> holds everything you have made. Without an account it lives in your browser on this computer. With a free
            account it is saved online and follows you to any computer.
          </p>
        </Prose>
        <Figure
          name="library"
          notes={[
            ["emails", "Emails", "Every email you have started, with a preview. Click one to carry on."],
            ["templates", "Templates", "Starting points. Click one to begin a new email from it."],
            ["blocks", "Saved blocks", "Blocks and rows you saved with the bookmark button."],
            ["images", "Images", "Every picture you have uploaded. You can upload more here, several at once."],
          ]}
        />
      </section>

      <section aria-labelledby="teams-heading" className="space-y-4">
        <h2 id="teams-heading" className={ARTICLE_H2}>
          10. Team spaces
        </h2>
        <Prose>
          <p>A team space is a shared Library for a company or a group. Everyone in it can open, change and reuse the same emails, templates, blocks and images.</p>
          <ul>
            <li>
              <strong>Create one:</strong> sign in, open the menu next to your picture at the top right, and choose &ldquo;Create a team space&rdquo;.
            </li>
            <li>
              <strong>Invite people:</strong> the same menu, then &ldquo;Manage team&rdquo;, then Members. A team space holds up to five people.
            </li>
            <li>
              <strong>Switch:</strong> use that menu to move between &ldquo;My Library&rdquo; and your team space. Each keeps its own things.
            </li>
            <li>
              <strong>Copy between them:</strong> in the Library, open Emails, Templates, Saved blocks or Images, point at an item and use the copy button to
              send a copy to another Library. Its pictures go with it.
            </li>
            <li>
              <strong>Two people, one email:</strong> if a teammate has the same email open, a bar at the top says so. Whoever saves second is asked to reload
              rather than overwriting the other person, and &ldquo;Work in a copy&rdquo; gives you your own version.
            </li>
          </ul>
        </Prose>
      </section>
    </ArticlePage>
  );
}
