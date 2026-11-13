import "server-only";
import { auth } from "@clerk/nextjs/server";
import { appMode } from "./config";
import { TEAMS_ENABLED } from "@/lib/teams";
import { errorResponse, type HandlerContext } from "./handlers";
import { SupabaseAssetRepo, SupabaseEmailRepo, SupabasePresenceRepo, SupabaseSavedModuleRepo, SupabaseTemplateRepo, supabaseForUser } from "./supabase-repo";

/** Builds the per-request context in production mode. Returns a Response when the request cannot proceed. */
export async function productionContext(): Promise<HandlerContext | Response> {
  if (appMode() !== "production") {
    return errorResponse(404, "Server persistence is not configured; the app is running in local demo mode.");
  }
  const { userId, orgId, getToken } = await auth();
  const db = supabaseForUser(() => getToken());
  // The team space is whichever organization the person's Clerk session is currently in. Clerk only
  // puts an organization in a session for its members, and the database checks the same id again.
  return { userId: userId ?? null, workspaceId: TEAMS_ENABLED ? (orgId ?? null) : null, emails: new SupabaseEmailRepo(db), assets: new SupabaseAssetRepo(db), savedModules: new SupabaseSavedModuleRepo(db), templates: new SupabaseTemplateRepo(db), presence: new SupabasePresenceRepo(db) };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
