import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";

/** Shared layout for the privacy and terms pages: plain, readable text. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-neutral-900 uppercase">{title}</h1>
        <p className="mt-2 text-xs text-neutral-500">Last updated {updated}</p>
        <p className="mt-6 text-base leading-relaxed text-neutral-700">{intro}</p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-neutral-700 [&_a]:text-neutral-900 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export const MAINTAINER = { name: "Sean Munley", url: "https://seanmun.com" };
