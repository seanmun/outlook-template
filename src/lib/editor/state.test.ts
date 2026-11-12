import { describe, expect, it } from "vitest";
import { sampleEmailDocument } from "@/lib/email/starter";
import { applyOperations } from "@/lib/email/operations";
import { resolveDrop } from "./drop-target";
import { parseSavedModules } from "@/lib/client/saved-modules";
import { validateDocument } from "@/lib/email/registry";
import { isLowRes, moduleInnerWidth, placeImage } from "./image-field";
import { docOps, editorReducer, initialEditorState, instantiateSaved, resolveAiResult } from "./state";

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

describe("drag and drop", () => {
  const start = () => {
    let doc = { ...sampleEmailDocument("harbor-pine"), modules: [] as ReturnType<typeof sampleEmailDocument>["modules"] };
    doc = docOps.add(doc, "header", { parentId: null, index: null }, "m_header0001");
    doc = docOps.add(doc, "text", { parentId: null, index: null }, "m_text000001");
    doc = docOps.add(doc, "footer", { parentId: null, index: null }, "m_footer0001");
    return doc;
  };
  const tree = (d: ReturnType<typeof start>) => d.modules.map((m) => (m.columns ? m.columns.map((c) => c.blocks.map((b) => b.id)) : m.id));

  it("drops a new block before a module or at the end", () => {
    let doc = docOps.drop(start(), { kind: "new", type: "cta" }, { kind: "before", anchorId: "m_footer0001" }, "m_cta0000001");
    doc = docOps.drop(doc, { kind: "new", type: "divider" }, { kind: "end", parentId: null }, "m_div0000001");
    expect(tree(doc)).toEqual(["m_header0001", "m_text000001", "m_cta0000001", "m_footer0001", "m_div0000001"]);
  });

  it("splits a block into a two-column row when dropped at its side", () => {
    const doc = docOps.drop(start(), { kind: "new", type: "hero" }, { kind: "split", anchorId: "m_text000001", side: "left" }, "m_hero000001");
    expect(tree(doc)).toEqual(["m_header0001", [["m_hero000001"], ["m_text000001"]], "m_footer0001"]);
    expect(doc.modules[1].settings.layout).toBe("1-1");
    expect(doc.modules[1].columns![1].blocks[0].settings.padding).toMatchObject({ left: 0, right: 0 });
    // Moving an existing block to the other side of another block works the same way.
    const moved = docOps.drop(start(), { kind: "move", id: "m_header0001" }, { kind: "split", anchorId: "m_text000001", side: "right" });
    expect(tree(moved)).toEqual([[["m_text000001"], ["m_header0001"]], "m_footer0001"]);
  });

  it("moves blocks into, within and out of columns, restoring full-width padding on the way out", () => {
    let doc = docOps.drop(start(), { kind: "new", type: "hero" }, { kind: "split", anchorId: "m_text000001", side: "left" }, "m_hero000001");
    const rowId = doc.modules[1].id;
    doc = docOps.drop(doc, { kind: "new", type: "cta" }, { kind: "end", parentId: rowId, column: 1 }, "m_cta0000001");
    doc = docOps.drop(doc, { kind: "move", id: "m_cta0000001" }, { kind: "before", anchorId: "m_text000001" });
    expect(tree(doc)[1]).toEqual([["m_hero000001"], ["m_cta0000001", "m_text000001"]]);
    doc = docOps.drop(doc, { kind: "move", id: "m_text000001" }, { kind: "before", anchorId: "m_header0001" });
    expect(tree(doc)).toEqual(["m_text000001", "m_header0001", [["m_hero000001"], ["m_cta0000001"]], "m_footer0001"]);
    expect((doc.modules[0].settings.padding as { left: number }).left).toBeGreaterThan(0);
  });

  it("refuses drops that are not allowed and ignores drops that change nothing", () => {
    const doc = docOps.drop(start(), { kind: "new", type: "hero" }, { kind: "split", anchorId: "m_text000001", side: "left" }, "m_hero000001");
    const rowId = doc.modules[1].id;
    expect(docOps.drop(doc, { kind: "new", type: "columns" }, { kind: "end", parentId: rowId, column: 0 })).toBe(doc);
    expect(docOps.drop(doc, { kind: "move", id: rowId }, { kind: "split", anchorId: "m_header0001", side: "left" })).toBe(doc);
    expect(docOps.drop(doc, { kind: "new", type: "cta" }, { kind: "split", anchorId: rowId, side: "left" })).toBe(doc);
    expect(docOps.drop(doc, { kind: "move", id: "m_header0001" }, { kind: "before", anchorId: "m_header0001" })).toBe(doc);
    expect(docOps.drop(doc, { kind: "move", id: "m_header0001" }, { kind: "before", anchorId: rowId })).toBe(doc);
    expect(docOps.drop(doc, { kind: "move", id: "m_missing0001" }, { kind: "end", parentId: null })).toBe(doc);
  });
});

