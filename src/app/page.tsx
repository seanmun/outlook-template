import { AdSlot } from "@/components/ad-slot";
import { AppHeader, DemoBanner } from "@/components/app-header";
import { GridKeys } from "@/components/grid-keys";
import { ExampleGallery } from "@/components/example-gallery";
import { MarketingHero } from "@/components/marketing-hero";
import { SiteFooter } from "@/components/site-footer";

/** The marketing page. Building starts on /new. */
export default function Home() {
  return (
    <div className="grid-paper isolate flex min-h-screen flex-col">
      <GridKeys />
      <DemoBanner />
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 p-6">
        <MarketingHero />
        <ExampleGallery />
        {/* Small screens have no margin for the rails, so one ad sits here instead. */}
        <AdSlot placement="inline" className="ad-inline mx-auto" />
      </main>
      <SiteFooter />
      {/* Ads live in the page margins on wide screens, outside the content column. */}
      <AdSlot placement="rail-left" className="ad-rail fixed top-28 right-[calc(50%+448px+28px)]" />
      <AdSlot placement="rail-right" className="ad-rail fixed top-28 left-[calc(50%+448px+28px)]" />
    </div>
  );
}
