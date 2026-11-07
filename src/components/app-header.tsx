"use client";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useConfig } from "@/lib/client/config";

export function DemoBanner() {
  const { mode, missing } = useConfig();
  if (mode !== "demo") return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
      <strong>Local demo mode.</strong> Drafts and images are stored only in this browser. No sign-in, no server storage.
      {missing.length > 0 && <> Missing configuration: {missing.join(", ")}.</>} See README for production setup.
    </div>
  );
}

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { mode } = useConfig();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        Outlook Template Builder
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {mode === "production" && <UserButton />}
    </header>
  );
}
