"use client";
import { AppHeader, DemoBanner } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { Workspace } from "@/components/workspace";
import { useConfig } from "@/lib/client/config";

/** The one page between the home page and the editor: choose a brand and a starting point, or reopen a draft. */
export default function NewEmailPage() {
  const { ready, spaceKey } = useConfig();
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-6">{ready ? <Workspace key={spaceKey} /> : null}</main>
      <SiteFooter />
    </div>
  );
}
