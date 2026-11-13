import { copyToLibrary, errorResponse, type CopyTarget } from "@/lib/server/handlers";
import { productionContext, readJson } from "@/lib/server/context";
import { SupabaseAssetRepo, SupabaseEmailRepo, SupabaseSavedModuleRepo, SupabaseTemplateRepo, supabaseForUser } from "@/lib/server/supabase-repo";
import { TEAMS_ENABLED } from "@/lib/teams";

/**
 * Copies one thing from the Library the person is in to another of theirs.
 *
 * Into their own Library: the database lets a person write their own personal rows whichever
 * Library their session is in, so the same sign-in is used.
 *
 * Into a team space: the browser asks Clerk for a short-lived token for that team (Clerk only
 * issues one to a member) and sends it along. The copy is written with that token, so it is the
 * database, not this code, that decides whether the person may write there.
 */
export async function POST(req: Request) {
  if (!TEAMS_ENABLED) return errorResponse(404, "Not found.");
  const ctx = await productionContext();
  if (ctx instanceof Response) return ctx;
  if (!ctx.userId) return errorResponse(401, "Sign in required.");
  const body = (await readJson(req)) as { target?: unknown; targetToken?: unknown } | null;
  const team = body?.target ?? null;

  let target: CopyTarget;
  if (team === null) {
    target = { scope: { userId: ctx.userId, workspaceId: null }, emails: ctx.emails, assets: ctx.assets, savedModules: ctx.savedModules, templates: ctx.templates };
  } else {
    if (typeof team !== "string" || !/^org_[A-Za-z0-9]{1,60}$/.test(team)) return errorResponse(400, "Unknown team space.");
    const token = body?.targetToken;
    if (typeof token !== "string" || token.length < 20 || token.length > 8000) return errorResponse(400, "Missing permission for that team space. Reload the page and try again.");
    const db = supabaseForUser(async () => token);
    target = {
      scope: { userId: ctx.userId, workspaceId: team },
      emails: new SupabaseEmailRepo(db),
      assets: new SupabaseAssetRepo(db),
      savedModules: new SupabaseSavedModuleRepo(db),
      templates: new SupabaseTemplateRepo(db),
    };
  }

  try {
    return await copyToLibrary(ctx, body, target);
  } catch (e) {
    // Most likely the database refusing the write: the token was not for that team, or has expired.
    console.error("copy failed", e);
    return errorResponse(403, "That could not be copied. Check you are still a member of that team space, then reload and try again.");
  }
}
