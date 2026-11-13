"use client";
import Link from "next/link";
import { ArrowRight, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateTile, useTemplates } from "@/components/library";
import { useConfig } from "@/lib/client/config";
import { DEFAULT_BRAND_ID } from "@/lib/email/brands";
import { newEmailDocument } from "@/lib/email/starter";
import { emailFromTemplate } from "@/lib/email/templates";

/** Where an email starts: a blank one, or one of the person's templates. Existing emails are in the Library. */
export function Workspace() {
  const config = useConfig();
  const { list, starting, start } = useTemplates();

  return (
    <>
      <section id="new-email" className="scroll-mt-6 rounded-lg border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Start an email</h1>
            <p className="mt-1 text-sm text-neutral-500">Pick a template to start from, or begin with a blank email. Everything can be changed once it opens.</p>
          </div>
          {/* Only offered when AI is switched on for this visitor; otherwise it is not mentioned at all. */}
          {config.ai.enabled && (
            <Button disabled={!!starting} onClick={() => start("ai", { ...newEmailDocument(DEFAULT_BRAND_ID), modules: [] }, "?panel=ai")}>
              <Sparkles /> Describe it to AI
            </Button>
          )}
        </div>

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
          {list?.templates.map((t) => (
            <TemplateTile key={t.id} template={t} busy={!!starting} onStart={() => start(t.id, emailFromTemplate(t))} />
          ))}
        </ul>
        {!list && <p className="mt-3 text-sm text-neutral-500">Loading templates…</p>}
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
