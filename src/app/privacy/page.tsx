import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, MAINTAINER } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy", description: "What OUTLOOKSUCKS.email does and does not do with your data." };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="10 November 2026"
      intro="The short version: you can use this site without an account, and when you do, the emails you build stay in your own browser. This page says exactly what leaves your device, when, and where it goes."
    >
      <section>
        <h2>Who runs this</h2>
        <p>
          OUTLOOKSUCKS.email is an independent project maintained by <a href={MAINTAINER.url}>{MAINTAINER.name}</a>. It is not affiliated with Microsoft.
        </p>
      </section>

      <section>
        <h2>Using the site without an account</h2>
        <ul>
          <li>
            <strong>Your drafts and images are stored in your browser,</strong> on your device, using the browser&apos;s local storage. They are not uploaded to be saved, and clearing your browser data deletes them.
          </li>
          <li>
            <strong>Exporting sends that one email to our server</strong> so it can be turned into an Outlook template file. It is processed for the download and not kept.
          </li>
          <li>
            <strong>No advertising trackers and no analytics scripts.</strong> One preference (sound effects on or off) is remembered in your browser.
          </li>
        </ul>
      </section>

      <section>
        <h2>If you create an account</h2>
        <p>Accounts are optional and may not be available at all times. When you sign in:</p>
        <ul>
          <li>
            <strong>Sign-in is handled by Clerk.</strong> Clerk stores your email address and manages your session. While accounts are switched on, Clerk&apos;s sign-in script loads on the site and sets the cookies needed for signing in, including for visitors who have not signed in yet.
          </li>
          <li>
            <strong>Your drafts and uploaded images are stored on Supabase,</strong> so you can reach them from any device. Only your account can read them.
          </li>
          <li>
            <strong>AI features send content to Anthropic.</strong> When you ask the AI to build or change an email, the email&apos;s content, your instruction, and any design comp or images you attach to that request are sent to Anthropic&apos;s API to produce the result. Don&apos;t include anything in an AI request that you are not allowed to share with a third-party processor.
          </li>
        </ul>
      </section>

      <section>
        <h2>Hosting and logs</h2>
        <p>
          The site is hosted on Vercel. Like any web host, it records basic technical information about requests, such as IP address, browser type and the page requested, to operate and secure the service.
        </p>
      </section>

      <section>
        <h2>Advertising</h2>
        <p>
          If ads appear, they are clearly labelled and served from this site itself. They do not track you or set cookies. Clicking one opens the advertiser&apos;s site in a new tab, and the link tells the advertiser the click came from here.
        </p>
      </section>

      <section>
        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We don&apos;t sell your data.</li>
          <li>We don&apos;t read your emails for any purpose other than providing the features you use.</li>
          <li>We don&apos;t send email on your behalf. You download a file and send it yourself.</li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Delete a draft at any time from <Link href="/new">My emails</Link>.</li>
          <li>Without an account, clearing this site&apos;s data in your browser removes everything.</li>
          <li>
            To have an account and its stored content deleted, get in touch through <a href={MAINTAINER.url}>{MAINTAINER.url.replace("https://", "")}</a>.
          </li>
        </ul>
      </section>

      <section>
        <h2>Changes</h2>
        <p>If what the site does with data changes, this page will be updated and the date at the top will change.</p>
      </section>
    </LegalPage>
  );
}
