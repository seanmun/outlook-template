"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiAttachments, type CompAttachment, type EmailImageAttachment } from "@/components/editor/ai-attachments";
import { TemplateTile, useTemplates } from "@/components/library";
import { setAiHandoff } from "@/lib/client/ai-handoff";
import { useConfig } from "@/lib/client/config";
import { storesFor } from "@/lib/client/stores";
import { DEFAULT_BRAND_ID } from "@/lib/email/brands";
import { newEmailDocument } from "@/lib/email/starter";
import { emailFromTemplate } from "@/lib/email/templates";

/** How many templates show before "View more". */
const TEMPLATES_SHOWN = 3;

/**
 * "Describe it": a big open box for saying what the email should be, with places for a design
 * comp and pictures always in view. Sending it makes a new email and hands the request to the
 * AI assistant in the editor, which builds the first draft there.
 */
function DescribeIt() {
  const config = useConfig();
  const router = useRouter();
  const { drafts, assets } = useMemo(() => storesFor(config.mode), [config.mode]);
  const [text, setText] = useState("");
  const [comp, setComp] = useState<CompAttachment | null>(null);
  const [images, setImages] = useState<EmailImageAttachment[]>([]);
  const [starting, setStarting] = useState(false);

  const on = config.ai.enabled;
  // Why it is off, in plain words. The server's own reason is written for whoever runs the site.
  const signInFirst = !on && config.aiNeedsSignIn;
  const nothingToSend = !text.trim() && !comp && images.length === 0;

  async function build() {
    if (!on || starting || nothingToSend) return;
    setStarting(true);
    try {
      const email = await drafts.create({ ...newEmailDocument(DEFAULT_BRAND_ID), modules: [] });
      const instruction = text.trim() || (comp ? "Build this email from the attached comp." : "Place the uploaded images where they fit.");
      setAiHandoff(email.id, { instruction, comp, images });
      router.push(`/editor/${email.id}?panel=ai`);
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <section aria-labelledby="describe-heading" className="rounded-lg border-2 border-neutral-900 bg-white p-5 shadow-[5px_5px_0_0_#171717]">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-red-600" />
        <h1 id="describe-heading" className="text-lg font-semibold">
          Describe the email you need
        </h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">Say what it is for and who it is going to. AI builds a first draft you can then change by hand.</p>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void build();
        }}
      >
        <fieldset disabled={!on || starting} className="space-y-3 disabled:opacity-60">
          <Textarea
            aria-labelledby="describe-heading"
            value={text}
            maxLength={4000}
            rows={5}
            placeholder="For example: an invitation to our spring town hall on Thursday 14 May at 10:00 in the Atrium, with a button to save a seat."
            className="min-h-32 text-base"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void build();
              }
            }}
          />
          {/* Always in view: a comp for the AI to follow, and pictures for it to place. */}
          <AiAttachments assets={assets} comp={comp} images={images} onComp={setComp} onImages={setImages} onUploaded={() => {}} />
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            {on ? (
              "It only uses the blocks in this builder, and it will not make up links or facts."
            ) : signInFirst ? (
              <>
                <Link href="/sign-in" className="font-medium text-neutral-900 underline underline-offset-2">
                  Sign in
                </Link>{" "}
                to use AI. It is free. Everything below works without an account.
              </>
            ) : (
              "AI drafting is not switched on yet. It is coming soon. For now, start from a template below."
            )}
          </p>
          <Button type="submit" disabled={!on || starting || nothingToSend}>
            {starting ? <Loader2 className="animate-spin" /> : <Sparkles />} Build it
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Where an email starts: describe it to AI, pick a template, or begin blank. Existing emails are in the Library. */
export function Workspace() {
  const { list, starting, start } = useTemplates();
  const [showAll, setShowAll] = useState(false);
  const templates = list?.templates ?? [];
  const shown = showAll ? templates : templates.slice(0, TEMPLATES_SHOWN);
  const hidden = templates.length - shown.length;

  return (
    <>
      <DescribeIt />

      <section id="new-email" aria-labelledby="templates-heading" className="scroll-mt-6 rounded-lg border bg-white p-5">
        <h2 id="templates-heading" className="text-lg font-semibold">
          Or start from a template
        </h2>
        <p className="mt-1 text-sm text-neutral-500">Pick one to start from, or begin with a blank email. Everything can be changed once it opens.</p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <button
              disabled={!!starting}
              onClick={() => start("blank", newEmailDocument(DEFAULT_BRAND_ID))}
              className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition hover:border-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:opacity-60"
            >
              {starting === "blank" ? <Loader2 className="size-6 animate-spin text-neutral-500" /> : <Plus className="size-6 text-neutral-500" />}
              <span className="text-sm font-medium">Blank email</span>
              <span className="text-xs text-neutral-500">A heading, some text and a footer to build on.</span>
            </button>
          </li>
          {shown.map((t) => (
            <TemplateTile key={t.id} template={t} busy={!!starting} onStart={() => start(t.id, emailFromTemplate(t))} />
          ))}
        </ul>
        {!list && <p className="mt-3 text-sm text-neutral-500">Loading templates…</p>}
        {hidden > 0 && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => setShowAll(true)}>
              View more templates ({hidden} more) <ChevronDown />
            </Button>
          </div>
        )}
        <p className="mt-4 text-xs text-neutral-500">
          Made something you want to reuse? Open it and choose &ldquo;Save as template&rdquo;. Manage your templates in the{" "}
          <Link href="/library/templates" className="underline underline-offset-2 hover:text-neutral-900">
            Library
          </Link>
          .
        </p>
      </section>

      <Link href="/library" className="flex items-center justify-between gap-3 rounded-lg border bg-white p-5 transition hover:border-neutral-900">
        <span>
          <span className="block text-lg font-semibold">Library</span>
          <span className="mt-1 block text-sm text-neutral-500">Reopen an email, or see your templates, saved blocks and images.</span>
        </span>
        <ArrowRight className="size-5 shrink-0 text-neutral-500" />
      </Link>
    </>
  );
}
