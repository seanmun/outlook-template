import { createTemplate, listTemplates } from "@/lib/server/handlers";
import { productionContext, readJson } from "@/lib/server/context";

export async function GET() {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : listTemplates(ctx);
}

export async function POST(req: Request) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : createTemplate(ctx, await readJson(req));
}
