import { submitSupport, supportTelegram } from "@/lib/server/support";
import { readJson } from "@/lib/server/context";

export const maxDuration = 30;

/** Open to everyone, signed in or not: someone locked out must still be able to ask for help. */
export async function POST(req: Request) {
  const who = req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return submitSupport(await readJson(req), { telegram: supportTelegram(), who, browser: req.headers.get("user-agent") ?? undefined });
}
