# Outlook Template Builder

An app for assembling branded internal emails from a fixed set of modules per
brand. You can describe the email to AI, refine it in a visual editor, and
download a ZIP containing an Outlook template (`.oft`) and instructions.

It is a constrained module assembler, not a freeform email designer.

> **Status:** MVP. The `.oft` export is implemented and passes structural
> checks, but **has not yet been opened in Outlook**. The Mac `.emltpl` export
> is disabled pending a real Mac-created sample. See [docs/EXPORT.md](docs/EXPORT.md)
> and [docs/OUTLOOK-TEST-CHECKLIST.md](docs/OUTLOOK-TEST-CHECKLIST.md).

## Quick start (local demo mode)

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

With no credentials, the app runs in **local demo mode**, shown by a banner on
every page:

- No sign-in. Drafts are stored in `localStorage` and images in IndexedDB, in
  this browser only.
- **AI is off.** The panel says so and does not simulate anything. To try AI
  locally, set `ANTHROPIC_API_KEY` and `DEMO_ALLOW_AI=true`. That makes
  unauthenticated AI calls, so use it for local development only.
- **Export works,** using the same exporter code as production. The OFT is
  generated for real, not mocked. Its Outlook verification status is shown
  honestly in the export dialog and the ZIP README.
- The three brands are **fictional samples** ("Harbor & Pine", "Lumen Labs",
  "Copperfield Group"), labelled as such, with placeholder copy and generated
  gradient images.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm check` | typecheck + lint + tests |
| `pnpm test` | Vitest (74 tests) |
| `pnpm export:samples` | Writes sample `.oft`, `*.UNVERIFIED.emltpl` and HTML to `export-samples/` for manual Outlook testing |
| `python scripts/verify_msg.py <file.oft>` | Independent structural check (needs `pip install olefile extract_msg`) |

## Production setup

Production mode turns on when **both** Clerk and Supabase are configured.

1. **Supabase**
   - Create a project.
   - Run `supabase/migrations/20261106000000_init.sql`, using `supabase db push`
     or the SQL editor. It creates:
     - the `emails` and `assets` tables, with RLS so each user sees only their
       own rows;
     - the private `email-assets` storage bucket, with policies limiting each
       user to their own folder.
   - Add **Clerk as a third-party auth provider**: Supabase dashboard →
     Authentication → Sign In / Providers → Third-party → Clerk.
2. **Clerk**
   - Create an application.
   - Enable the **Supabase integration** (Clerk dashboard → Integrations →
     Supabase). This adds the `role: authenticated` claim to session tokens.
3. **Environment.** Copy `.env.example` to `.env.local` (or set these in Vercel):
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This is the
     anon/publishable key. **No service-role key is used anywhere.**
   - `ANTHROPIC_API_KEY`, plus optionally `ANTHROPIC_MODEL` (defaults to
     `claude-opus-5-5`).
4. **Deploy** to Vercel as a standard Next.js app. The export function runs in
   about a second. The AI route sets `maxDuration = 120`.

### How authorization works

- `src/proxy.ts` (Clerk) protects pages. Every API route also checks the
  session itself and returns 401.
- Server code talks to Supabase **as the signed-in user**, using the Clerk
  session token. Postgres RLS and Storage policies enforce ownership in the
  database, and queries also filter on `owner_id` as defence in depth.
- Saving or exporting a document that references an image the user does not
  own is rejected with 400.
- Other users' emails and assets return 404, not 403.
- Saves use a `revision` number, so two tabs cannot silently overwrite each
  other (409).

## Architecture

```
src/lib/email/      document schema, brands, module registry, shared renderer, issues, operations
  modules/          header, hero, text, cta, footer (+ brand-specific renderer example)
