import { z } from "zod";
import { alertError } from "@/lib/server/alerts";
import { readJson } from "@/lib/server/context";
import { SupportLimiter } from "@/lib/server/support";

const Body = z.object({ message: z.string().max(2000), page: z.string().max(300).optional(), reference: z.string().max(100).optional() });

// Anyone can post here (a page that crashed cannot prove who it is), so each visitor is held to a few reports.
const limiter = new SupportLimiter(3, 10, 60);

/** A page crashed in someone's browser and reports it, so the maintainer hears about it. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  const who = req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (parsed.success && limiter.take(who)) {
    const { message, page, reference } = parsed.data;
    await alertError({ kind: "browser", message, where: page, details: reference ? `Reference ${reference}` : undefined });
  }
  return new Response(null, { status: 204 });
}