describe("drop targets on the preview", () => {
  const content = { left: 40, top: 24, right: 640, bottom: 24 };
  const rows = [
    { id: "a", box: { left: 40, top: 24, right: 640, bottom: 124 } },
    {
      id: "row",
      box: { left: 40, top: 124, right: 640, bottom: 324 },
      columns: [
        { box: { left: 80, top: 140, right: 245, bottom: 308 }, blocks: [{ id: "c1", box: { left: 80, top: 140, right: 245, bottom: 220 } }] },
        { box: { left: 269, top: 140, right: 600, bottom: 308 }, blocks: [] },
      ],
    },
    { id: "z", box: { left: 40, top: 324, right: 640, bottom: 400 } },
  ];
  const at = (x: number, y: number, o: { draggingRow?: boolean; movingId?: string } = {}) => resolveDrop(rows, x, y, { draggingRow: false, content, ...o });

  it("inserts between rows in the middle of a block and splits at its sides", () => {
    expect(at(340, 40).target).toEqual({ kind: "before", anchorId: "a" });
    expect(at(340, 110).target).toEqual({ kind: "before", anchorId: "row" });
    expect(at(60, 70)).toMatchObject({ target: { kind: "split", anchorId: "a", side: "left" }, mark: "line-v" });
    expect(at(620, 70).target).toEqual({ kind: "split", anchorId: "a", side: "right" });
    // A block cannot be split against itself, and rows never split.
    expect(at(60, 70, { movingId: "a" }).target).toEqual({ kind: "before", anchorId: "a" });
    expect(at(60, 70, { draggingRow: true }).target.kind).toBe("before");
    expect(at(340, 390).target).toEqual({ kind: "end", parentId: null });
    expect(at(340, 900).target).toEqual({ kind: "end", parentId: null });
  });

  it("targets columns inside a row, and the row's edges for between-row drops", () => {
    expect(at(100, 160).target).toEqual({ kind: "before", anchorId: "c1" });
    expect(at(100, 260).target).toEqual({ kind: "end", parentId: "row", column: 0 });
    expect(at(400, 200)).toMatchObject({ target: { kind: "end", parentId: "row", column: 1 }, mark: "fill", label: "Column 2" });
    expect(at(400, 128).target).toEqual({ kind: "before", anchorId: "row" });
    expect(at(400, 320).target).toEqual({ kind: "before", anchorId: "z" });
    expect(at(400, 200, { draggingRow: true }).target).toEqual({ kind: "before", anchorId: "row" });
  });

  it("offers the whole content area when the email is empty", () => {
    expect(resolveDrop([], 300, 60, { draggingRow: false, content })).toMatchObject({ target: { kind: "end", parentId: null }, mark: "fill" });
  });
});

