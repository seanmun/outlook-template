/** What the support form offers and allows. Shared by the form and the server so they cannot drift apart. */
export const SUPPORT_CATEGORIES = ["bug", "outlook", "account", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  bug: "Something is broken",
  outlook: "Problem in Outlook",
  account: "Account or sign-in",
  other: "Something else",
};

/** Telegram takes at most 4096 characters in one message; this leaves room for the lines around it. */
export const MAX_SUPPORT_MESSAGE = 3000;
export const MAX_SUPPORT_SCREENSHOTS = 3;
/** Per picture, after decoding. The form shrinks pictures to well under this before sending. */
export const MAX_SUPPORT_SCREENSHOT_BYTES = 2 * 1024 * 1024;
