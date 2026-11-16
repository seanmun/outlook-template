/**
 * Ready-made example emails for the home page. Each is built from the same
 * blocks and operations the editor uses, for a fictional sample brand, so
 * what visitors see is exactly what the app produces. All copy is invented.
 */
import { allModules, type EmailDocument } from "./document";
import { applyOperations, type Operation } from "./operations";
import { getSampleImage, SAMPLE_HERO_BY_BRAND } from "./samples";
import { newEmailDocument } from "./starter";

export interface EmailExample {
  id: string;
  name: string;
  blurb: string;
  brandId: string;
  build: () => EmailDocument;
}

type Extra = { ref?: string; parentId?: string; column?: number };
const add = (moduleType: string, content: Record<string, unknown> | null = null, settings: Record<string, unknown> | null = null, extra: Extra = {}): Operation => ({
  op: "add_module",
  moduleType,
  index: null,
  ref: extra.ref ?? null,
  content,
  settings,
  parentId: extra.parentId,
  column: extra.column,
});

/**
 * `pictures` names a bundled picture for each image block, in the order the blocks appear.
 * Without it, every image block gets the brand's sample banner.
 */
function build(brandId: string, title: string, subject: string, ops: Operation[], pictures?: string[]): EmailDocument {
  const applied = applyOperations({ ...newEmailDocument(brandId, title), subject, modules: [] }, ops);
  if (!applied.ok) throw new Error(`Example "${title}" is invalid: ${applied.errors.map((e) => e.message).join("; ")}`);
  // Image blocks use the brand's bundled sample picture, since examples cannot carry uploads.
  const brandSample = getSampleImage(SAMPLE_HERO_BY_BRAND[brandId] ?? "");
  let n = 0;
  for (const m of allModules(applied.doc)) {
    if (m.type !== "hero") continue;
    const sample = pictures ? getSampleImage(pictures[n++] ?? "") : brandSample;
    if (!sample) {
      if (pictures) throw new Error(`Example "${title}" has an image block without a bundled picture.`);
      continue;
    }
    const image = m.content.image as Record<string, unknown>;
    m.content = { ...m.content, image: { ...image, src: { kind: "sample", sampleId: sample.id }, naturalWidth: sample.width, naturalHeight: sample.height } };
  }
  return applied.doc;
}

/* ----- Pieces the report templates share ----- */

const SIDE = { right: 40, left: 40 };

/** A row of three number tiles: a big figure with a short label under it, on a tinted background. */
function tiles(ref: string, tint: string, items: readonly (readonly [value: string, label: string])[]): Operation[] {
  return [
    add("columns", null, { layout: "1-1-1", gap: 12, padding: { top: 6, bottom: 6, ...SIDE } }, { ref }),
    ...items.map(([value, label], column) =>
      add("text", { headline: value, body: label }, { align: "center", backgroundColor: tint, headlineSize: 26, bodySize: 13, headlineGap: 4, padding: { top: 16, right: 8, bottom: 16, left: 8 } }, { parentId: ref, column }),
    ),
  ];
}

/** A left-aligned section: a small heading with copy under it. */
const section = (headline: string, body: string): Operation => add("text", { headline, body }, { align: "left", headlineSize: 20, headlineGap: 8, padding: { top: 18, bottom: 10, ...SIDE } });

/** Two sections side by side. */
function sideBySide(ref: string, left: readonly [string, string], right: readonly [string, string]): Operation[] {
  return [
    add("columns", null, { layout: "1-1", padding: { top: 18, bottom: 10, ...SIDE } }, { ref }),
    ...[left, right].map(([headline, body], column) =>
      add("text", { headline, body }, { align: "left", headlineSize: 20, headlineGap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 } }, { parentId: ref, column }),
    ),
  ];
}

