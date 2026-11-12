import { EXAMPLES, type EmailExample } from "@/lib/email/examples";

/** The public page for one example email: its address and the words that describe it. */
export interface TemplatePage {
  slug: string;
  exampleId: string;
  /** Page heading, e.g. "Event invitation email template for Outlook". */
  heading: string;
  /** Short name for lists and links. */
  name: string;
  description: string;
  goodFor: string[];
  contains: string[];
  tips: string[];
}

export const TEMPLATE_PAGES: TemplatePage[] = [
  {
    slug: "event-invitation",
    exampleId: "town-hall",
    name: "Event invitation",
    heading: "Event invitation email template for Outlook",
    description: "A free Outlook email template for inviting colleagues to a town hall, all-hands, training session or team event: banner picture, short pitch, date and place, and one clear button.",
    goodFor: ["Town halls and all-hands meetings", "Training sessions and lunch-and-learns", "Team socials and offsites", "Webinars for colleagues"],
    contains: ["Logo header", "Banner picture", "Headline with a short paragraph and the date in bold", "One button, for example “Save my seat”", "Divider and social links", "Footer saying who sent it"],
    tips: ["Put the date, time and place in the first few lines; many people read no further.", "Use one button. An invitation with two choices gets fewer replies.", "Say who to contact with questions in the footer."],
  },
  {
    slug: "internal-newsletter",
    exampleId: "newsletter",
    name: "Internal newsletter",
    heading: "Internal newsletter email template for Outlook",
    description: "A free Outlook email template for a company or team newsletter: a headline, a banner, two stories side by side with their own buttons, and a thank-you section.",
    goodFor: ["Monthly company newsletters", "Team and department updates", "Product or project round-ups", "Leadership notes"],
    contains: ["Logo header", "Headline and one-line introduction", "Banner picture", "Two columns, each with a story and a button", "A picture-and-text row for shout-outs", "Footer"],
    tips: ["Keep each story to a few lines and link out for the rest.", "Lead with what changes for the reader, not with what the team did.", "Two columns are fixed-width in Outlook, so keep headings short enough to fit."],
  },
  {
    slug: "service-notice",
    exampleId: "maintenance",
    name: "Service notice",
    heading: "Maintenance and service notice email template for Outlook",
    description: "A free Outlook email template for IT and operations notices: scheduled maintenance, outages, system changes. Plain layout, the time window in bold, and a short list of what people need to do.",
    goodFor: ["Scheduled maintenance windows", "Outage and incident updates", "System or policy changes", "Office and facilities notices"],
    contains: ["Logo header", "Headline and a left-aligned message with the time window in bold", "A short bullet list of what it means for the reader", "One button, for example “Check system status”", "Footer with who to call"],
    tips: ["State what is affected and exactly when in the first sentence.", "List what people must do before, during and after. If nothing, say so.", "Give a way to get help that still works during the outage."],
  },
];

export function templatePage(slug: string): (TemplatePage & { example: EmailExample }) | null {
  const page = TEMPLATE_PAGES.find((t) => t.slug === slug);
  const example = page && EXAMPLES.find((e) => e.id === page.exampleId);
  return page && example ? { ...page, example } : null;
}