src/lib/export/     CFB + MS-OXMSG writer (OFT), MIME writer (EMLTPL), exporter registry, ZIP pipeline
src/lib/ai/         prompt (brand + module specs, no HTML), structured output, validate/retry loop
src/lib/server/     mode/config, request handlers (auth rules), Supabase + in-memory repos
src/lib/editor/     pure editor state: undo/redo, module ops, stale-AI resolution
src/components/editor/  top bar, AI panel, modules panel (dnd-kit), iframe preview, inspector (Tiptap)
supabase/migrations/    schema, RLS, storage policies
```

**Email documents** are stored as structured JSON: schema version, brand,
title, subject, and an ordered list of module instances, each with a stable ID,
content and settings. Arbitrary HTML is never stored. Each module's content and
settings are validated by that module's Zod schema.

**One renderer** (`src/lib/email/render.ts`) produces the HTML for both the
preview iframe and every exporter. The rules:

- Table layout, inline styles only, explicit image dimensions, 600px fixed
  width.
- Spacing lives on `<td>` padding. Paragraph margins are explicit.
- No head styles, classes, media queries, JavaScript, web fonts, flex or grid.
  Tests enforce this.
- The `<head>` is treated as disposable.
- The preview adds `data-module-id` attributes for click-to-select. Export
  never does.

**Rich text** is a restricted Tiptap editor (bold, italic, link, bullets). Its
JSON is sanitized into a small schema, and the renderer writes controlled
email markup from that, never editor HTML. Pasted content is reduced to the
same subset. Links must be absolute `https`, `http` or `mailto`. All text is
escaped.

**Adding a module:**

1. Create `src/lib/email/modules/<name>.ts` with `defineModule({...})`. Give it a
   Zod schema, defaults per brand, field specs, and a renderer.
2. Add it to `MODULES` in `registry.ts`.
3. List its type in the brands that may use it, in `brands.ts`.

Use `brands: [...]` to restrict a module to some brands, and `renderers: {
brandId: fn }` when a brand needs a different layout (see the Copperfield
header).

**Adding a real brand:** add a `Brand` in `brands.ts` with web-safe fonts, a
palette and a voice, and set `isSample: false`.

### AI behaviour

- The model receives the brand's settings and module field specs (keys, types,
  limits, defaults) and a compact view of the current email. It never receives
  module HTML.
- It returns **operations** (add, update, move, remove, set subject) that
  reference modules by stable ID, through structured outputs. Each operation is
  validated against the module schemas and applied atomically: everything
  applies or nothing does.
- On validation failure, the errors are sent back for one retry.
- Untouched modules and fields are preserved by construction.
- The AI cannot set image sources. It is told to use `[[PLACEHOLDER: …]]`
  instead of inventing facts, URLs or claims, and those placeholders are
  flagged in the editor and before export.
- **Stale results:** if you edit while a request runs, the result is *not*
  applied. You choose between "Apply on top of my edits" (operations re-applied
  to the current document and re-validated) and "Discard". Every AI change is a
  single undo step.
- The model is `ANTHROPIC_MODEL` (default `claude-opus-5-5`) at effort
  `medium`. Server-side refusal fallback is enabled for supported models; set
  `ANTHROPIC_FALLBACKS=off` to disable it.

## What was tested

- **Automated (`pnpm test`, 74 tests):**
  - HTML escaping and unsafe links (`javascript:`, `data:`, credentials,
    control characters);
  - hostile pasted rich text;
  - email-safe HTML rules;
  - invalid AI output (malformed JSON, unknown fields or modules, HTML
    injection, image-source attempts) with the retry and atomicity;
  - stale AI results and rebase;
  - module ordering, duplication, serialization round-trip, and undo/redo
    coalescing;
  - unauthorized access (401 / 404 / foreign-asset references / revision
    conflicts);
  - upload type and size validation;
  - unavailable or unknown exporters, missing images and non-image bytes;
  - CFB/MSG output read back by SheetJS `cfb` and `@kenjiuno/msgreader`;
  - MIME structure.
- **Python structural checks** (`olefile` strict mode, red-black tree
  invariants, `extract_msg`) on every sample OFT and on OFTs downloaded through
  the running app.
- **Browser run (headless Chromium) of the production build in demo mode:**
  - create from sample, select from the preview, edit text;
  - typing, bold, and a hostile paste;
  - upload and replace an image, alt text;
  - padding, undo/redo;
  - add, duplicate and drag-reorder modules;
  - autosave, then reload with persistence intact;
  - export with placeholder acknowledgement and ZIP download.

  No console errors.

## Not tested / requires

- **Outlook itself:** no file has been opened in any Outlook app. Use
  [docs/OUTLOOK-TEST-CHECKLIST.md](docs/OUTLOOK-TEST-CHECKLIST.md).
- **A real Outlook for Mac `.emltpl` sample** before the Mac exporter can be
  validated and enabled.
- **Production services:** the Clerk + Supabase path (RLS policies, storage
  policies, third-party auth) has not been run against live services. It is
  covered by unit tests against an in-memory store with the same ownership
  rules.
- **The live Anthropic API:** the AI loop is tested with a scripted model. Run
  a few real prompts once a key is set.
- **Real brand assets and approved module HTML,** to replace the fictional
  samples.

## Known limitations

- Fixed 600px layout, not responsive. Phones generally scale it down.
- Rounded button corners render square in Windows Outlook. There is no VML.
- Dark mode is up to each client.
- The OFT size cap is about 6.8 MB, and image uploads are capped at 5 MB. Only
  PNG, JPEG and GIF are accepted.
- Saving is last-write-wins within a tab, with 409 conflict detection across
  tabs. There is no collaboration.
- AI chat history is per session and not saved.
- In demo mode, export posts image bytes with the request, so very large demo
  images can hit the platform request-size limit (4.5 MB on Vercel).
