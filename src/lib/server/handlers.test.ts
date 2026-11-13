import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { sampleEmailDocument } from "@/lib/email/starter";
import { sampleBytes } from "@/lib/email/samples";
import type { EmailDocument } from "@/lib/email/document";
import { createSavedModule, deleteSavedModule, listSavedModules } from "./handlers";
import { PERSONAL_LIMITS, TEAM_LIMITS } from "@/lib/limits";
import { createTemplate, deleteTemplate, listTemplates, restoreDefaultTemplates } from "./handlers";
import { DEFAULT_TEMPLATE_IDS, defaultTemplates, emailFromTemplate, visibleTemplates } from "@/lib/email/templates";
import { validateDocument } from "@/lib/email/registry";
import { newEmailDocument } from "@/lib/email/starter";
import { createEmail, deleteEmail, exportForDemo, exportForUser, getEmail, listAssets, listEmails, readAsset, updateEmail, uploadAsset, type HandlerContext } from "./handlers";
import { MemoryAssetRepo, MemoryEmailRepo, MemoryPresenceRepo, MemorySavedModuleRepo, MemoryTemplateRepo } from "./memory-repo";
import { leavePresence, touchPresence } from "./handlers";
import { PRESENCE_WINDOW_MS } from "./repo";

function setup() {
  const emails = new MemoryEmailRepo();
  const assets = new MemoryAssetRepo();
  const savedModules = new MemorySavedModuleRepo();
  const templates = new MemoryTemplateRepo();
  /** A request from this person, in their own Library or (with `team`) in a team space. */
  const presence = new MemoryPresenceRepo();
  const as = (userId: string | null, team: string | null = null): HandlerContext => ({ userId, workspaceId: team, emails, assets, savedModules, templates, presence });
  return { emails, assets, presence, as };
}

const png = () => sampleBytes("hero-harbor")!;

function withAsset(doc: EmailDocument, assetId: string): EmailDocument {
  const hero = doc.modules.find((m) => m.type === "hero")!;
  (hero.content.image as { src: unknown }).src = { kind: "asset", assetId };
  return doc;
}

async function uploadFor(ctx: HandlerContext) {
  const res = await uploadAsset(ctx, { data: png(), name: "hero.png" });
  expect(res.status).toBe(201);
  return ((await res.json()) as { asset: { id: string } }).asset.id;
}

