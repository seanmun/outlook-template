"use client";
import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { TEAMS_ENABLED } from "@/lib/teams";
import { useConfig } from "@/lib/client/config";

export function DemoBanner() {
  const { mode, missing, authAvailable, ready } = useConfig();
  if (mode !== "demo" || !ready) return null;
  if (authAvailable)
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
        <strong>Not signed in.</strong> Everything works; drafts and images are saved in this browser only.{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>{" "}
        to save to your account and use AI.
      </div>
    );
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
      <strong>No account needed.</strong> Your drafts and images are saved in this browser only.
      {/* Setup details are for whoever runs the app locally, never for visitors. */}
      {process.env.NODE_ENV === "development" && missing.length > 0 && <> Developer note: accounts are off because {missing.join(", ")} {missing.length === 1 ? "is" : "are"} not set. See README.</>}
    </div>
  );
}

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { mode, authAvailable, ready } = useConfig();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-white px-4">
      <Link href="/" aria-label="OUTLOOKSUCKS.email home" className="group flex shrink-0 items-baseline font-[family-name:var(--font-display)] text-lg leading-none">
        <span className="text-neutral-900">OUTLOOK</span>
        <span className="inline-block -rotate-3 text-red-600 transition-transform duration-200 group-hover:rotate-3 group-hover:scale-110">SUCKS</span>
        <span className="ml-0.5 font-sans text-xs font-semibold text-neutral-400">.email</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {!children && (
        <>
          <Link href="/guides" className="hidden text-sm font-medium text-neutral-700 hover:text-neutral-900 sm:inline">
            Guides
          </Link>
          <Link href="/library" className="text-sm font-medium text-neutral-700 hover:text-neutral-900">
            Library
          </Link>
        </>
      )}
      {/* Signed in: switch between your own Library and a team space, create a team, or invite people. */}
      {/* Not in the editor (which passes its own controls as children): its top bar has no room, and switching there would close the email. */}
      {TEAMS_ENABLED && !children && ready && mode === "production" && (
        <OrganizationSwitcher
          hidePersonal={false}
          afterSelectOrganizationUrl="/library"
          afterSelectPersonalUrl="/library"
          afterCreateOrganizationUrl="/library"
          afterLeaveOrganizationUrl="/library"
        />
      )}
      {ready && mode === "production" && <UserButton />}
      {ready && mode === "demo" && authAvailable && (
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm font-medium text-neutral-700 hover:text-neutral-900">
            Sign in
          </Link>
          <Link href="/sign-up" className=" bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800">
            Sign up
          </Link>
        </div>
      )}
    </header>
  );
}
