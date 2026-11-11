# Auth setup failures (2026-11-10)

What went wrong while connecting Clerk and Supabase, and what was fixed. Written by the assistant (Claude); these were its mistakes.

## Failures

1. **Every page required sign-in.**
   - `src/proxy.ts` protected every route, so the marketing home page and the editor redirected to sign-in.
   - The product is meant to be usable without an account, and I chose lock-everything as the default without asking.
   - I added the marketing home page later and never revisited this.
2. **No sign-up page.**
   - The app only had `/sign-in`, so new users had no proper way to create an account.
   - I should have built `/sign-up` alongside `/sign-in` from the start.
3. **Told you to enable Clerk's "Email verification link".**
   - With both link and code enabled, Clerk's sign-up sends a link.
   - On the localhost development instance, opening that link failed with `client_mismatch` ("Verification link is invalid for this device"), even in the same browser.
   - Code-only verification would have avoided this.
4. **Misdiagnosed the link error several times.**
   - I said you were probably in a different browser, then sent you to dashboard settings I wasn't sure existed, including the Google SSO toggle, which you couldn't find.
   - Meanwhile the repeated attempts tripped Clerk's rate limit: "Too many verification code requests".
5. **Too many steps at once.**
   - I gave long multi-step lists after you'd asked for one step at a time.
6. **Broke the home page mid-fix.**
   - I used `<SignedIn>` / `<SignedOut>`, which Clerk Core 3 (`@clerk/nextjs` 7.x) removed.
   - The home page returned a 500 error until I replaced them.
7. **Wasted tokens and time.**
   - I re-read files and searched the transcript while you were blocked, instead of fixing the problem directly.

## Fixed (uncommitted)

- **Login is optional** (`src/proxy.ts`). No page requires sign-in.
- **Signed-out visitors can use the whole app.**
  - Drafts and images are stored in the browser, and export works.
  - A banner offers sign-in, which adds cloud drafts and AI.
  - AI requires sign-in, because it bills the app's Anthropic key.
- **The export API serves signed-out visitors** (`src/app/api/export/route.ts`), using images the browser sends.
- **New `/sign-up` page** (`src/app/sign-up/[[...sign-up]]/page.tsx`), plus **Sign in** and **Sign up** links in the header.
- **Checks pass:** typecheck, lint, and all 75 tests. The home, editor and sign-up pages each load (HTTP 200) without login.

## Follow-up (same day, later session)

- **Item 3 was wrong about the cause.** Email links are fine and are enabled again. The `client_mismatch` error most likely came from Clerk's "Require the same device and browser" setting on the localhost development instance, which is now off.
- **Sign-up works.** After the email link was opened, the Clerk sign-up and sign-in forms bounced an already-signed-in visitor between `/sign-up` and `/sign-in` forever. Both pages now redirect signed-in visitors to `/` on the server.
- **The app no longer waits on Clerk's browser script.** The server decides signed-in vs signed-out and renders the header and workspace directly.

## Still open

- **Guest drafts:** they don't move to your account when you sign in.
- **Production Clerk instance:** not created yet.
