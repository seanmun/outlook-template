/**
 * Restricted rich text.
 *
 * Stored as a ProseMirror/Tiptap-compatible JSON subset: paragraphs, bullet
 * lists, hard breaks, and bold / italic / link marks. Anything else fails
 * validation. Export never uses editor HTML: this module renders the JSON to
 * controlled, inline-styled email markup.
 */
import { z } from "zod";
import { escapeAttr, escapeHtml, isSafeUrl, sanitizeUrl, style } from "./html";

const LinkMark = z.object({
  type: z.literal("link"),
  attrs: z.object({ href: z.string().max(2048).refine(isSafeUrl, "Link must be an absolute https, http or mailto URL") }),
});
const Mark = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  LinkMark,
]);

const TextNode = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(5000),
  marks: z.array(Mark).max(3).optional(),
});
const HardBreak = z.object({ type: z.literal("hardBreak") });
const Inline = z.discriminatedUnion("type", [TextNode, HardBreak]);

const Paragraph = z.object({
  type: z.literal("paragraph"),
  content: z.array(Inline).max(200).optional(),
});
const ListItem = z.object({
  type: z.literal("listItem"),
  content: z.array(Paragraph).min(1).max(5),
});
const BulletList = z.object({
  type: z.literal("bulletList"),
  content: z.array(ListItem).min(1).max(30),
});

export const RichTextSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.discriminatedUnion("type", [Paragraph, BulletList])).max(50),
});

export type RichText = z.infer<typeof RichTextSchema>;
type InlineNode = z.infer<typeof Inline>;
type ParagraphNode = z.infer<typeof Paragraph>;

export interface RichTextStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  color: string;
  linkColor: string;
  paragraphGap: number;
  align: "left" | "center" | "right";
}

function renderInline(nodes: InlineNode[] | undefined, s: RichTextStyle): string {
  if (!nodes || nodes.length === 0) return "&nbsp;";
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "<br>";
      let html = escapeHtml(n.text);
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === "italic")) html = `<em style="font-style:italic;">${html}</em>`;
      if (marks.some((m) => m.type === "bold")) html = `<strong style="font-weight:bold;">${html}</strong>`;
      const link = marks.find((m) => m.type === "link");
      if (link && link.type === "link") {
        const href = sanitizeUrl(link.attrs.href);
        if (href) {
          html = `<a href="${escapeAttr(href)}" target="_blank" style="${style({ color: s.linkColor, "text-decoration": "underline" })}">${html}</a>`;
        }
      }
      return html;
    })
    .join("");
}

function textStyle(s: RichTextStyle, marginBottom: number): string {
  return style({
    margin: `0 0 ${marginBottom}px 0`,
    padding: "0",
    "font-family": s.fontFamily,
    "font-size": s.fontSize,
    "line-height": s.lineHeight,
    color: s.color,
    "text-align": s.align,
    "mso-line-height-rule": "exactly",
  });
}

export function renderRichText(doc: RichText, s: RichTextStyle): string {
  const blocks = doc.content;
  return blocks
    .map((block, i) => {
      const gap = i === blocks.length - 1 ? 0 : s.paragraphGap;
      if (block.type === "paragraph") {
        return `<p style="${textStyle(s, gap)}">${renderInline(block.content, s)}</p>`;
      }
      // Lists: zero top/bottom margin and padding by default (longhands so Outlook doesn't apply its own);
      // the left margin provides the bullet indent.
      const items = block.content
        .map((item, j) => {
          const inner = item.content.map((p) => renderInline(p.content, s)).join("<br>");
          const itemGap = j === block.content.length - 1 ? 0 : Math.round(s.paragraphGap / 2);
          return `<li style="${textStyle(s, itemGap)}">${inner}</li>`;
        })
        .join("");
      return `<ul style="${style({
        "margin-top": "0",
        "margin-bottom": "0",
        "margin-right": "0",
        "margin-left": "24px",
        "padding-top": "0",
        "padding-bottom": "0",
        "padding-right": "0",
        "padding-left": "0",
        "font-family": s.fontFamily,
        "font-size": s.fontSize,
        color: s.color,
      })}">${items}</ul>`;
    })
    .join("");
}

function inlineToPlain(nodes: InlineNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      const link = n.marks?.find((m) => m.type === "link");
      return link && link.type === "link" && link.attrs.href !== n.text ? `${n.text} (${link.attrs.href})` : n.text;
    })
    .join("");
}

export function richTextToPlain(doc: RichText): string {
  return doc.content
    .map((b) =>
      b.type === "paragraph"
        ? inlineToPlain(b.content)
        : b.content.map((li) => `- ${li.content.map((p) => inlineToPlain(p.content)).join(" ")}`).join("\n"),
    )
    .join("\n\n");
}

/* ----- Compact "markdown-lite" form, used to exchange copy with the AI ----- */

function inlineToLite(nodes: InlineNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      let t = n.text;
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === "italic")) t = `*${t}*`;
      if (marks.some((m) => m.type === "bold")) t = `**${t}**`;
      const link = marks.find((m) => m.type === "link");
      if (link && link.type === "link") t = `[${t}](${link.attrs.href})`;
      return t;
    })
    .join("");
}

