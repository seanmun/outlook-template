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

function build(brandId: string, title: string, subject: string, ops: Operation[]): EmailDocument {
  const applied = applyOperations({ ...newEmailDocument(brandId, title), subject, modules: [] }, ops);
  if (!applied.ok) throw new Error(`Example "${title}" is invalid: ${applied.errors.map((e) => e.message).join("; ")}`);
  // Image blocks use the brand's bundled sample picture, since examples cannot carry uploads.
  const sample = getSampleImage(SAMPLE_HERO_BY_BRAND[brandId] ?? "");
  if (sample) {
    for (const m of allModules(applied.doc)) {
      if (m.type !== "hero") continue;
      const image = m.content.image as Record<string, unknown>;
      m.content = { ...m.content, image: { ...image, src: { kind: "sample", sampleId: sample.id }, naturalWidth: sample.width, naturalHeight: sample.height } };
    }
  }
  return applied.doc;
}

export const EXAMPLES: EmailExample[] = [
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
];
