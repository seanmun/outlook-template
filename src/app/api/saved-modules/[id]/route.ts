import { deleteSavedModule } from "@/lib/server/handlers";
import { productionContext } from "@/lib/server/context";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : deleteSavedModule(ctx, (await params).id);
}
