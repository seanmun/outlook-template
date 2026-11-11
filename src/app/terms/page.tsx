import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, MAINTAINER } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms · OUTLOOKSUCKS.email", description: "The terms for using OUTLOOKSUCKS.email." };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="10 November 2026"
      intro="OUTLOOKSUCKS.email is a free tool for building emails and exporting them as Outlook templates. By using it you agree to the terms below. They are written to be read."
    >
      <section>
        <h2>The service</h2>
        <p>
          The site is an independent project maintained by <a href={MAINTAINER.url}>{MAINTAINER.name}</a>. It is not affiliated with, sponsored by, or endorsed by Microsoft. Outlook is a trademark of Microsoft Corporation, used here only to describe what the tool works with.
        </p>
        <p>It is offered free of charge. Features may change, be limited, or be withdrawn at any time, including accounts and AI features.</p>
      </section>

      <section>
        <h2>Your content</h2>
        <ul>
          <li>The emails, text and images you create or upload are yours.</li>
          <li>You give the site permission to store and process them only as needed to provide the features you use.</li>
          <li>You are responsible for having the right to use everything you put into an email, including images, logos and brand names.</li>
        </ul>
      </section>

      <section>
        <h2>Test before you send</h2>
        <p>
          Outlook does not render email the way a browser does, and what you see in the editor is an approximation. <strong>Always send yourself a test from Outlook before sending to anyone else.</strong> You are responsible for what you send and to whom.
        </p>
      </section>

      <section>
        <h2>AI features</h2>
        <p>AI-generated content can be wrong, incomplete or unsuitable. Review everything it produces before you use it. Don&apos;t submit content you are not permitted to share with a third-party AI provider.</p>
      </section>

      <section>
        <h2>Keep your own copies</h2>
        <p>
          Without an account, drafts live only in your browser and are lost if its data is cleared. With an account, we take reasonable care but make no promise that stored content will always be available. Export anything you need to keep.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>Please don&apos;t use the site to:</p>
        <ul>
          <li>create or send unlawful, deceptive or harassing content, phishing emails, or spam;</li>
          <li>impersonate a person or organisation you don&apos;t represent;</li>
          <li>upload malware, or probe, overload or disrupt the service;</li>
          <li>access the service by automated means in a way that burdens it.</li>
        </ul>
        <p>Access may be limited or ended for anyone who does.</p>
      </section>

      <section>
        <h2>No warranty</h2>
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, express or implied, including that it will be uninterrupted, error-free, or that exported templates will display correctly in any particular email client.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, the maintainer is not liable for any indirect, incidental or consequential loss, or for lost data, profits or business, arising from your use of the service or of anything you create or send with it.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          How the site handles data is described on the <Link href="/privacy">privacy page</Link>.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          These terms may be updated; the date at the top shows the latest version, and continuing to use the site means you accept it. Questions can be sent through <a href={MAINTAINER.url}>{MAINTAINER.url.replace("https://", "")}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
