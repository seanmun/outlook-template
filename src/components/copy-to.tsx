"use client";
import { useState } from "react";
import { useOrganizationList, useSession } from "@clerk/nextjs";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfig } from "@/lib/client/config";
import { TEAMS_ENABLED } from "@/lib/teams";

export type CopyKind = "email" | "template" | "block" | "image";

/**
 * A "Copy to…" button for one thing in the Library: pick another Library (your own, or a team
 * space you belong to) and a copy is made there. Shows nothing for visitors without an account
 * and for people who have nowhere else to copy to.
 */
export function CopyTo(props: { kind: CopyKind; id: string; name: string; className?: string }) {
  const config = useConfig();
  if (!TEAMS_ENABLED || config.mode !== "production" || !config.userId) return null;
  return <CopyToMenu {...props} here={config.workspaceId} />;
}

function CopyToMenu({ kind, id, name, className, here }: { kind: CopyKind; id: string; name: string; className?: string; here: string | null }) {
  const { userMemberships } = useOrganizationList({ userMemberships: { infinite: true } });
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  const teams = (userMemberships?.data ?? []).map((m) => ({ id: m.organization.id as string | null, name: m.organization.name })).filter((t) => t.id !== here);
  const places = [...(here ? [{ id: null as string | null, name: "My Library" }] : []), ...teams];
  if (places.length === 0) return null;

  async function copy(place: { id: string | null; name: string }) {
    if (busy) return;
    setBusy(true);
    try {
      // For a team space, Clerk issues a short-lived token for that team; it refuses if the person is not a member.
      const targetToken = place.id ? await session?.getToken({ organizationId: place.id }) : undefined;
      if (place.id && !targetToken) throw new Error("Could not get permission for that team space. Reload the page and try again.");
      const res = await fetch("/api/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, target: place.id, targetToken }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Could not copy (${res.status}).`);
      toast.success(`Copied “${name}” to ${place.name}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={busy} aria-label={`Copy ${name} to another Library`} title="Copy to another Library" className={`${buttonVariants({ variant: "outline", size: "icon" })} bg-white ${className ?? ""}`}>
        {busy ? <Loader2 className="animate-spin" /> : <Copy />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Copy to</DropdownMenuLabel>
          {places.map((place) => (
            <DropdownMenuItem key={place.id ?? "mine"} onClick={() => void copy(place)}>
              {place.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
