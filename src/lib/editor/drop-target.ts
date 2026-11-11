/**
 * Decides where a drag over the email preview would land. Works on plain
 * rectangles measured from the preview so it can be tested without a browser.
 */
import type { DropTarget } from "./state";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface RowGeometry {
  id: string;
  box: Box;
  /** Present for a columns row: each column's box and the blocks stacked in it. */
  columns?: { box: Box; blocks: { id: string; box: Box }[] }[];
}

export interface DropHit {
  target: DropTarget;
  /** What to draw: a horizontal or vertical insertion line, or a filled area for an empty column. */
  mark: "line-h" | "line-v" | "fill";
  box: Box;
  label: string;
}

const EDGE = 10;
const midY = (b: Box) => (b.top + b.bottom) / 2;
const hLine = (left: number, right: number, y: number): Box => ({ left, right, top: y - 2, bottom: y + 2 });
const vLine = (x: number, top: number, bottom: number): Box => ({ left: x - 2, right: x + 2, top, bottom });

export function resolveDrop(
  rows: RowGeometry[],
  x: number,
  y: number,
  opts: {
    /** The dragged thing is a columns row, which can only go between rows. */
    draggingRow: boolean;
    /** Id of the module being moved, if any. */
    movingId?: string;
    /** Where the email content sits, used when the email is empty. */
    content: Box;
  },
): DropHit {
  if (rows.length === 0) {
    return { target: { kind: "end", parentId: null }, mark: "fill", box: { ...opts.content, bottom: Math.max(opts.content.bottom, opts.content.top + 80) }, label: "Drop to start the email" };
  }
  const index = rows.findIndex((r) => y < r.box.bottom);
  const last = rows[rows.length - 1];
  if (index < 0) return { target: { kind: "end", parentId: null }, mark: "line-h", box: hLine(last.box.left, last.box.right, last.box.bottom), label: "" };

  const row = rows[index];
  const before: DropHit = { target: { kind: "before", anchorId: row.id }, mark: "line-h", box: hLine(row.box.left, row.box.right, row.box.top), label: "" };
  const next = rows[index + 1];
  const after: DropHit = {
    target: next ? { kind: "before", anchorId: next.id } : { kind: "end", parentId: null },
    mark: "line-h",
    box: hLine(row.box.left, row.box.right, row.box.bottom),
    label: "",
  };
  const betweenRows = y < midY(row.box) ? before : after;

  if (row.columns && !opts.draggingRow) {
    if (y < row.box.top + EDGE) return before;
    if (y > row.box.bottom - EDGE) return after;
    const distance = (b: Box) => (x < b.left ? b.left - x : x > b.right ? x - b.right : 0);
    const column = row.columns.reduce((best, c, i) => (distance(c.box) < distance(row.columns![best].box) ? i : best), 0);
    const col = row.columns[column];
    const label = `Column ${column + 1}`;
    if (col.blocks.length === 0) return { target: { kind: "end", parentId: row.id, column }, mark: "fill", box: { ...col.box, top: row.box.top + EDGE, bottom: row.box.bottom - EDGE }, label };
    const beforeBlock = col.blocks.find((b) => y < midY(b.box));
    if (beforeBlock) return { target: { kind: "before", anchorId: beforeBlock.id }, mark: "line-h", box: hLine(col.box.left, col.box.right, beforeBlock.box.top), label };
    return { target: { kind: "end", parentId: row.id, column }, mark: "line-h", box: hLine(col.box.left, col.box.right, col.blocks[col.blocks.length - 1].box.bottom), label };
  }

  // Near the left or right edge of a full-width block: drop beside it, making a two-column row.
  if (!row.columns && !opts.draggingRow && row.id !== opts.movingId) {
    const zone = Math.max(48, (row.box.right - row.box.left) * 0.18);
    if (x < row.box.left + zone) return { target: { kind: "split", anchorId: row.id, side: "left" }, mark: "line-v", box: vLine(row.box.left + 3, row.box.top, row.box.bottom), label: "New column" };
    if (x > row.box.right - zone) return { target: { kind: "split", anchorId: row.id, side: "right" }, mark: "line-v", box: vLine(row.box.right - 3, row.box.top, row.box.bottom), label: "New column" };
  }
  return betweenRows;
}
