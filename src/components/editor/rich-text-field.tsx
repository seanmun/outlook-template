"use client";
import { useEffect } from "react";
import { EditorContent, useEditor as useTiptap } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link as LinkIcon, List, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSafeUrl } from "@/lib/email/html";
import { sanitizeRichTextInput, type RichText } from "@/lib/email/richtext";
import { FieldShell, useLatest } from "./fields";

/**
 * Restricted Tiptap editor: paragraphs, bullet lists, bold, italic, links.
 * Its JSON is sanitized into the stored subset on every change; editor HTML is never stored or exported.
 */
export function RichTextField(props: { id: string; label: string; value: RichText; help?: string; onChange: (v: RichText) => void }) {
  const onChange = useLatest(props.onChange);
  const editor = useTiptap({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        orderedList: false,
        link: {
          openOnClick: false,
          autolink: false,
          linkOnPaste: false,
          protocols: ["mailto"],
          isAllowedUri: (url: string) => isSafeUrl(url),
        },
      }),
    ],
    content: props.value,
    editorProps: { attributes: { id: props.id, class: "min-h-24 px-3 py-2 text-sm focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-1 [&_a]:text-blue-700 [&_a]:underline" } },
    onUpdate: ({ editor }) => onChange.current(sanitizeRichTextInput(editor.getJSON())),
  });

  // Reflect external changes (undo/redo, AI edits) without clobbering the cursor on our own updates.
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(sanitizeRichTextInput(editor.getJSON()));
    if (current !== JSON.stringify(props.value)) editor.commands.setContent(props.value, { emitUpdate: false });
  }, [editor, props.value]);

  if (!editor) return <FieldShell label={props.label}><div className="h-24 rounded-md border" /></FieldShell>;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (https:// or mailto:)", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") return editor.chain().focus().unsetLink().run();
    if (!isSafeUrl(url.trim())) return window.alert("Only absolute https://, http:// or mailto: links are allowed.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const tool = (active: boolean, label: string, icon: React.ReactNode, run: () => void) => (
    <Button type="button" size="icon-sm" variant={active ? "secondary" : "ghost"} aria-label={label} aria-pressed={active} title={label} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {icon}
    </Button>
  );

  return (
    <FieldShell label={props.label} help={props.help ?? "Pasted formatting is reduced to bold, italic, links and bullets."} htmlFor={props.id}>
      <div className="rounded-md border focus-within:ring-1 focus-within:ring-neutral-400">
        <div className="flex gap-0.5 border-b px-1 py-0.5">
          {tool(editor.isActive("bold"), "Bold", <Bold />, () => editor.chain().focus().toggleBold().run())}
          {tool(editor.isActive("italic"), "Italic", <Italic />, () => editor.chain().focus().toggleItalic().run())}
          {tool(editor.isActive("bulletList"), "Bullet list", <List />, () => editor.chain().focus().toggleBulletList().run())}
          {tool(editor.isActive("link"), "Link", <LinkIcon />, setLink)}
          {editor.isActive("link") && tool(false, "Remove link", <Unlink />, () => editor.chain().focus().unsetLink().run())}
        </div>
        <EditorContent editor={editor} />
      </div>
    </FieldShell>
  );
}