describe("authorization", () => {
  it("rejects every operation without a signed-in user", async () => {
    const { as } = setup();
    const anon = as(null);
    const id = crypto.randomUUID();
    const responses = await Promise.all([
      listEmails(anon),
      createEmail(anon, { document: sampleEmailDocument("harbor-pine") }),
      getEmail(anon, id),
      updateEmail(anon, id, { document: sampleEmailDocument("harbor-pine"), revision: 1 }),
      deleteEmail(anon, id),
      uploadAsset(anon, { data: png(), name: "x.png" }),
      readAsset(anon, id),
      listAssets(anon),
      exportForUser(anon, { document: sampleEmailDocument("harbor-pine"), formats: ["oft"] }),
    ]);
    for (const r of responses) expect(r.status).toBe(401);
  });

  it("hides another user's emails (404, not 403) for read, update and delete", async () => {
    const { as } = setup();
    const created = await createEmail(as("alice"), { document: sampleEmailDocument("harbor-pine") });
    const { email } = (await created.json()) as { email: { id: string } };
    expect((await getEmail(as("bob"), email.id)).status).toBe(404);
    expect((await updateEmail(as("bob"), email.id, { document: sampleEmailDocument("harbor-pine"), revision: 1 })).status).toBe(404);
    expect((await deleteEmail(as("bob"), email.id)).status).toBe(404);
    expect(((await (await listEmails(as("bob"))).json()) as { emails: unknown[] }).emails).toHaveLength(0);
    expect((await getEmail(as("alice"), email.id)).status).toBe(200);
  });

  it("prevents reading another user's asset", async () => {
    const { as } = setup();
    const id = await uploadFor(as("alice"));
    expect((await readAsset(as("bob"), id)).status).toBe(404);
    expect((await readAsset(as("alice"), id)).status).toBe(200);
  });

  it("lists only the signed-in user's images", async () => {
    const { as } = setup();
    const id = await uploadFor(as("alice"));
    const mine = (await (await listAssets(as("alice"))).json()) as { assets: { id: string; width: number }[] };
    expect(mine.assets.map((a) => a.id)).toEqual([id]);
    expect(mine.assets[0].width).toBeGreaterThan(0);
    expect(((await (await listAssets(as("bob"))).json()) as { assets: unknown[] }).assets).toHaveLength(0);
  });

  it("refuses to save or export a document that references someone else's asset", async () => {
    const { as } = setup();
    const aliceAsset = await uploadFor(as("alice"));
    const doc = withAsset(sampleEmailDocument("harbor-pine"), aliceAsset);
    const save = await createEmail(as("bob"), { document: doc });
    expect(save.status).toBe(400);
    expect(((await save.json()) as { error: string }).error).toMatch(/not in this Library/);
    expect((await exportForUser(as("bob"), { document: doc, formats: ["oft"] })).status).toBe(400);
    // the owner can
    const ok = await exportForUser(as("alice"), { document: doc, formats: ["oft"] });
    expect(ok.status).toBe(200);
    const zip = await JSZip.loadAsync(new Uint8Array(await ok.arrayBuffer()));
    expect(Object.keys(zip.files).some((n) => n.endsWith(".oft"))).toBe(true);
  });

  it("detects concurrent saves with revisions", async () => {
    const { as } = setup();
    const ctx = as("alice");
    const { email } = (await (await createEmail(ctx, { document: sampleEmailDocument("harbor-pine") })).json()) as { email: { id: string } };
    expect((await updateEmail(ctx, email.id, { document: sampleEmailDocument("harbor-pine"), revision: 1 })).status).toBe(200);
    expect((await updateEmail(ctx, email.id, { document: sampleEmailDocument("harbor-pine"), revision: 1 })).status).toBe(409);
  });

  it("rejects invalid documents and malformed ids", async () => {
    const { as } = setup();
    const bad = sampleEmailDocument("harbor-pine");
    bad.modules[0].type = "iframe";
    expect((await createEmail(as("alice"), { document: bad })).status).toBe(400);
    expect((await getEmail(as("alice"), "../../etc")).status).toBe(404);
  });
});

describe("uploads", () => {
  it("rejects non-images and oversized files regardless of filename", async () => {
    const { as } = setup();
    const ctx = as("alice");
    expect((await uploadAsset(ctx, { data: new TextEncoder().encode("<svg onload=alert(1)>"), name: "x.png" })).status).toBe(415);
    expect((await uploadAsset(ctx, { data: new Uint8Array(6 * 1024 * 1024), name: "big.png" })).status).toBe(413);
  });
});

describe("export endpoint failures", () => {
  it("returns 422 with a reason for a disabled exporter", async () => {
    process.env.EXPORT_EMLTPL = "off";
    try {
      const r = await exportForDemo({ document: sampleEmailDocument("harbor-pine"), formats: ["emltpl"] });
      expect(r.status).toBe(422);
      expect(((await r.json()) as { error: string }).error).toMatch(/emltpl/);
    } finally {
      delete process.env.EXPORT_EMLTPL;
    }
  });

  it("returns 422 when a demo image is missing", async () => {
    const doc = withAsset(sampleEmailDocument("harbor-pine"), "local_abcdef12");
    const r = await exportForDemo({ document: doc, formats: ["oft"], localImages: {} });
    expect(r.status).toBe(422);
  });

  it("rejects unknown formats", async () => {
    const r = await exportForDemo({ document: sampleEmailDocument("harbor-pine"), formats: ["docx"] });
    expect(r.status).toBe(400);
  });
});

