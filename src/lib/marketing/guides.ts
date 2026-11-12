/**
 * The guides, in one place so the /guides page, footer, sitemap, llms.txt and "related" links stay in step.
 * To add one: create src/app/guides/<slug>/page.tsx and add it here.
 */
export interface Guide {
  href: string;
  title: string;
  blurb: string;
}

export const GUIDES: Guide[] = [
  { href: "/guides/outlook-email-template", title: "How to create an Outlook email template", blurb: "Step by step for classic Outlook, new Outlook and Outlook for Mac." },
  { href: "/guides/outlook-rendering", title: "Outlook rendering facts", blurb: "Template files, rendering engines, and the 200 things Outlook ignores." },
  { href: "/guides/outlook-rounded-buttons", title: "Rounded buttons in Outlook", blurb: "Why they come out square, and the three ways around it." },
  { href: "/guides/oft-vs-msg-vs-emltpl", title: ".oft vs .msg vs .emltpl", blurb: "Which Outlook file is which, and what opens it." },
];

/** Not a guide, but worth pointing to from them. */
export const TEMPLATES_LINK: Guide = { href: "/templates", title: "Outlook email templates", blurb: "Free starting points for invites, newsletters and notices." };
