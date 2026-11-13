import { deleteTemplate, restoreDefaultTemplates } from "@/lib/server/handlers";
import { productionContext } from "@/lib/server/context";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/templates/<id> removes a template. DELETE /api/templates/hidden-defaults brings the starter templates back. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const ctx = await productionContext();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  return id === "hidden-defaults" ? restoreDefaultTemplates(ctx) : deleteTemplate(ctx, id);
}
