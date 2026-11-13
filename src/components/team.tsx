"use client";
import { useOrganization, useUser } from "@clerk/nextjs";

/**
 * Small pieces that read the active team from Clerk. Only render these when the person is in a
 * team space (config.workspaceId is set), which also means team spaces are switched on.
 */

/** The active team's name, as text. */
export function TeamName({ fallback = "your team" }: { fallback?: string }) {
  const { organization } = useOrganization();
  return <>{organization?.name ?? fallback}</>;
}

/** The name teammates see when this person has an email open. */
export function useMyName(): string {
  const { user } = useUser();
  return user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "A teammate";
}
