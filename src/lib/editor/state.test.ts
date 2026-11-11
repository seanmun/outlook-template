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

describe("columns in the editor", () => {
  it("adds a row, fills its columns, moves and duplicates blocks, and keeps content when the layout changes", () => {
    let doc = { ...sampleEmailDocument("harbor-pine"), modules: [] as ReturnType<typeof sampleEmailDocument>["modules"] };
    doc = docOps.add(doc, "columns", { parentId: null, index: null }, "m_row0000001", { layout: "1-1-1" });
    expect(doc.modules[0].columns).toHaveLength(3);
    doc = docOps.add(doc, "text", { parentId: "m_row0000001", column: 2, index: null }, "m_text000001");
    doc = docOps.add(doc, "cta", { parentId: "m_row0000001", column: 0, index: null }, "m_cta0000001");
    // Rows cannot go inside rows.
    expect(docOps.add(doc, "columns", { parentId: "m_row0000001", column: 0, index: null })).toBe(doc);

    doc = docOps.moveTo(doc, "m_cta0000001", { parentId: "m_row0000001", column: 2, index: 0 });
    expect(doc.modules[0].columns!.map((c) => c.blocks.map((b) => b.id))).toEqual([[], [], ["m_cta0000001", "m_text000001"]]);

    doc = docOps.setSetting(doc, "m_row0000001", "layout", "1-2");
    expect(doc.modules[0].columns!.map((c) => c.blocks.length)).toEqual([0, 2]);

    const copy = docOps.duplicate(doc, "m_row0000001", "m_row0000002");
    const ids = copy.modules.flatMap((m) => [m.id, ...m.columns!.flatMap((c) => c.blocks.map((b) => b.id))]);
    expect(new Set(ids).size).toBe(6);

    doc = docOps.moveTo(doc, "m_text000001", { parentId: null, index: 0 });
    expect(doc.modules.map((m) => m.type)).toEqual(["text", "columns"]);
    expect(docOps.remove(doc, "m_cta0000001").modules[1].columns![1].blocks).toHaveLength(0);

    let s = initialEditorState(doc);
    s = editorReducer(s, { type: "select", id: "m_cta0000001" });
    s = editorReducer(s, { type: "change", update: (d) => docOps.setContent(d, "m_cta0000001", "label", "Go") });
    expect(s.selectedId).toBe("m_cta0000001");
    expect(s.doc.modules[1].columns![1].blocks[0].content.label).toBe("Go");
  });
});
