/** The public address of the site, used for share previews, robots.txt and the sitemap. */
export const SITE_URL = "https://www.outlooksucks.email";

/**
 * True for an address where accounts cannot work, so sign-in is not offered at all there.
 * Sign-in is tied to outlooksucks.email; on the project's vercel.app address (the backup for people
 * whose company blocks the main domain) it could only fail. Everything else works there, with
 * drafts and images saved in the browser.
 */
export function isAccountFreeHost(host: string | null | undefined): boolean {
  const name = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  return name.endsWith(".vercel.app");
}
