import "server-only";
import { auth } from "@clerk/nextjs/server";
import { appMode } from "./config";
import { errorResponse, type HandlerContext } from "./handlers";
import { SupabaseAssetRepo, SupabaseEmailRepo, SupabaseSavedModuleRepo, SupabaseTemplateRepo, supabaseForUser } from "./supabase-repo";

/** Builds the per-request context in production mode. Returns a Response when the request cannot proceed. */
export async function productionContext(): Promise<HandlerContext | Response> {
  if (appMode() !== "production") {
    return errorResponse(404, "Server persistence is not configured; the app is running in local demo mode.");
  }
  const { userId, getToken } = await auth();
  const db = supabaseForUser(() => getToken());
  return { userId: userId ?? null, emails: new SupabaseEmailRepo(db), assets: new SupabaseAssetRepo(db), savedModules: new SupabaseSavedModuleRepo(db), templates: new SupabaseTemplateRepo(db) };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
