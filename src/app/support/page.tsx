import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { SupportForm } from "@/components/support-form";

export const metadata: Metadata = pageMetadata({ title: "Support", description: "Something broken, or an email that looks wrong in Outlook? Tell us and a person will reply.", path: "/support" });

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-neutral-900 uppercase">Support</h1>
        <p className="mt-4 text-base leading-relaxed text-neutral-700">
          Something broken, or an email that looks wrong in Outlook? Send the details and a person will reply by email. No account needed.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Not sure how something works? The{" "}
          <Link href="/guides/how-to-use" className="text-neutral-900 underline underline-offset-2">
            user guide
          </Link>{" "}
          explains every tool.
        </p>
        <div className="mt-8">
          <SupportForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
