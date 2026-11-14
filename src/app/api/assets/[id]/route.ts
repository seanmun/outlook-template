import { deleteAsset, readAsset } from "@/lib/server/handlers";
import { productionContext } from "@/lib/server/context";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : readAsset(ctx, (await params).id);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : deleteAsset(ctx, (await params).id);
}
