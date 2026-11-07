import { readAsset } from "@/lib/server/handlers";
import { productionContext } from "@/lib/server/context";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : readAsset(ctx, (await params).id);
}
