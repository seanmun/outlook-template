/**
 * Reads text edited in place on the canvas back into the stored rich-text
 * model. The browser's editing markup is never stored: it is walked and
 * reduced to paragraphs, bullet lists, line breaks, bold, italic and safe links.
 */
import { sanitizeRichTextInput, type RichText } from "@/lib/email/richtext";

/** The small part of the DOM this needs, so it can be tested without a browser. */
export interface DomNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNode>;
  getAttribute?: (name: string) => string | null;
}

type Mark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };
type Inline = { type: "text"; text: string; marks?: Mark[] } | { type: "hardBreak" };
type Block = { type: "paragraph"; content: Inline[] } | { type: "bulletList"; content: { type: "listItem"; content: [{ type: "paragraph"; content: Inline[] }] }[] };

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TR", "TABLE", "SECTION", "ARTICLE"]);
const children = (n: DomNode) => Array.from(n.childNodes);

function marksFor(el: DomNode, inherited: Mark[]): Mark[] {
  const marks = [...inherited];
  const add = (m: Mark) => {
    if (!marks.some((x) => x.type === m.type)) marks.push(m);
  };
  const style = (el.getAttribute?.("style") ?? "").toLowerCase();
  if (el.nodeName === "B" || el.nodeName === "STRONG" || /font-weight:\s*(bold|[6-9]00)/.test(style)) add({ type: "bold" });
  if (el.nodeName === "I" || el.nodeName === "EM" || /font-style:\s*italic/.test(style)) add({ type: "italic" });
  const href = el.nodeName === "A" ? el.getAttribute?.("href") : null;
  if (href) add({ type: "link", attrs: { href } });
  // An explicit "normal" inside bold/italic text (how browsers un-bold part of a run) removes the mark.
  if (/font-weight:\s*(normal|400)/.test(style)) return marks.filter((m) => m.type !== "bold");
  return marks;
}

/** Trailing line breaks are how browsers keep an empty or just-ended line open; they are not content. */
function trimBreaks(inline: Inline[]): Inline[] {
  const out = [...inline];
  while (out.length && out[out.length - 1].type === "hardBreak") out.pop();
  return out;
}

export function domToRichText(root: DomNode): RichText {
  const blocks: Block[] = [];
  let line: Inline[] = [];
  let lineOpen = false;
  const flush = () => {
    if (lineOpen) blocks.push({ type: "paragraph", content: trimBreaks(line) });
    line = [];
    lineOpen = false;
  };

  const inlineOf = (n: DomNode, marks: Mark[], into: Inline[]) => {
    if (n.nodeType === 3) {
      const text = (n.textContent ?? "").replace(/ /g, " ").replace(/[\n\r\t]+/g, " ");
      if (text) into.push(marks.length ? { type: "text", text, marks } : { type: "text", text });
    } else if (n.nodeType === 1) {
      if (n.nodeName === "BR") into.push({ type: "hardBreak" });
      else for (const c of children(n)) inlineOf(c, marksFor(n, marks), into);
    }
  };

  const walk = (n: DomNode, marks: Mark[]) => {
    if (n.nodeType === 3) {
      const before = line.length;
      inlineOf(n, marks, line);
      // Whitespace between blocks is formatting, not a paragraph.
      if (line.length > before && (lineOpen || (n.textContent ?? "").trim())) lineOpen = true;
      else line.length = before;
      return;
    }
    if (n.nodeType !== 1) return;
    if (n.nodeName === "UL" || n.nodeName === "OL") {
      // A list the browser put inside an otherwise empty paragraph replaces that paragraph.
      if (line.length) flush();
      else lineOpen = false;
      const items = children(n)
        .filter((c) => c.nodeType === 1 && c.nodeName === "LI")
        .map((li) => {
          const content: Inline[] = [];
          inlineOf(li, marks, content);
          return { type: "listItem" as const, content: [{ type: "paragraph" as const, content: trimBreaks(content) }] as [{ type: "paragraph"; content: Inline[] }] };
        });
      if (items.length) blocks.push({ type: "bulletList", content: items });
      return;
    }
    if (BLOCK_TAGS.has(n.nodeName) || n.nodeName === "LI") {
      flush();
      lineOpen = true;
      for (const c of children(n)) walk(c, marksFor(n, marks));
      flush();
      return;
    }
    if (n.nodeName === "BR") {
      line.push({ type: "hardBreak" });
      lineOpen = true;
      return;
    }
    const m = marksFor(n, marks);
    for (const c of children(n)) walk(c, m);
  };

  for (const c of children(root)) walk(c, []);
  flush();
  // A lone non-breaking space is the renderer's stand-in for an empty paragraph.
  const cleaned = blocks.map((b) => (b.type === "paragraph" && b.content.length === 1 && b.content[0].type === "text" && !b.content[0].text.trim() ? { type: "paragraph" as const, content: [] } : b));
  return sanitizeRichTextInput({ type: "doc", content: cleaned.length ? cleaned : [{ type: "paragraph", content: [] }] });
}

/** Plain-text fields: one line, no markup. */
export function domToPlainText(root: DomNode, maxLength: number): string {
  return (root.textContent ?? "").replace(/ /g, " ").replace(/\s*[\n\r]+\s*/g, " ").slice(0, maxLength);
}