describe("saved modules", () => {
  const block = () => sampleEmailDocument("harbor-pine").modules.find((m) => m.type === "text")!;
  const body = (over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), name: "Intro block", brandId: "harbor-pine", module: block(), ...over });
  const listFor = async (ctx: HandlerContext) => ((await (await listSavedModules(ctx)).json()) as { savedModules: { id: string; name: string; savedAt: string; module: { type: string } }[] }).savedModules;

  it("needs a signed-in user", async () => {
    const { as } = setup();
    expect((await listSavedModules(as(null))).status).toBe(401);
    expect((await createSavedModule(as(null), body())).status).toBe(401);
    expect((await deleteSavedModule(as(null), crypto.randomUUID())).status).toBe(401);
  });

  it("saves, lists and deletes for the owner only", async () => {
    const { as } = setup();
    const item = body();
    expect((await createSavedModule(as("alice"), item)).status).toBe(201);
    const mine = await listFor(as("alice"));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: item.id, name: "Intro block", module: { type: "text" } });
    expect(mine[0].savedAt).toBeTruthy();
    expect(await listFor(as("bob"))).toHaveLength(0);
    expect((await deleteSavedModule(as("bob"), item.id)).status).toBe(404);
    expect((await deleteSavedModule(as("alice"), item.id)).status).toBe(200);
    expect(await listFor(as("alice"))).toHaveLength(0);
  });

  it("accepts the same id twice from its owner and refuses it from anyone else", async () => {
    const { as } = setup();
    const item = body();
    expect((await createSavedModule(as("alice"), item)).status).toBe(201);
    expect((await createSavedModule(as("alice"), item)).status).toBe(201);
    expect(await listFor(as("alice"))).toHaveLength(1);
    expect((await createSavedModule(as("bob"), item)).status).toBe(409);
  });

  it("rejects malformed modules, bad ids and images that are not the user's", async () => {
    const { as } = setup();
    expect((await createSavedModule(as("alice"), body({ id: "nope" }))).status).toBe(400);
    expect((await createSavedModule(as("alice"), body({ name: "" }))).status).toBe(400);
    expect((await createSavedModule(as("alice"), body({ module: { type: "text" } }))).status).toBe(400);
    expect((await createSavedModule(as("alice"), body({ module: { ...block(), type: "no-such-module" } }))).status).toBe(400);
    const bobsImage = await uploadFor(as("bob"));
    const hero = withAsset(sampleEmailDocument("harbor-pine"), bobsImage).modules.find((m) => m.type === "hero")!;
    expect((await createSavedModule(as("alice"), body({ module: hero }))).status).toBe(400);
    expect((await createSavedModule(as("bob"), body({ module: hero }))).status).toBe(201);
  });

  it("saves a whole row of columns", async () => {
    const { as } = setup();
    const { EXAMPLES } = await import("@/lib/email/examples");
    const row = EXAMPLES.find((e) => e.id === "newsletter")!.build().modules.find((m) => m.type === "columns")!;
    expect((await createSavedModule(as("alice"), body({ brandId: "lumen-labs", module: row }))).status).toBe(201);
  });

  it("stops at the limit", async () => {
    const { as } = setup();
    for (let i = 0; i < PERSONAL_LIMITS.savedBlocks; i++) expect((await createSavedModule(as("alice"), body())).status).toBe(201);
    expect((await createSavedModule(as("alice"), body())).status).toBe(409);
  });
});

