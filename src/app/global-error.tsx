"use client"; // Error boundaries must be Client Components
import { useEffect } from "react";
import { reportPageError } from "@/lib/client/report-error";

/** Shown only when the outer frame of the site itself fails, so it carries its own page and plain styles. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportPageError(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif", background: "#fafafa", color: "#171717" }}>
        <title>Something went wrong | OUTLOOKSUCKS.email</title>
        <main style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "#404040" }}>The site hit a problem. It has been reported. Your saved emails are not affected.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#171717", color: "#fff", border: 0, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>{" "}
          {/* A full page load on purpose: the app's own navigation is what just failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ marginLeft: 12, fontSize: 14, color: "#171717" }}>
            Home page
          </a>
        </main>
      </body>
    </html>
  );
}
