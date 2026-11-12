import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { GUIDES } from "@/lib/marketing/guides";
import { TEMPLATE_PAGES } from "@/lib/marketing/template-pages";

/** Bump when the public pages change in a way worth re-crawling. */
const UPDATED = "2026-11-12";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, lastModified: UPDATED, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/new`, lastModified: UPDATED, changeFrequency: "weekly", priority: 0.8 },
    ...GUIDES.map((g) => ({ url: `${SITE_URL}${g.href}`, lastModified: UPDATED, changeFrequency: "monthly" as const, priority: 0.9 })),
    ...TEMPLATE_PAGES.map((t) => ({ url: `${SITE_URL}/templates/${t.slug}`, lastModified: UPDATED, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