describe("templates", () => {
  type Listed = { templates: { id: string; name: string; savedAt: string; document: EmailDocument }[]; hiddenDefaults: string[] };
  const listFor = async (ctx: HandlerContext) => (await (await listTemplates(ctx)).json()) as Listed;
  const body = (name = "Monthly update") => ({ name, document: sampleEmailDocument("harbor-pine") });

  it("needs a signed-in user", async () => {
    const { as } = setup();
    expect((await listTemplates(as(null))).status).toBe(401);
    expect((await createTemplate(as(null), body())).status).toBe(401);
    expect((await deleteTemplate(as(null), DEFAULT_TEMPLATE_IDS[0])).status).toBe(401);
    expect((await restoreDefaultTemplates(as(null))).status).toBe(401);
  });

  it("saves, lists and deletes for the owner only", async () => {
    const { as } = setup();
    const res = await createTemplate(as("alice"), body());
    expect(res.status).toBe(201);
    const { template } = (await res.json()) as { template: { id: string } };
    const mine = await listFor(as("alice"));
    expect(mine.templates).toHaveLength(1);
    expect(mine.templates[0]).toMatchObject({ id: template.id, name: "Monthly update" });
    expect(mine.templates[0].document.modules.length).toBeGreaterThan(0);
    expect((await listFor(as("bob"))).templates).toHaveLength(0);
    expect((await deleteTemplate(as("bob"), template.id)).status).toBe(404);
    expect((await deleteTemplate(as("alice"), template.id)).status).toBe(200);
    expect((await listFor(as("alice"))).templates).toHaveLength(0);
  });

  it("rejects a missing name, a broken email and images that are not the user's", async () => {
    const { as } = setup();
    expect((await createTemplate(as("alice"), { name: " ", document: sampleEmailDocument("harbor-pine") })).status).toBe(400);
    expect((await createTemplate(as("alice"), { name: "x", document: { nope: true } })).status).toBe(400);
    const bobsImage = await uploadFor(as("bob"));
    expect((await createTemplate(as("alice"), { name: "x", document: withAsset(sampleEmailDocument("harbor-pine"), bobsImage) })).status).toBe(400);
    expect((await createTemplate(as("bob"), { name: "x", document: withAsset(sampleEmailDocument("harbor-pine"), bobsImage) })).status).toBe(201);
  });

  it("removes a starter template for one user only, and can bring them back", async () => {
    const { as } = setup();
    const first = DEFAULT_TEMPLATE_IDS[0];
    expect((await deleteTemplate(as("alice"), first)).status).toBe(200);
    expect((await deleteTemplate(as("alice"), first)).status).toBe(200);
    expect((await listFor(as("alice"))).hiddenDefaults).toEqual([first]);
    expect((await listFor(as("bob"))).hiddenDefaults).toEqual([]);
    expect((await restoreDefaultTemplates(as("alice"))).status).toBe(200);
    expect((await listFor(as("alice"))).hiddenDefaults).toEqual([]);
    expect((await deleteTemplate(as("alice"), "default-nope")).status).toBe(404);
  });

  it("stops at the limit", async () => {
    const { as } = setup();
    for (let i = 0; i < PERSONAL_LIMITS.templates; i++) expect((await createTemplate(as("alice"), body(`T${i}`))).status).toBe(201);
    expect((await createTemplate(as("alice"), body("one too many"))).status).toBe(409);
  });

  it("starter templates are valid emails, and a blank email in the plain look is too", () => {
    for (const t of defaultTemplates()) expect(validateDocument(t.document).ok).toBe(true);
    expect(validateDocument(newEmailDocument("plain")).ok).toBe(true);
  });

  it("shows a person their own templates first, then the starter templates they kept", () => {
    const own = [{ id: "a", name: "Mine", document: sampleEmailDocument("harbor-pine"), savedAt: "2026-11-12T00:00:00Z" }];
    const shown = visibleTemplates(own, [DEFAULT_TEMPLATE_IDS[1]]);
    expect(shown.map((t) => t.id)).toEqual(["a", ...DEFAULT_TEMPLATE_IDS.filter((_, i) => i !== 1)]);
    expect(shown.map((t) => t.isDefault)).toEqual([false, ...DEFAULT_TEMPLATE_IDS.slice(1).map(() => true)]);
  });

  it("starts an email from a template without touching the template", () => {
    const template = { name: "Monthly update", document: sampleEmailDocument("harbor-pine") };
    const before = JSON.stringify(template.document);
    const email = emailFromTemplate(template);
    expect(email.title).toBe("Monthly update");
    email.modules.pop();
    expect(JSON.stringify(template.document)).toBe(before);
  });
});

