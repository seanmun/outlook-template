import { describe, expect, it } from "vitest";
import { sampleEmailDocument } from "@/lib/email/starter";
import { applyOperations } from "@/lib/email/operations";
import { docOps, editorReducer, initialEditorState, resolveAiResult } from "./state";

describe("editor history", () => {
  it("undo/redo restore exact documents and bump the version", () => {
    const doc = sampleEmailDocument("harbor-pine");
    let s = initialEditorState(doc);
    s = editorReducer(s, { type: "change", update: (d) => docOps.setField(d, "subject", "A") });
    s = editorReducer(s, { type: "change", update: (d) => docOps.setField(d, "subject", "B") });
    expect(s.doc.subject).toBe("B");
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.subject).toBe("A");
    s = editorReducer(s, { type: "undo" });
    expect(s.doc).toEqual(doc);
    s = editorReducer(s, { type: "redo" });
    expect(s.doc.subject).toBe("A");
    expect(s.version).toBe(5);
  });

  it("coalesces rapid typing in the same field into one undo step", () => {
    let s = initialEditorState(sampleEmailDocument("harbor-pine"));
    for (const [i, t] of ["H", "He", "Hel"].entries()) {
      s = editorReducer(s, { type: "change", update: (d) => docOps.setField(d, "subject", t), coalesceKey: "subject", now: 1000 + i * 100 });
    }
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: "undo" });
    expect(s.doc.subject).toBe("[Sample] Join the quarterly town hall");
  });

  it("reorders, duplicates and removes with stable ids", () => {
    const doc = sampleEmailDocument("lumen-labs");
    const ids = doc.modules.map((m) => m.id);
    const moved = docOps.move(doc, ids[0], 2);
    expect(moved.modules.map((m) => m.id)).toEqual([ids[1], ids[2], ids[0], ...ids.slice(3)]);
    const dup = docOps.duplicate(doc, ids[1], "m_duplicate01");
    expect(dup.modules[2]).toEqual({ ...doc.modules[1], id: "m_duplicate01" });
    expect(docOps.remove(doc, ids[1]).modules.map((m) => m.id)).toEqual(ids.filter((x) => x !== ids[1]));
  });

  it("reset restores defaults for settings only", () => {
    const doc = sampleEmailDocument("harbor-pine");
    const text = doc.modules.find((m) => m.type === "text")!;
    const changed = docOps.setSetting(docOps.setContent(doc, text.id, "headline", "Mine"), text.id, "headlineSize", 40);
    const reset = docOps.resetSettings(changed, text.id).modules.find((m) => m.id === text.id)!;
    expect(reset.settings).toEqual(text.settings);
    expect(reset.content.headline).toBe("Mine");
  });
});

describe("stale AI results", () => {
  const setup = () => {
    const doc = sampleEmailDocument("harbor-pine");
    const text = doc.modules.find((m) => m.type === "text")!;
    const cta = doc.modules.find((m) => m.type === "cta")!;
    return { doc, text, cta };
  };

  it("applies when nothing changed during the request", () => {
    const { doc, text } = setup();
    const ops = [{ op: "update_module" as const, moduleId: text.id, content: { headline: "AI" }, settings: null }];
    const r = applyOperations(doc, ops);
    if (!r.ok) throw new Error();
    const res = resolveAiResult({ requestVersion: 3, currentVersion: 3, currentDoc: doc, resultDoc: r.doc, operations: ops });
    expect(res.kind).toBe("apply");
  });

  it("never silently overwrites edits made while the request ran, and offers a rebase that keeps them", () => {
    const { doc, text, cta } = setup();
    const ops = [{ op: "update_module" as const, moduleId: text.id, content: { headline: "AI headline" }, settings: null }];
    const r = applyOperations(doc, ops);
    if (!r.ok) throw new Error();
    // the user edits the CTA label meanwhile
    const userDoc = docOps.setContent(doc, cta.id, "label", "User label");
    const res = resolveAiResult({ requestVersion: 3, currentVersion: 4, currentDoc: userDoc, resultDoc: r.doc, operations: ops });
    expect(res.kind).toBe("stale");
    if (res.kind !== "stale" || !res.rebased) throw new Error("expected rebase");
    expect(res.rebased.modules.find((m) => m.id === cta.id)!.content.label).toBe("User label");
    expect(res.rebased.modules.find((m) => m.id === text.id)!.content.headline).toBe("AI headline");
  });

  it("reports a conflict when the AI's target module was deleted meanwhile", () => {
    const { doc, text } = setup();
    const ops = [{ op: "update_module" as const, moduleId: text.id, content: { headline: "AI" }, settings: null }];
    const r = applyOperations(doc, ops);
    if (!r.ok) throw new Error();
    const res = resolveAiResult({ requestVersion: 1, currentVersion: 2, currentDoc: docOps.remove(doc, text.id), resultDoc: r.doc, operations: ops });
    expect(res).toMatchObject({ kind: "stale", rebased: null });
  });
});
