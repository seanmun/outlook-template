import { createSavedModule, listSavedModules } from "@/lib/server/handlers";
import { productionContext, readJson } from "@/lib/server/context";

export async function GET() {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : listSavedModules(ctx);
}

export async function POST(req: Request) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : createSavedModule(ctx, await readJson(req));
}
