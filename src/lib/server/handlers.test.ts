import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { sampleEmailDocument } from "@/lib/email/starter";
import { sampleBytes } from "@/lib/email/samples";
import type { EmailDocument } from "@/lib/email/document";
import { createEmail, deleteEmail, exportForDemo, exportForUser, getEmail, listAssets, listEmails, readAsset, updateEmail, uploadAsset, type HandlerContext } from "./handlers";
import { MemoryAssetRepo, MemoryEmailRepo } from "./memory-repo";

function setup() {
  const emails = new MemoryEmailRepo();
  const assets = new MemoryAssetRepo();
  const as = (userId: string | null): HandlerContext => ({ userId, emails, assets });
  return { emails, assets, as };
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
    expect(((await save.json()) as { error: string }).error).toMatch(/not yours/);
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
    delete process.env.EXPORT_EMLTPL_EXPERIMENTAL;
    const r = await exportForDemo({ document: sampleEmailDocument("harbor-pine"), formats: ["emltpl"] });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toMatch(/emltpl/);
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
