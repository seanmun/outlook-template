import { describe, expect, it } from "vitest";
import { sampleEmailDocument } from "@/lib/email/starter";
import { reconcileSavedModules, type SavedModule } from "./saved-modules";

const block = sampleEmailDocument("harbor-pine").modules.find((m) => m.type === "text")!;
const item = (id: string, savedAt: string): SavedModule => ({ id, name: id, brandId: "harbor-pine", savedAt, module: block });

describe("reconciling saved modules with the account", () => {
  const a = item("a", "2026-11-01T00:00:00Z");
  const b = item("b", "2026-11-02T00:00:00Z");
  const c = item("c", "2026-11-03T00:00:00Z");
  const ids = (list: SavedModule[]) => list.map((x) => x.id);

  it("uploads what was only ever saved here", () => {
    const r = reconcileSavedModules([b, a], [], new Set());
    expect(ids(r.merged)).toEqual(["b", "a"]);
    expect(ids(r.upload)).toEqual(["b", "a"]);
  });

  it("adds what was saved on another device, newest first", () => {
    const r = reconcileSavedModules([a], [c, a], new Set(["a"]));
    expect(ids(r.merged)).toEqual(["c", "a"]);
    expect(r.upload).toEqual([]);
  });

  it("drops what was removed on another device", () => {
    const r = reconcileSavedModules([b, a], [a], new Set(["a", "b"]));
    expect(ids(r.merged)).toEqual(["a"]);
    expect(r.upload).toEqual([]);
  });

  it("handles all three at once without losing or duplicating anything", () => {
    // a: in both. b: synced before, gone from the account. c: new here. d: new in the account.
    const d = item("d", "2026-11-04T00:00:00Z");
    const r = reconcileSavedModules([c, b, a], [d, a], new Set(["a", "b"]));
    expect(ids(r.merged)).toEqual(["d", "c", "a"]);
    expect(ids(r.upload)).toEqual(["c"]);
  });

  it("changes nothing when both sides already agree", () => {
    const r = reconcileSavedModules([b, a], [b, a], new Set(["a", "b"]));
    expect(ids(r.merged)).toEqual(["b", "a"]);
    expect(r.upload).toEqual([]);
  });
});
