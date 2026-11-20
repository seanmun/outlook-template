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
  {
    slug: "email-campaign-results",
    exampleId: "campaign-results",
    name: "Email campaign results",
    heading: "Email campaign results report template for Outlook",
    description: "A free Outlook email template for reporting how an email campaign did: open rate, click rate and sales in big number tiles, how that compares with your average, where people clicked, and what to do next time.",
    goodFor: ["Results after a newsletter or product launch email", "Weekly or monthly email marketing updates", "Reporting to a manager or client who will not open a dashboard", "Sharing what a subject line test showed"],
    contains: ["Logo header", "Headline and a two-line summary", "Six number tiles: open rate, click rate, unsubscribes, delivered, clicks and sales", "A comparison with your average", "A list of the links people clicked most", "Two columns: what worked and what to change", "One button to the full report", "Footer"],
    tips: ["Open with one sentence that says whether it went well. The numbers back it up.", "Always show the number next to your usual one. 46% means nothing on its own.", "End with what you will do differently, so the report leads somewhere."],
  },
  {
    slug: "website-report",
    exampleId: "website-report",
    name: "Website report",
    heading: "Website traffic report email template for Outlook",
    description: "A free Outlook email template for a monthly website report: visits, visitors and enquiries in number tiles, where visits came from, the most-read pages, what changed, and the plan for next month.",
    goodFor: ["Monthly website and analytics reports", "Updates to leadership or a client", "Results after a redesign or a new page", "Search and content reporting"],
    contains: ["Logo header", "Headline and a short summary of the month", "Six number tiles, from visits to how many people left after one page", "Two columns: where visits came from and the most-read pages", "What went up and what went down", "The plan for next month", "One button to the dashboard", "Footer with the dates covered"],
    tips: ["Pick six numbers and keep the same six every month, so people can compare.", "Say why a number moved. That is the part readers cannot get from a dashboard.", "State the dates the report covers in the footer."],
  },
  {
    slug: "social-media-report",
    exampleId: "social-report",
    name: "Social media report",
    heading: "Social media report email template for Outlook",
    description: "A free Outlook email template for a monthly social media report: followers, reach and engagement in number tiles, results for each channel side by side, the best post of the month, and what to try next.",
    goodFor: ["Monthly social media reports", "Campaign wrap-ups", "Reports from an agency or freelancer to a client", "Updates to the wider communications team"],
    contains: ["Logo header", "Headline and a short summary", "Three number tiles: followers, people reached and engagement rate", "Three tiles side by side, one for each channel", "The best post of the month with its numbers", "Two columns: what worked and what to try", "One button, social links and a footer"],
    tips: ["Report each channel separately. A total hides which one is doing the work.", "Show one real post. It explains the numbers better than a paragraph.", "Keep the channel tiles to three lines each; the columns are a fixed width in Outlook."],
  },
  {
    slug: "agency-budget-report",
    exampleId: "budget-report",
    name: "Agency budget report",
    heading: "Agency budget report email template for Outlook",
    description: "A free Outlook email template for an agency reporting a project budget to a client: approved budget, spend so far and what is left in number tiles, spend by area, what is still to come, and the decisions you need.",
    goodFor: ["Monthly budget reports from an agency to a client", "Project spend updates for a retainer", "Internal reports to finance or an account director", "End-of-project budget summaries"],
    contains: ["Company name header", "Client and project names with a one-line verdict", "Three number tiles: approved budget, spent so far, left to spend", "Spend against budget for each area of work", "Two columns: this month and what is still to come", "Things to watch", "Decisions needed from the client, with a date", "One button and a footer"],
    tips: ["Say \u201con budget\u201d or \u201cover budget\u201d in the first line. Clients look for that before anything else.", "Compare money spent with time gone, so the pace is clear.", "Put every decision you need in one list with a date next to it."],
  },
];

export function templatePage(slug: string): (TemplatePage & { example: EmailExample }) | null {
  const page = TEMPLATE_PAGES.find((t) => t.slug === slug);
  const example = page && EXAMPLES.find((e) => e.id === page.exampleId);
  return page && example ? { ...page, example } : null;
}
