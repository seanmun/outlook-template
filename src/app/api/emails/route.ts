import { createEmail, listEmails } from "@/lib/server/handlers";
import { productionContext, readJson } from "@/lib/server/context";

export async function GET() {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : listEmails(ctx);
}

export async function POST(req: Request) {
  const ctx = await productionContext();
  return ctx instanceof Response ? ctx : createEmail(ctx, await readJson(req));
}
