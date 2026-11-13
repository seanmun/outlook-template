import { leavePresence, touchPresence } from "@/lib/server/handlers";
import { productionContext, readJson } from "@/lib/server/context";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : touchPresence(ctx, (await params).id, await readJson(req));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : leavePresence(ctx, (await params).id);
}