export const EXAMPLES: EmailExample[] = [
  {
    // For the day the email system itself was the news. Like every example, the details are invented
    // sample copy for the sender to replace with what actually happened at their company.
    id: "outage-update",
    name: "Outage update",
    blurb: "Email is back: what happened, what to do.",
    brandId: "plain",
    build: () =>
      build("plain", "Example: outage update", "Email is working again: what happened on November 12", [
        add("header"),
        add("hero", { image: { alt: "An envelope with a green tick: email is working again" } }),
        add(
          "text",
          {
            headline: "Email is working again",
            body: "Outlook was down for a lot of organisations on Thursday, November 12, ours included. It is back now.\n\n**What happened:** Our email provider had a widespread outage. For us, email was unavailable from about 9:00 until 13:30.",
          },
          { align: "left" },
        ),
        add("text", { headline: "What to do now", body: "" }, { align: "left", headlineSize: 20, padding: { top: 8, right: 40, bottom: 0, left: 40 } }),
        add("columns", null, { layout: "1-1-1" }, { ref: "steps" }),
        ...(
          [
            ["Restart Outlook", "If it still looks stuck, close it and open it again.", "Restart icon"],
            ["Check your Outbox", "Anything waiting there will send on its own.", "Outbox icon"],
            ["Resend if unsure", "Send urgent messages again if you can\u2019t tell they went out.", "Send icon"],
          ] as const
        ).flatMap(([title, body, alt], column) => [
          add("hero", { image: { alt, width: 72 } }, { padding: { top: 0, right: 0, bottom: 8, left: 0 } }, { parentId: "steps", column }),
          add("text", { headline: title, body }, { align: "center", headlineSize: 16, padding: { top: 0, right: 0, bottom: 0, left: 0 } }, { parentId: "steps", column }),
        ]),
        add("text", { headline: "", body: "Still having trouble? Contact the service desk." }, { align: "left" }),
        // Microsoft's public service health page for Microsoft 365, which covers Outlook.
        add("cta", { label: "Check service status", url: "https://status.cloud.microsoft/m365" }, { align: "left" }),
        add("divider"),
        add("footer", { body: "Your company · IT Service Desk\n\nCall the service desk or reply to this email." }),
      ], ["outage-banner", "outage-step-restart", "outage-step-outbox", "outage-step-resend"]),
  },
  {
    id: "town-hall",
    name: "Event invite",
    blurb: "Banner, short pitch, one clear button.",
    brandId: "harbor-pine",
    build: () =>
      build("harbor-pine", "Example: town hall invite", "You're invited: spring town hall", [
        add("header"),
        add("hero", { image: { alt: "Abstract navy and green banner" } }),
        add("text", {
          headline: "Spring town hall",
          body: "Join us for an hour of updates, a look at what's next, and open questions with the leadership team.\n\n**Thursday 14 May, 10:00** in the Atrium, or on the usual video link.",
        }),
        add("cta", { label: "Save my seat" }),
        add("divider"),
        add("social", { networks: "linkedin, instagram, youtube" }),
        add("footer", { body: "Harbor & Pine · Internal communication\n\nSent by the People team. Questions? Reply to this email." }),
      ]),
  },
  {
    id: "newsletter",
    name: "Team newsletter",
    blurb: "Two-column stories under a headline.",
    brandId: "lumen-labs",
    build: () =>
      build("lumen-labs", "Example: team newsletter", "The Lumen Letter: what shipped in April", [
        add("header"),
        add("text", { headline: "The Lumen Letter", body: "Three things worth two minutes of your day: what shipped, what's coming, and who to thank." }),
        add("hero", { image: { alt: "Abstract violet banner" } }),
        add("columns", null, { layout: "1-1" }, { ref: "stories" }),
        add("text", { headline: "Shipped", body: "The new onboarding flow is live for every account.\n\n- Setup time cut in half\n- Fewer support tickets in week one" }, { align: "left", headlineSize: 20 }, { parentId: "stories", column: 0 }),
        add("cta", { label: "See the numbers" }, { align: "left" }, { parentId: "stories", column: 0 }),
        add("text", { headline: "Coming up", body: "Design reviews move to Tuesdays from next month, and the roadmap session is open to everyone.\n\n*Bring one question.*" }, { align: "left", headlineSize: 20 }, { parentId: "stories", column: 1 }),
        add("cta", { label: "Add to calendar" }, { align: "left" }, { parentId: "stories", column: 1 }),
        add("divider"),
        add("columns", null, { layout: "1-2", valign: "middle" }, { ref: "kudos" }),
        add("hero", { image: { alt: "Abstract violet tile" } }, null, { parentId: "kudos", column: 0 }),
        add("text", { headline: "Kudos", body: "Thanks to the platform crew for a quiet, uneventful migration weekend. The best kind." }, { align: "left", headlineSize: 20 }, { parentId: "kudos", column: 1 }),
        add("footer", { body: "LUMEN LABS · Internal newsletter\n\nYou get this because you work here. Lucky you." }),
      ]),
  },
  {
    id: "maintenance",
    name: "Service notice",
    blurb: "Plain, direct, impossible to misread.",
    brandId: "copperfield",
    build: () =>
      build("copperfield", "Example: maintenance notice", "Scheduled maintenance this Saturday", [
        add("header"),
        add("text", {
          headline: "Scheduled maintenance",
          body: "We're upgrading the booking system this weekend. It will be unavailable **Saturday from 07:00 to 09:00**.\n\nWhat this means for you:\n\n- Finish and save open bookings by Friday evening\n- Reports will be a few hours behind on Saturday\n- Nothing is needed from you afterwards\n\nThanks for bearing with us. It'll be faster when it's back.",
        }, { align: "left" }),
        add("cta", { label: "Check system status" }, { align: "left" }),
        add("divider"),
        add("footer", { body: "Copperfield Group · IT Operations\n\nFor urgent issues during the window, call the service desk." }),
      ]),
  },
  {
    // The four reports below are number-first: tiles for the headline figures, then what they mean.
    // Every figure is invented, and adds up, so the sender can see where their own numbers go.
    id: "campaign-results",
    name: "Email campaign results",
    blurb: "Opens, clicks and what to do next.",
    brandId: "lumen-labs",
    build: () =>
      build("lumen-labs", "Example: email campaign results", "Campaign results: spring launch email", [
        add("header"),
        add("text", {
          headline: "Spring launch email: results",
          body: "Sent **Tuesday 14 April** to 48,200 subscribers. The short version: opens beat our average, and one button did most of the work.",
        }, { align: "left", padding: { top: 28, bottom: 14, ...SIDE } }),
        ...tiles("rates", "#e9e4fb", [["46.2%", "Open rate"], ["5.8%", "Click rate"], ["0.12%", "Unsubscribed"]]),
        ...tiles("totals", "#f5f3fb", [["47,640", "Delivered"], ["2,763", "Clicks"], ["$38,400", "Sales from the email"]]),
        section("Compared with our average", "- Open rate: **46.2%**, up from 42.1%\n- Click rate: **5.8%**, up from 4.4%\n- Unsubscribed: **0.12%**, about the same"),
        section("Where people clicked", "- **See the new dashboard** (main button): 1,548 clicks\n- **Watch the 2-minute tour**: 829 clicks\n- **Pricing page**: 386 clicks"),
        ...sideBySide("lessons", ["What worked", "- A subject line that named the new feature\n- One main button near the top\n- Sending on a Tuesday morning"], ["Next time", "- Move the video above the fold\n- Test a shorter subject line\n- Send a follow-up to people who did not open"]),
        add("cta", { label: "Open the full report" }, { align: "left" }),
        add("divider"),
        add("footer", { body: "LUMEN LABS · Marketing\n\nQuestions about these numbers? Reply to this email." }),
      ]),
  },
  {
    id: "website-report",
    name: "Website report",
    blurb: "Visits, sources and top pages for the month.",
    brandId: "harbor-pine",
    build: () =>
      build("harbor-pine", "Example: website report", "Website report: October", [
        add("header"),
        add("text", {
          headline: "Website report: October",
          body: "Visits were up **9%** on September, mostly from search. Enquiries rose with them, and the new pricing page is already the third most-read page.",
        }, { align: "left", padding: { top: 28, bottom: 14, ...SIDE } }),
        ...tiles("traffic", "#eef2f5", [["84,300", "Visits"], ["61,900", "Visitors"], ["1,264", "Enquiries"]]),
        ...tiles("quality", "#f4efe6", [["1.5%", "Visits that became enquiries"], ["2m 14s", "Average time on site"], ["41%", "Left after one page"]]),
        ...sideBySide("breakdown", ["Where visits came from", "- Search: **46%**\n- Direct: **22%**\n- Email: **14%**\n- Social: **11%**\n- Other sites: **7%**"], ["Most-read pages", "- Home: 21,400\n- Services: 12,850\n- Pricing: 9,300\n- Contact: 6,120\n- Blog, \u201cFive questions to ask\u201d: 4,900"]),
        section("What changed", "- **Up:** search visits, after the services pages were rewritten\n- **Up:** enquiries from phones, after the form was shortened\n- **Down:** visits from social, with fewer posts in the first half of the month"),
        section("Plan for November", "- Publish two new case studies\n- Speed up the home page on phones\n- Add a short enquiry form to the pricing page"),
        add("cta", { label: "Open the dashboard" }, { align: "left" }),
        add("divider"),
        add("footer", { body: "Harbor & Pine · Digital team\n\nNumbers cover 1 to 31 October. Questions? Reply to this email." }),
      ]),
  },
  {
    id: "social-report",
    name: "Social media report",
    blurb: "Followers, reach and results by channel.",
    brandId: "copperfield",
    build: () =>
      build("copperfield", "Example: social media report", "Social media report: October", [
        add("header"),
        add("text", {
          headline: "Social media report: October",
          body: "We gained **1,120 followers** across three channels and reached more people than in any month this year. LinkedIn did the most, helped by one post about the new office.",
        }, { align: "left", padding: { top: 28, bottom: 14, ...SIDE } }),
        ...tiles("totals", "#f3f1ee", [["28,940", "Followers"], ["412k", "People reached"], ["4.6%", "Engagement rate"]]),
        section("By channel", ""),
        ...tiles("channels", "#f3f1ee", [["LinkedIn", "12,480 followers\n\n+540 this month\n\n5.2% engagement"], ["Instagram", "11,260 followers\n\n+430 this month\n\n4.4% engagement"], ["YouTube", "5,200 subscribers\n\n+150 this month\n\n3.1% engagement"]]),
        section("Best post of the month", "**\u201cA first look inside the new office\u201d** on LinkedIn, 8 October.\n\n- 64,200 people reached\n- 1,930 reactions and 214 comments\n- 386 clicks through to the careers page"),
        ...sideBySide("lessons", ["What worked", "- Photos of real people and places\n- Posting before 9:00\n- Replying to comments the same day"], ["What we will try", "- One short video a week\n- A monthly question to followers\n- Fewer link-only posts"]),
        add("cta", { label: "See every post" }, { align: "left" }),
        add("divider"),
        add("social", { networks: "linkedin, instagram, youtube" }),
        add("footer", { body: "Copperfield Group · Communications\n\nNumbers cover 1 to 31 October." }),
      ]),
  },
  {
    // Written the way an agency reports to a client: the money first, then anything that needs a decision.
    id: "budget-report",
    name: "Agency budget report",
    blurb: "Budget, spend and what is left, for a client.",
    brandId: "plain",
    build: () =>
      build("plain", "Example: agency budget report", "Budget report: October", [
        add("header"),
        add("text", {
          headline: "Budget report: October",
          body: "**Client:** Client name\n\n**Project:** Autumn campaign\n\nWe are on budget. **66%** of the money is spent with **67%** of the schedule behind us, and nothing is expected to run over.",
        }, { align: "left", padding: { top: 28, bottom: 14, ...SIDE } }),
        ...tiles("money", "#f4f4f5", [["$120,000", "Approved budget"], ["$78,600", "Spent so far"], ["$41,400", "Left to spend"]]),
        section("Spend by area", "- **Strategy and planning:** $18,000 of $20,000\n- **Creative and production:** $31,400 of $45,000\n- **Paid media:** $24,200 of $40,000\n- **Account management and reporting:** $5,000 of $15,000"),
        ...sideBySide("month", ["This month", "- Spent in October: $26,300\n- Hours used: 164\n- Invoice sent: 31 October"], ["Still to come", "- November: about $24,000\n- December: about $17,400\n- Hours left: 228 of 640"]),
        section("Things to watch", "- Creative stays on budget only if the next round of changes is the last one\n- Paid media costs usually rise in the last two weeks of November"),
        section("Decisions we need from you", "- Approve moving $5,000 from paid media to production, for the extra video cut\n- Confirm the final sign-off date by **14 November**"),
        add("cta", { label: "View the full breakdown" }, { align: "left" }),
        add("divider"),
        add("footer", { body: "Your agency · Client services\n\nQuestions about this report? Reply to this email or call your account manager." }),
      ]),
  },
];
