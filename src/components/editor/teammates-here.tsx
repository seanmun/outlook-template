"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyName } from "@/components/team";
import type { DraftStore } from "@/lib/client/stores";
import type { EmailDocument } from "@/lib/email/document";

/** How often the editor says "I still have this open". Must be well inside the server's presence window. */
const CHECK_IN_MS = 15_000;

const list = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Team spaces only. While a team email is open, tells the server so, and shows a bar when a
 * teammate has the same email open. Saving never silently overwrites (the second save is told to
 * reload), so the bar is a heads-up, with a way out: carry on in a copy of your own.
 */
export function TeammatesHere({ emailId, document, drafts }: { emailId: string; document: EmailDocument; drafts: DraftStore }) {
  const name = useMyName();
  const router = useRouter();
  const [others, setOthers] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let stopped = false;
    const url = `/api/emails/${encodeURIComponent(emailId)}/presence`;
    const checkIn = async () => {
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        if (!res.ok || stopped) return;
        setOthers(((await res.json()) as { others?: string[] }).others ?? []);
      } catch {
        // Offline or a blip: try again on the next round. Not worth interrupting anyone for.
      }
    };
    void checkIn();
    const timer = setInterval(checkIn, CHECK_IN_MS);
    const leave = () => void fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [emailId, name]);

  async function makeCopy() {
    setCopying(true);
    try {
      const copy = await drafts.create({ ...structuredClone(document), title: `${document.title || "Untitled email"} (copy)` });
      router.push(`/editor/${copy.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setCopying(false);
    }
  }

  if (others.length === 0) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-blue-200 bg-blue-50 px-4 py-1.5 text-xs text-blue-900">
      <Users className="size-3.5 shrink-0" />
      <span>
        <strong>
          {list(others)} {others.length === 1 ? "is" : "are"} editing this email too.
        </strong>{" "}
        If you both change it, whoever saves second is asked to reload. Wait for them, or work in a copy.
      </span>
      <Button variant="outline" size="sm" className="h-6 bg-white px-2 text-xs" disabled={copying} onClick={makeCopy}>
        Work in a copy
      </Button>
    </div>
  );
}
