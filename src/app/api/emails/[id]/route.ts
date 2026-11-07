import { deleteEmail, getEmail, updateEmail } from "@/lib/server/handlers";
import { productionContext, readJson } from "@/lib/server/context";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : getEmail(ctx, (await params).id);
}

export async function PUT(req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : updateEmail(ctx, (await params).id, await readJson(req));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : deleteEmail(ctx, (await params).id);
}