export function richTextToLite(doc: RichText): string {
  return doc.content
    .map((b) =>
      b.type === "paragraph"
        ? inlineToLite(b.content)
        : b.content.map((li) => `- ${li.content.map((p) => inlineToLite(p.content)).join(" ")}`).join("\n"),
    )
    .join("\n\n");
}

/** Parses **bold**, *italic*, [text](url) and newlines. Unsafe links become plain text. */
function parseInlineLite(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (t: string, marks?: z.infer<typeof Mark>[]) => {
    if (t) out.push(marks && marks.length ? { type: "text", text: t, marks } : { type: "text", text: t });
  };
  while ((m = re.exec(text))) {
    pushText(text.slice(last, m.index));
    if (m[0] === "\n") out.push({ type: "hardBreak" });
    else if (m[1] !== undefined) {
      const inner = m[1].replace(/^\*\*(.+)\*\*$/, "$1");
      const bold = inner !== m[1];
      if (isSafeUrl(m[2])) {
        pushText(inner, [...(bold ? [{ type: "bold" as const }] : []), { type: "link", attrs: { href: m[2] } }]);
      } else pushText(inner, bold ? [{ type: "bold" }] : undefined);
    } else if (m[3] !== undefined) pushText(m[3], [{ type: "bold" }]);
    else if (m[4] !== undefined) pushText(m[4], [{ type: "italic" }]);
    last = re.lastIndex;
  }
  pushText(text.slice(last));
  return out;
}

export function liteToRichText(input: string): RichText {
  const blocks = input
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const content: RichText["content"] = blocks.map((block) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^[-*•]\s+/.test(l))) {
      return {
        type: "bulletList",
        content: lines.map((l) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInlineLite(l.replace(/^[-*•]\s+/, "")) }],
        })),
      };
    }
    const para: ParagraphNode = { type: "paragraph", content: parseInlineLite(block) };
    return para;
  });
  return RichTextSchema.parse({ type: "doc", content });
}

export function plainParagraphs(...paragraphs: string[]): RichText {
  return {
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: p ? [{ type: "text", text: p }] : undefined })),
  };
}

/** Collect visible text for placeholder detection. */
export function richTextAllText(doc: RichText): string {
  return richTextToPlain(doc);
}

/* ---------- Coercing editor output (including pasted content) into the allowed subset ---------- */

type Loose = { type?: unknown; text?: unknown; marks?: unknown; content?: unknown; attrs?: unknown };

function sanitizeInlineList(nodes: unknown): InlineNode[] {
  const out: InlineNode[] = [];
  const walk = (n: Loose) => {
    if (n?.type === "text" && typeof n.text === "string" && n.text.length) {
      const marks: z.infer<typeof Mark>[] = [];
      for (const m of Array.isArray(n.marks) ? (n.marks as Loose[]) : []) {
        if (m?.type === "bold" && !marks.some((x) => x.type === "bold")) marks.push({ type: "bold" });
        else if (m?.type === "italic" && !marks.some((x) => x.type === "italic")) marks.push({ type: "italic" });
        else if (m?.type === "link") {
          const href = (m.attrs as { href?: unknown } | undefined)?.href;
          if (typeof href === "string" && isSafeUrl(href) && !marks.some((x) => x.type === "link")) marks.push({ type: "link", attrs: { href } });
        }
      }
      out.push(marks.length ? { type: "text", text: n.text.slice(0, 5000), marks } : { type: "text", text: n.text.slice(0, 5000) });
    } else if (n?.type === "hardBreak") out.push({ type: "hardBreak" });
    else if (Array.isArray(n?.content)) (n.content as Loose[]).forEach(walk);
  };
  if (Array.isArray(nodes)) (nodes as Loose[]).forEach(walk);
  return out.slice(0, 200);
}

/** Keeps paragraphs, bullet lists, bold/italic/safe links; flattens anything else (headings, tables, quotes…) to paragraphs. */
export function sanitizeRichTextInput(input: unknown): RichText {
  const blocks: RichText["content"] = [];
  const top = Array.isArray((input as Loose)?.content) ? ((input as Loose).content as Loose[]) : [];
  for (const b of top) {
    if (b?.type === "bulletList" || b?.type === "orderedList") {
      const items = (Array.isArray(b.content) ? (b.content as Loose[]) : [])
        .map((li) => ({ type: "listItem" as const, content: [{ type: "paragraph" as const, content: sanitizeInlineList(li?.content) }] }))
        .filter((li) => li.content[0].content.length > 0)
        .slice(0, 30);
      if (items.length) blocks.push({ type: "bulletList", content: items });
    } else {
      const content = sanitizeInlineList(b?.content);
      blocks.push(content.length ? { type: "paragraph", content } : { type: "paragraph" });
    }
  }
  return RichTextSchema.parse({ type: "doc", content: blocks.slice(0, 50) });
}
