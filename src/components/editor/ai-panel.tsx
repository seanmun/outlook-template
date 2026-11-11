"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfig } from "@/lib/client/config";
import { resolveAiResult } from "@/lib/editor/state";
import type { EmailDocument } from "@/lib/email/document";
import type { AvailableImage, Operation } from "@/lib/email/operations";
import { AiAttachments, type CompAttachment, type EmailImageAttachment } from "./ai-attachments";
import { useEditor } from "./context";

interface ChatEntry {
  role: "user" | "assistant";
  text: string;
  /** What was attached to this request, e.g. "comp.pdf, 3 images". */
  attached?: string;
  unresolved?: string[];
  error?: boolean;
}

interface StaleResult {
  rebased: EmailDocument | null;
  reason: string;
  summary: string;
}

const EXAMPLES = [
  "Create an internal announcement with a hero, intro, and CTA.",
  "Reduce the padding around the headline.",
  "Move the CTA above the image.",
  "Shorten the body copy.",
];

export function AiPanel() {
  const config = useConfig();
  const { state, change, assets, refreshAssets } = useEditor();
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState<StaleResult | null>(null);
  const [comp, setComp] = useState<CompAttachment | null>(null);
  const [images, setImages] = useState<EmailImageAttachment[]>([]);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  if (!config.ai.enabled) {
    return (
      <div className="space-y-2 p-4 text-sm text-neutral-600">
        <div className="flex items-center gap-2 font-medium text-neutral-800">
          <Sparkles className="size-4" /> AI assistant unavailable
        </div>
        <p>{config.ai.reason}</p>
        <p className="text-xs text-neutral-500">Nothing here is simulated: with AI off, use the Modules tab to build the email manually.</p>
      </div>
    );
  }

  async function send(text: string) {
    const sentImages = images;
    const instruction =
      text.trim() || (comp ? "Build this email from the attached comp." : sentImages.length ? "Place the uploaded images where they fit." : "");
    if (!instruction || pending) return;
    const attached = [comp?.name, sentImages.length ? `${sentImages.length} image${sentImages.length === 1 ? "" : "s"}` : null].filter(Boolean).join(", ");
    const requestVersion = state.version;
    const history = chat.filter((c) => !c.error).map(({ role, text }) => ({ role, text }));
    setChat((c) => [...c, { role: "user", text: instruction, attached: attached || undefined }]);
    setInput("");
    setStale(null);
    setPending(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: state.doc,
          instruction,
          history,
          reference: comp?.base64,
          images: sentImages.map(({ assetId, name, width, height }) => ({ assetId, name: name.slice(0, 120), width, height })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string[];
        document?: EmailDocument;
        operations?: Operation[];
        summary?: string;
        unresolved?: string[];
        images?: AvailableImage[];
      };
      if (!res.ok || !body.document || !body.operations) {
        const msg = body.error ?? `AI request failed (${res.status}).`;
        setChat((c) => [...c, { role: "assistant", text: body.details?.length ? `${msg}\n${body.details.slice(0, 3).join("\n")}` : msg, error: true }]);
        return;
      }
      const summary = body.summary || "Updated the email.";
      const now = latest.current;
      const resolution = resolveAiResult({
        requestVersion,
        currentVersion: now.version,
        currentDoc: now.doc,
        resultDoc: body.document,
        operations: body.operations,
        images: body.images,
      });
      // Placed images are used up; the comp stays so follow-up requests can still refer to it.
      setImages((list) => list.filter((x) => !sentImages.includes(x)));
      if (resolution.kind === "apply") {
        const doc = body.document;
        change(() => doc);
        setChat((c) => [...c, { role: "assistant", text: summary, unresolved: body.unresolved }]);
        if (body.operations.length) toast.success("AI changes applied. Use Undo to revert.");
      } else {
        setStale({ rebased: resolution.rebased, reason: resolution.reason, summary });
        setChat((c) => [...c, { role: "assistant", text: `${summary} (not applied yet: ${resolution.reason})`, unresolved: body.unresolved }]);
      }
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", text: (e as Error).message, error: true }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {chat.length === 0 && (
          <div className="space-y-2 text-sm text-neutral-600">
            <p>Describe the email, or ask for a change. The AI can only use this brand&apos;s modules and settings, and won&apos;t invent URLs, claims or images.</p>
            <div className="space-y-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} className="block w-full rounded-md border px-2 py-1.5 text-left text-xs hover:border-neutral-400" onClick={() => setInput(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((c, i) => (
          <div key={i} className={`rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${c.role === "user" ? "ml-6 bg-neutral-900 text-white" : c.error ? "mr-6 bg-red-50 text-red-800" : "mr-6 bg-neutral-100"}`}>
            {c.text}
            {c.attached && <div className="mt-1 text-[11px] opacity-70">Attached: {c.attached}</div>}
            {c.unresolved && c.unresolved.length > 0 && (
              <div className="mt-2 border-t border-neutral-200 pt-1.5 text-xs text-amber-800">
                Still needed:
                <ul className="list-disc pl-4">
                  {c.unresolved.map((u, j) => (
                    <li key={j}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {stale && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">AI result not applied</p>
            <p className="mt-1 text-xs">{stale.reason} Your edits were kept.</p>
            <div className="mt-2 flex gap-2">
              {stale.rebased && (
                <Button
                  size="sm"
                  onClick={() => {
                    const doc = stale.rebased!;
                    change(() => doc);
                    setStale(null);
                    toast.success("AI changes applied on top of your edits.");
                  }}
                >
                  Apply on top of my edits
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setStale(null)}>
                Discard
              </Button>
            </div>
          </div>
        )}
        {pending && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 className="size-3.5 animate-spin" /> Working… You can keep editing; conflicting results won&apos;t be applied silently.
          </div>
        )}
      </div>
      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <AiAttachments assets={assets} comp={comp} images={images} onComp={setComp} onImages={setImages} onUploaded={refreshAssets} />
        <Textarea
          value={input}
          maxLength={4000}
          placeholder={comp ? "Optional: anything to change from the comp…" : state.doc.modules.length ? "Ask for a change…" : "Describe the email you need…"}
          className="min-h-20 text-sm"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-neutral-400">{config.ai.model} · ⌘↵ to send</span>
          <Button size="sm" type="submit" disabled={pending || (!input.trim() && !comp && images.length === 0)}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Send
          </Button>
        </div>
      </form>
    </div>
  );
}
