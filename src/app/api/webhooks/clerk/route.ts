import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { alertSignup } from "@/lib/server/alerts";

/**
 * Clerk calls this when an account is created. The request is signed by Clerk and checked against
 * CLERK_WEBHOOK_SIGNING_SECRET, so nobody else can post fake sign-ups here.
 */
export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch {
    return new Response("Not a signed Clerk request.", { status: 400 });
  }
  if (event.type === "user.created") {
    const user = event.data;
    const email = user.email_addresses?.find((e) => e.id === user.primary_email_address_id)?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
    const provider = user.external_accounts?.[0]?.provider?.replace(/^oauth_/, "") ?? null;
    await alertSignup({ email, name, method: provider ?? "email" });
  }
  return new Response("ok");
}
