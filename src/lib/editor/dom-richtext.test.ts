import { describe, expect, it } from "vitest";
import { domToPlainText, domToRichText, type DomNode } from "./dom-richtext";

const t = (text: string): DomNode => ({ nodeType: 3, nodeName: "#text", textContent: text, childNodes: [] });
const el = (name: string, kids: DomNode[] = [], attrs: Record<string, string> = {}): DomNode => ({
  nodeType: 1,
  nodeName: name.toUpperCase(),
  textContent: kids.map((k) => k.textContent ?? "").join(""),
  childNodes: kids,
  getAttribute: (n) => attrs[n] ?? null,
});

describe("reading canvas edits back into rich text", () => {
  it("keeps paragraphs, bold, italic, safe links and line breaks", () => {
    const root = el("div", [
      el("p", [t("Hello "), el("strong", [t("team")], { style: "font-weight:bold;" }), t(".")]),
      el("p", [el("i", [t("Soon")]), el("br"), el("a", [t("Read")], { href: "https://example.com/a" })]),
    ]);
    expect(domToRichText(root).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "text", text: "team", marks: [{ type: "bold" }] }, { type: "text", text: "." }] },
      { type: "paragraph", content: [{ type: "text", text: "Soon", marks: [{ type: "italic" }] }, { type: "hardBreak" }, { type: "text", text: "Read", marks: [{ type: "link", attrs: { href: "https://example.com/a" } }] }] },
    ]);
  });

  it("handles what browsers produce while typing: divs, bare text, trailing breaks, nbsp, styled spans", () => {
    const root = el("div", [
      t("First line"),
      el("div", [t("Second line "), el("span", [t("bold")], { style: "font-weight: 700" })]),
      el("div", [el("br")]),
      el("p", [t(" ")]),
      t("\n  "),
    ]);
    expect(domToRichText(root).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First line" }] },
      { type: "paragraph", content: [{ type: "text", text: "Second line " }, { type: "text", text: "bold", marks: [{ type: "bold" }] }] },
      { type: "paragraph" },
      { type: "paragraph" },
    ]);
  });

  it("reads bullet lists, including one the browser nested inside a paragraph", () => {
    const root = el("div", [el("p", [t("Intro"), el("ul", [el("li", [t("One")]), el("li", [el("b", [t("Two")]), el("br")])])])]);
    expect(domToRichText(root).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Two", marks: [{ type: "bold" }] }] }] },
        ],
      },
    ]);
  });

  it("does not leave an empty paragraph where the browser wrapped a new list in one", () => {
    const root = el("div", [el("p", [t("Before")]), el("p", [el("ul", [el("li", [t("Point")])])]), el("p", [el("br")])]);
    expect(domToRichText(root).content.map((b) => b.type)).toEqual(["paragraph", "bulletList", "paragraph"]);
  });

  it("drops unsafe links, scripts' markup and unbolded runs", () => {
    const root = el("div", [
      el("p", [el("a", [t("bad")], { href: "javascript:alert(1)" }), el("b", [t("x"), el("span", [t("y")], { style: "font-weight: normal" })])]),
    ]);
    expect(domToRichText(root).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "bad" }, { type: "text", text: "x", marks: [{ type: "bold" }] }, { type: "text", text: "y" }] },
    ]);
    expect(domToRichText(el("div")).content).toEqual([{ type: "paragraph" }]);
  });

  it("reads plain fields as one line within the limit", () => {
    expect(domToPlainText(el("h1", [t("Big news\n today")]), 200)).toBe("Big news today");
    expect(domToPlainText(el("h1", [t("abcdef")]), 3)).toBe("abc");
  });
});
