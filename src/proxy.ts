import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

const clerkConfigured = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// No page requires sign-in: signed-out visitors use the app with browser-only storage.
// Sign-in adds cloud drafts and AI; those API routes check auth themselves.
const withClerk = clerkMiddleware();

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // Demo mode (Clerk or Supabase missing): no auth layer at all.
  if (!clerkConfigured || !supabaseConfigured) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
