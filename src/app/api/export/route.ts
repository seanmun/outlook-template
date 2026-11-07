import { exportForDemo, exportForUser } from "@/lib/server/handlers";
import { appMode } from "@/lib/server/config";
import { productionContext, readJson } from "@/lib/server/context";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await readJson(req);
  if (appMode() === "demo") return exportForDemo(body);
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : exportForUser(ctx, body);
}