describe("team spaces", () => {
  const emailsOf = async (ctx: HandlerContext) => ((await (await listEmails(ctx)).json()) as { emails: { id: string }[] }).emails.map((e) => e.id);
  const newEmail = async (ctx: HandlerContext) => {
    const res = await createEmail(ctx, { document: sampleEmailDocument("harbor-pine") });
    expect(res.status).toBe(201);
    return ((await res.json()) as { email: { id: string } }).email.id;
  };
  const doc = () => sampleEmailDocument("harbor-pine");
  const block = () => doc().modules.find((m) => m.type === "text")!;

  it("keeps a person's own Library and a team space completely apart", async () => {
    const { as } = setup();
    const personal = await newEmail(as("alice"));
    const shared = await newEmail(as("alice", "team-acme"));
    expect(await emailsOf(as("alice"))).toEqual([personal]);
    expect(await emailsOf(as("alice", "team-acme"))).toEqual([shared]);
    // the same person, looking from the other side, cannot open, change or delete across the line
    expect((await getEmail(as("alice", "team-acme"), personal)).status).toBe(404);
    expect((await getEmail(as("alice"), shared)).status).toBe(404);
    expect((await updateEmail(as("alice"), shared, { document: doc(), revision: 1 })).status).toBe(404);
    expect((await deleteEmail(as("alice", "team-acme"), personal)).status).toBe(404);
  });

  it("lets every member of a team open, change and delete the team's emails", async () => {
    const { as } = setup();
    const shared = await newEmail(as("alice", "team-acme"));
    expect(await emailsOf(as("bob", "team-acme"))).toEqual([shared]);
    expect((await getEmail(as("bob", "team-acme"), shared)).status).toBe(200);
    const changed = { ...doc(), subject: "Bob was here" };
    expect((await updateEmail(as("bob", "team-acme"), shared, { document: changed, revision: 1 })).status).toBe(200);
    const seen = (await (await getEmail(as("alice", "team-acme"), shared)).json()) as { email: { subject: string; revision: number; ownerId: string } };
    expect(seen.email).toMatchObject({ subject: "Bob was here", revision: 2, ownerId: "alice" });
    // two members saving the same version: the second is told, not silently overwritten
    expect((await updateEmail(as("alice", "team-acme"), shared, { document: doc(), revision: 1 })).status).toBe(409);
    expect((await deleteEmail(as("bob", "team-acme"), shared)).status).toBe(200);
  });

  it("hides one team's things from another team and from outsiders", async () => {
    const { as } = setup();
    const shared = await newEmail(as("alice", "team-acme"));
    const image = await uploadFor(as("alice", "team-acme"));
    await createSavedModule(as("alice", "team-acme"), { id: crypto.randomUUID(), name: "Acme block", brandId: "harbor-pine", module: block() });
    await createTemplate(as("alice", "team-acme"), { name: "Acme template", document: doc() });
    for (const outsider of [as("carol", "team-globex"), as("carol"), as("bob")]) {
      expect(await emailsOf(outsider)).toEqual([]);
      expect((await getEmail(outsider, shared)).status).toBe(404);
      expect((await readAsset(outsider, image)).status).toBe(404);
      expect(((await (await listAssets(outsider)).json()) as { assets: unknown[] }).assets).toEqual([]);
      expect(((await (await listSavedModules(outsider)).json()) as { savedModules: unknown[] }).savedModules).toEqual([]);
      expect(((await (await listTemplates(outsider)).json()) as { templates: unknown[] }).templates).toEqual([]);
    }
    // and a teammate sees all of it
    const mate = as("bob", "team-acme");
    expect((await readAsset(mate, image)).status).toBe(200);
    expect(((await (await listSavedModules(mate)).json()) as { savedModules: unknown[] }).savedModules).toHaveLength(1);
    expect(((await (await listTemplates(mate)).json()) as { templates: unknown[] }).templates).toHaveLength(1);
  });

  it("only accepts pictures from the same Library as the email", async () => {
    const { as } = setup();
    const mine = await uploadFor(as("alice"));
    const teams = await uploadFor(as("alice", "team-acme"));
    expect((await createEmail(as("alice", "team-acme"), { document: withAsset(doc(), mine) })).status).toBe(400);
    expect((await createEmail(as("alice"), { document: withAsset(doc(), teams) })).status).toBe(400);
    expect((await createEmail(as("bob", "team-acme"), { document: withAsset(doc(), teams) })).status).toBe(201);
  });

  it("removes a starter template for the whole team, without touching anyone's own Library", async () => {
    const { as } = setup();
    const first = DEFAULT_TEMPLATE_IDS[0];
    expect((await deleteTemplate(as("alice", "team-acme"), first)).status).toBe(200);
    const hidden = async (ctx: HandlerContext) => ((await (await listTemplates(ctx)).json()) as { hiddenDefaults: string[] }).hiddenDefaults;
    expect(await hidden(as("bob", "team-acme"))).toEqual([first]);
    expect(await hidden(as("alice"))).toEqual([]);
    expect(await hidden(as("bob", "team-globex"))).toEqual([]);
    expect((await restoreDefaultTemplates(as("bob", "team-acme"))).status).toBe(200);
    expect(await hidden(as("alice", "team-acme"))).toEqual([]);
  });

  it("gives a team space four times the room of a personal Library", () => {
    for (const key of ["emails", "templates", "savedBlocks", "imageBytes"] as const) expect(TEAM_LIMITS[key]).toBe(PERSONAL_LIMITS[key] * 4);
    expect(PERSONAL_LIMITS).toEqual({ emails: 50, templates: 20, savedBlocks: 40, imageBytes: 25 * 1024 * 1024 });
  });
});

