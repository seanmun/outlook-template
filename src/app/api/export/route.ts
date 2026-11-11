import { exportForDemo, exportForUser } from "@/lib/server/handlers";
import { appMode } from "@/lib/server/config";
import { productionContext, readJson } from "@/lib/server/context";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await readJson(req);
  if (appMode() === "demo") return exportForDemo(body);
  const ctx = await productionContext();
  if (ctx instanceof Response) return ctx;
  return ctx.userId ? exportForUser(ctx, body) : exportForDemo(body);
}
