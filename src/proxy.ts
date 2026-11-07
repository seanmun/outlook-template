import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

const clerkConfigured = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const isPublic = createRouteMatcher(["/sign-in(.*)", "/api/config"]);

const withClerk = clerkMiddleware(async (auth, req) => {
  // Pages redirect to sign-in; API routes also check auth themselves and return 401.
  if (!isPublic(req) && !req.nextUrl.pathname.startsWith("/api/")) await auth.protect();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // Demo mode (Clerk or Supabase missing): no auth layer at all.
  if (!clerkConfigured || !supabaseConfigured) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
