"use client"; // Error boundaries must be Client Components
import { useEffect } from "react";
import Link from "next/link";
import { reportPageError } from "@/lib/client/report-error";

export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportPageError(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-start justify-center px-6 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-neutral-900 uppercase">Something went wrong</h1>
      <p className="mt-4 text-base leading-relaxed text-neutral-700">This page hit a problem. It has been reported. Your saved emails are not affected.</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => retry()} className="bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
          Try again
        </button>
        <Link href="/" className="text-sm font-medium text-neutral-900 underline underline-offset-2">
          Home page
        </Link>
        <Link href="/support" className="text-sm font-medium text-neutral-900 underline underline-offset-2">
          Get help
        </Link>
      </div>
    </main>
  );
}
