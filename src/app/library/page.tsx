"use client";
import { AppHeader, DemoBanner } from "@/components/app-header";
import { LibraryOverview } from "@/components/library";
import { SiteFooter } from "@/components/site-footer";
import { useConfig } from "@/lib/client/config";

/** Everything the visitor has made or uploaded: a card each for emails, saved blocks and images. */
export default function LibraryPage() {
  const { ready, spaceKey } = useConfig();
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">{ready ? <LibraryOverview key={spaceKey} /> : null}</main>
      <SiteFooter />
    </div>
  );
}
