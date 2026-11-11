# AI cost and bring-your-own-key (BYOK): options

Written 2026-11-07, after reviewing <https://openbyo.ai/developers>, its privacy policy, and its terms.

## TL;DR

- **Our AI cost per request is already small**, and choosing a different model is the biggest lever we have. These are estimates, not measured against the live API:
  - Claude Opus 5.5 (current default): about $0.05–0.10 per request.
  - Claude Sonnet 5.5: about $0.02–0.05.
  - Claude Haiku 5.5: about $0.001–0.003.
- **OpenBYO is promising but not ready to be our only AI path.** It is in invite-only pre-launch beta and hasn't been audited. It speaks the OpenAI API format, not Anthropic's, and it doesn't document support for structured outputs. Client email drafts would also flow through another unaudited third party.
- **Most of our users probably don't have their own AI key.** They are agency clients writing internal emails. If AI requires bringing your own key, most people simply won't use AI.
- **Recommendation:**
  1. Cut our own cost now: run a model evaluation, add per-user caps, and turn on prompt caching.
  2. Build a pluggable "AI source" setting.
  3. Add bring-your-own Anthropic key as an option.
  4. Apply to OpenBYO and add it as a third source once it answers the open questions below.

## 1. What a request costs us today

Measured from `src/lib/ai/prompt.ts` with a sample email:

- **Input:** the system prompt (brand plus module specs) is about 8.8k characters and the user message about 2.5k, so roughly **3–4k input tokens**.
- **Output:** the operations JSON is about 0.3–1.5k tokens, plus adaptive thinking at `medium` effort, so roughly **1.5–4k output tokens**.
- **Retries:** one validation retry can roughly double the cost of that request.

| Model | Price (in / out per 1M tokens) | Est. per request | 1,000 requests |
|---|---|---|---|
| `claude-opus-5-5` (default) | $4 / $20 | ~$0.05–0.10 | ~$50–100 |
| `claude-sonnet-5-5` | $2 / $10 | ~$0.02–0.05 | ~$20–50 |
| `claude-haiku-5-5` | $0.10 / $0.50 | ~$0.001–0.003 | ~$1–3 |

Our task is tightly constrained: a fixed set of modules, schema-validated operations, and a retry on failure. A small model may well be good enough. **Measure before switching:**
1. Run ~20 realistic prompts per brand on each model.
2. Score each run on whether it passed validation on the first try, whether untouched modules stayed untouched, whether the copy quality is acceptable, and whether it used placeholders instead of inventing facts.

`ANTHROPIC_MODEL` already makes the model a one-line configuration change.

**Other cheap wins, all in our own code:**
- **Prompt caching:** the system prompt is identical for every request within a brand, so caching it makes those input tokens about 10× cheaper. Modest savings, since input is the smaller part of the cost.
- **Per-user caps:** a daily request limit per Clerk user, plus a global monthly budget alarm, so cost can't run away.
- **Lower effort for small edits:** "Move the CTA above the image" doesn't need the same thinking as "Write an announcement".

## 2. OpenBYO: what it is

From its developer page, privacy policy and terms:

- **How it works:** users sign in to OpenBYO, connect their own AI provider, and approve our app through an **OAuth 2.1 + PKCE** consent screen, choosing which connections and models we may use. We receive an access token and a refresh token, and call **one OpenAI-compatible endpoint** (`https://api.openbyo.ai/v1`) with the OpenAI SDK. **Users pay their own inference.**
- **Keys:** provider keys stay with OpenBYO, encrypted per user. We never hold them.
- **Data path:** requests go through OpenBYO's servers. They say they log metadata only (time, app, model, tokens, cost) and "never prompts or answers". Users can set budgets and revoke access.
- **Pricing for us:** free up to 1,000 monthly active users, then $0.05 per active user. The billing period isn't stated.
- **Maturity:** "pre-launch beta", "haven't been independently audited yet", access by invitation. There is no DPA, no SOC 2, no named legal entity, no SLA, and liability is capped at $100.

### How well it fits this app

| Question | Status |
|---|---|
| API format | **OpenAI-compatible**. We use Anthropic's Messages API with `output_config.format` (structured outputs). |
| Claude support | Anthropic is listed. The only example model is `claude-sonnet-4`; current Claude 5.x models aren't mentioned. |
| Structured outputs, JSON schema, streaming | **Not documented** |
| Effort, thinking | Not documented |
| Privacy | Email drafts (internal client comms) would pass through an unaudited beta service. They state bodies aren't logged. |
| User friction | Each user needs an OpenBYO account plus their own provider account and billing. |

**Engineering effort is moderate, because our design already isolates the model call.**
- `src/lib/ai/run.ts` takes a `ModelCaller`, so an `openbyoCaller` slots in without touching operations, validation or the editor.
- Every output is validated with Zod and retried on failure, so even if structured outputs aren't supported, "JSON in plain text, then validate" would work, just less reliably.
- New pieces: an OAuth connect flow, token storage per user (encrypted, in Supabase), refresh handling, and mapping our request to OpenAI's format.

## 3. Bring your own Anthropic key, without OpenBYO

The simplest form of BYOK:

- The user pastes an Anthropic API key in their settings.
- **The key stays in the user's browser.** It's sent with each AI request over HTTPS, used once on the server, and never stored or logged. Our server code changes by one line: `new Anthropic({ apiKey: userKey })`.
- **Everything else stays as is:** the same Anthropic SDK and structured outputs, with no format translation and no third party.
- **Downsides:**
  - A pasted key is broader than an OAuth token. The user should create a dedicated key with a spend limit in the Anthropic Console, and we should say so.
  - No per-app usage dashboard or revoke button. The user revokes in the Anthropic Console.
  - The key lives in browser storage, so it's per device, and readable by any script on our page (XSS risk). That makes the strict content security policy worth adding first.
- **Alternative:** store keys server-side, encrypted per user (Supabase plus a key-management service). That works across devices, but then we hold secrets, which is a bigger security and compliance burden. Not recommended for the MVP.

## 4. Recommended plan

1. **Now (low effort):**
   - Evaluate Opus vs Sonnet vs Haiku on our task and pick the cheapest model that passes.
   - Add prompt caching.
   - Add per-user daily caps and a monthly budget alert.
2. **Next:** add an "AI source" setting with these values:
   - **`app` (default):** our key, with the caps above.
   - **`byok-anthropic`:** the user's own key, sent per request and never stored, as in section 3.
   - **`openbyo`:** later, behind a feature flag.
3. **In parallel:** request OpenBYO access, and ask them:
   - Which Claude 5.x model IDs are supported?
   - Can we send requests in Anthropic's format (passthrough), or only OpenAI's?
   - Do they support `response_format` / JSON schema / structured outputs, and streaming?
   - What are the rate limits and token lifetimes, and what happens on a provider outage or an exhausted budget?
   - What exactly happens to prompt and response bodies in transit and in storage? Can they sign a DPA, and do they have a security roadmap?
   - How is an "active user" defined, and what is the billing period?
4. **Turn OpenBYO on** only once:
   - it's generally available;
   - it supports structured outputs, or our plain-JSON fallback passes the model evaluation;
   - we're comfortable with its privacy terms for client content.

## Decisions for you

- Should AI stay **free for users, paid by us with caps**, or be **BYOK-only**? Free with caps maximises adoption; BYOK-only minimises cost.
- Is it acceptable for **client email content to pass through a beta third party** (OpenBYO)?
- **How much cost is acceptable:** for example, about $5 per active user per month on Sonnet, versus near zero on Haiku if quality holds.
