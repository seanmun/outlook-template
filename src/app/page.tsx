import type { Metadata } from "next";
import { pageMetadata, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { AdSlot } from "@/components/ad-slot";
import { AppHeader, DemoBanner } from "@/components/app-header";
import { GridKeys } from "@/components/grid-keys";
import { ExampleGallery } from "@/components/example-gallery";
import { MarketingHero } from "@/components/marketing-hero";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });

/** What the site is, in the structured form search engines and AI assistants read. Escaped so it can never close the script tag. */
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: "en" },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      description: "A free web app for building internal company emails by dragging blocks and downloading them as Outlook templates (.oft files).",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (runs in a web browser)",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: ["Drag-and-drop email builder", "Outlook template (.oft) export", "Pictures embedded in the template", "Rows and columns", "No account needed"],
      image: `${SITE_URL}/opengraph-image.png`,
      creator: { "@id": `${SITE_URL}/#maker` },
    },
    { "@type": "Person", "@id": `${SITE_URL}/#maker`, name: "Sean Munley", url: "https://seanmun.com" },
    { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/brand/logo-1024.png`, founder: { "@id": `${SITE_URL}/#maker` } },
  ],
}).replace(/</g, "\\u003c");

/** The marketing page. Building starts on /new. */
export default function Home() {
  return (
    <div className="grid-paper isolate flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
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
