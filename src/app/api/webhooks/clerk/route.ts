import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { alertSignup, alertVerificationEmail } from "@/lib/server/alerts";

/**
 * Clerk calls this when an account is created and when it sends an email. The request is signed by
 * Clerk and checked against CLERK_WEBHOOK_SIGNING_SECRET, so nobody else can post fake sign-ups here.
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
    const name = user.first_name || null;
    const provider = user.external_accounts?.[0]?.provider?.replace(/^oauth_/, "") ?? null;
    await alertSignup({ email, name, method: provider ?? "email" });
  }
  if (event.type === "email.created") {
    const e = event.data;
    await alertVerificationEmail({ slug: e.slug, to: e.to_email_address, userId: e.user_id, status: e.status, deliveredByClerk: e.delivered_by_clerk, suppressionReason: e.suppression_reason });
  }
  return new Response("ok");
}
