import type { Instrumentation } from "next";
import { alertError, errorText } from "@/lib/server/alerts";

/** Every error the server did not handle itself is reported to the maintainer's Telegram group. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : "";
  // The route's pattern, not the address asked for: an address can carry ids or tokens.
  await alertError({ kind: "server", message: errorText(err), where: `${request.method} ${context.routePath}`, details: digest ? `Reference ${digest}` : undefined });
};
