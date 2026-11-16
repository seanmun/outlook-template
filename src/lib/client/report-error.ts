/** Tells the maintainer a page crashed. Best effort: it must never cause a second error. */
export function reportPageError(error: unknown) {
  try {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "Unknown error";
    const reference = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
    // An error with a reference came from the server, which has already reported it.
    if (reference) return;
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The page's path only: what comes after "?" can hold private details.
      body: JSON.stringify({ message: message.slice(0, 2000), page: location.pathname.slice(0, 300) }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Nothing more to do.
  }
}
