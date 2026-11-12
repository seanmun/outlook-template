import type { Metadata } from "next";

export const SITE_NAME = "OUTLOOKSUCKS.email";
export const SITE_TITLE = "OUTLOOKSUCKS.email: free Outlook email template builder";
export const SITE_DESCRIPTION =
  "Stop sending boring internal emails. Build one by dragging blocks, then download an .oft template that opens in Outlook. Free, no account needed.";

/** The share image every page uses (src/app/opengraph-image.png). */
const SHARE_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "OUTLOOKSUCKS.email: stop sending boring internal emails." };

/**
 * Metadata for one page. A page that sets its own `openGraph` replaces the layout's whole
 * `openGraph` object, image included, so every page builds the full set here instead.
 * `shareTitle` is for a longer, keyword-carrying title in share cards and search results.
 */
export function pageMetadata(page: { title?: string; shareTitle?: string; description: string; path: string; type?: "website" | "article"; index?: boolean }): Metadata {
  const shareTitle = page.shareTitle ?? (page.title ? `${page.title} | ${SITE_NAME}` : SITE_TITLE);
  return {
    ...(page.title ? { title: page.title } : {}),
    description: page.description,
    alternates: { canonical: page.path },
    ...(page.index === false ? { robots: { index: false, follow: false } } : {}),
    openGraph: { type: page.type ?? "website", siteName: SITE_NAME, url: page.path, title: shareTitle, description: page.description, images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title: shareTitle, description: page.description, images: [SHARE_IMAGE.url] },
  };
}