describe("saved modules", () => {
  const doc = sampleEmailDocument("harbor-pine");
  const row = docOps.drop(doc, { kind: "new", type: "cta" }, { kind: "split", anchorId: doc.modules[2].id, side: "right" }).modules[2];

  it("adds a copy of a saved block under a new id, leaving the saved one untouched", () => {
    const saved = structuredClone(doc.modules[2]);
    const next = docOps.addSaved(doc, saved, { parentId: null, index: 0 }, "m_fromsaved01");
    expect(next.modules[0]).toEqual({ ...doc.modules[2], id: "m_fromsaved01" });
    expect(next.modules).toHaveLength(doc.modules.length + 1);
    expect(saved).toEqual(doc.modules[2]);
  });

  it("gives a saved row and its blocks new ids every time it is used", () => {
    expect(row.columns).toHaveLength(2);
    const once = docOps.drop(doc, { kind: "saved", module: row }, { kind: "end", parentId: null }, "m_savedrow001");
    const twice = docOps.drop(once, { kind: "saved", module: row }, { kind: "end", parentId: null }, "m_savedrow002");
    const [a, b] = twice.modules.slice(-2);
    expect([a.id, b.id]).toEqual(["m_savedrow001", "m_savedrow002"]);
    const ids = [a, b].flatMap((r) => r.columns!.flatMap((c) => c.blocks.map((x) => x.id)));
    expect(new Set([...ids, ...row.columns!.flatMap((c) => c.blocks.map((x) => x.id))]).size).toBe(6);
    expect(validateDocument(twice).ok).toBe(true);
  });

  it("refuses a saved row inside a column and anything that is not a valid module", () => {
    const withRow = docOps.addSaved(doc, row, { parentId: null, index: null }, "m_savedrow003");
    expect(docOps.addSaved(withRow, row, { parentId: "m_savedrow003", column: 0, index: null })).toBe(withRow);
    expect(docOps.drop(withRow, { kind: "saved", module: row }, { kind: "end", parentId: "m_savedrow003", column: 0 })).toBe(withRow);
    const broken = { ...doc.modules[2], settings: { fontSize: "huge" } };
    expect(instantiateSaved(doc, broken)).toBeNull();
    expect(docOps.addSaved(doc, broken, { parentId: null, index: null })).toBe(doc);
    expect(instantiateSaved(doc, { ...doc.modules[2], type: "not-a-module" })).toBeNull();
  });

  it("reads back only well-formed saved modules", () => {
    const good = { id: "a", name: "My row", brandId: "harbor-pine", savedAt: "2026-11-11T00:00:00.000Z", module: row };
    expect(parseSavedModules(JSON.stringify([good, { id: "b", name: "", module: {} }, "junk"]))).toEqual([good]);
    expect(parseSavedModules("not json")).toEqual([]);
    expect(parseSavedModules(null)).toEqual([]);
    expect(parseSavedModules('{"a":1}')).toEqual([]);
  });
});

describe("images placed on the canvas", () => {
  const picture = { src: { kind: "asset" as const, assetId: "abc" }, width: 1200, height: 600 };
  const empty = { src: null, alt: "Team photo", width: 600, naturalWidth: null, naturalHeight: null, linkUrl: "https://example.com/" };

  it("fills an empty field to the width allowed and keeps alt text and link", () => {
    expect(placeImage(empty, picture, 520)).toEqual({ ...empty, src: picture.src, width: 520, naturalWidth: 1200, naturalHeight: 600 });
  });

  it("keeps a chosen width when replacing, and never upscales a small picture", () => {
    expect(placeImage({ ...empty, src: picture.src, width: 300 }, picture, 600).width).toBe(300);
    expect(placeImage(empty, { ...picture, width: 180 }, 600).width).toBe(180);
    expect(isLowRes(placeImage(empty, { ...picture, width: 700 }, 600))).toBe(true);
    expect(isLowRes(placeImage(empty, picture, 600))).toBe(false);
  });

  it("limits images to the module's own width, inside a column too", () => {
    const doc = sampleEmailDocument("harbor-pine");
    const hero = doc.modules.find((m) => m.type === "hero")!;
    expect(moduleInnerWidth(doc, hero.id)).toBe(600);
    const split = docOps.drop(doc, { kind: "new", type: "hero" }, { kind: "split", anchorId: doc.modules[2].id, side: "left" }, "m_columnhero1");
    // 600 wide, 40 padding each side, 24 gap, two equal columns.
    expect(moduleInnerWidth(split, "m_columnhero1")).toBe(248);
  });
});