describe("size limits", () => {
  it("stops new emails at the limit, counted separately for each Library", async () => {
    const { as, emails } = setup();
    const filler = sampleEmailDocument("harbor-pine");
    for (let i = 0; i < PERSONAL_LIMITS.emails; i++) await emails.create({ userId: "alice", workspaceId: null }, filler);
    const full = await createEmail(as("alice"), { document: filler });
    expect(full.status).toBe(409);
    expect(((await full.json()) as { error: string }).error).toMatch(/Your Library can hold 50 emails/);
    // her team space and other people are unaffected
    expect((await createEmail(as("alice", "team-acme"), { document: filler })).status).toBe(201);
    expect((await createEmail(as("bob"), { document: filler })).status).toBe(201);
    // saving changes to an existing email still works when full
    const existing = (await emails.list({ userId: "alice", workspaceId: null }))[0].id;
    expect((await updateEmail(as("alice"), existing, { document: filler, revision: 1 })).status).toBe(200);
  });

  it("stops picture uploads when the Library's picture space is used up, and says how much is left", async () => {
    const { as, assets } = setup();
    const scope = { userId: "alice", workspaceId: null };
    const big = { data: new Uint8Array(5 * 1024 * 1024 - 1000), mimeType: "image/png", width: 10, height: 10, originalFilename: "big.png" };
    for (let i = 0; i < 5; i++) await assets.create(scope, big);
    const res = await uploadAsset(as("alice"), { data: png(), name: "one-more.png" });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/Your Library can hold 25 MB of pictures and has 5 KB left/);
    expect((await uploadAsset(as("alice", "team-acme"), { data: png(), name: "team.png" })).status).toBe(201);
  });

  it("reports each picture's size so the app can show how full a Library is", async () => {
    const { as } = setup();
    await uploadFor(as("alice"));
    const { assets } = (await (await listAssets(as("alice"))).json()) as { assets: { byteSize: number }[] };
    expect(assets[0].byteSize).toBe(png().length);
  });
});

describe("who else has a team email open", () => {
  const others = async (r: Response) => ((await r.json()) as { others: string[] }).others;
  async function teamEmail(as: ReturnType<typeof setup>["as"]) {
    const res = await createEmail(as("alice", "team-acme"), { document: sampleEmailDocument("harbor-pine") });
    return ((await res.json()) as { email: { id: string } }).email.id;
  }

  it("tells each teammate about the other, and stops when one leaves", async () => {
    const { as } = setup();
    const id = await teamEmail(as);
    expect(await others(await touchPresence(as("alice", "team-acme"), id, { name: "Alice" }))).toEqual([]);
    expect(await others(await touchPresence(as("bob", "team-acme"), id, { name: "Bob" }))).toEqual(["Alice"]);
    expect(await others(await touchPresence(as("alice", "team-acme"), id, { name: "Alice" }))).toEqual(["Bob"]);
    expect((await leavePresence(as("bob", "team-acme"), id)).status).toBe(200);
    expect(await others(await touchPresence(as("alice", "team-acme"), id, { name: "Alice" }))).toEqual([]);
  });

  it("forgets someone who has not checked in for a while (a closed laptop, a lost connection)", async () => {
    const { as, presence } = setup();
    const id = await teamEmail(as);
    let clock = 1_000_000;
    presence.now = () => clock;
    await touchPresence(as("alice", "team-acme"), id, { name: "Alice" });
    clock += PRESENCE_WINDOW_MS - 1000;
    expect(await others(await touchPresence(as("bob", "team-acme"), id, { name: "Bob" }))).toEqual(["Alice"]);
    clock += 2000;
    expect(await others(await touchPresence(as("bob", "team-acme"), id, { name: "Bob" }))).toEqual([]);
  });

  it("is for team emails only, and never reaches outside the team", async () => {
    const { as } = setup();
    const id = await teamEmail(as);
    await touchPresence(as("alice", "team-acme"), id, { name: "Alice" });
    expect((await touchPresence(as(null), id, { name: "X" })).status).toBe(401);
    expect((await touchPresence(as("carol", "team-globex"), id, { name: "Carol" })).status).toBe(404);
    expect((await touchPresence(as("alice", "team-acme"), id, { name: "" })).status).toBe(400);
    // a personal email has nobody else in it by definition
    const mine = ((await (await createEmail(as("alice"), { document: sampleEmailDocument("harbor-pine") })).json()) as { email: { id: string } }).email.id;
    expect(await others(await touchPresence(as("alice"), mine, { name: "Alice" }))).toEqual([]);
  });
});
