"use client";
import { use } from "react";
import { notFound } from "next/navigation";
import { AppHeader, DemoBanner } from "@/components/app-header";
import { LIBRARY_SECTIONS, LibrarySectionView, type LibrarySection } from "@/components/library";
import { SiteFooter } from "@/components/site-footer";
import { useConfig } from "@/lib/client/config";

/** One kind of thing in full: /library/emails, /library/blocks or /library/images. */
export default function LibrarySectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const { ready, spaceKey } = useConfig();
  if (!(section in LIBRARY_SECTIONS)) notFound();
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">{ready ? <LibrarySectionView key={spaceKey} section={section as LibrarySection} /> : null}</main>
      <SiteFooter />
    </div>
  );
}
