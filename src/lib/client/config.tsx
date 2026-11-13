"use client";
import { createContext, useContext, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import type { ExporterStatus } from "@/lib/export/exporters";
import { TEAMS_ENABLED } from "@/lib/teams";

export interface ServerConfig {
  mode: "production" | "demo";
  missing: string[];
  ai: { enabled: boolean; reason?: string; model?: string };
  exporters: ExporterStatus[];
}

export interface ClientConfig extends ServerConfig {
  /** Storage for THIS visitor: "production" = signed in (cloud), "demo" = browser only. */
  mode: "production" | "demo";
  /** Sign-in is available (Clerk + Supabase configured). */
  authAvailable: boolean;
  /** The signed-in account, or null. Used to keep browser-stored data apart per account. */
  userId: string | null;
  /** The team space the person is working in, or null for their own Library. Always null while team spaces are switched off. */
  workspaceId: string | null;
  /** Changes whenever the Library in view changes; use it as a React key so screens reload their lists. */
  spaceKey: string;
  /** AI is switched on for the site and the only thing missing is signing in. False when AI is on, and when the site has no AI at all. */
  aiNeedsSignIn: boolean;
  /** Auth state is known; wait for this before choosing a store. */
  ready: boolean;
}

const Ctx = createContext<ClientConfig | null>(null);

export function ConfigProvider({ value, userId = null, workspaceId = null, children }: { value: ServerConfig; userId?: string | null; workspaceId?: string | null; children: React.ReactNode }) {
  if (value.mode === "production") {
    return (
      <AuthAwareConfig server={value} serverUserId={userId} serverWorkspaceId={workspaceId}>
        {children}
      </AuthAwareConfig>
    );
  }
  return <Ctx.Provider value={{ ...value, authAvailable: false, userId: null, workspaceId: null, spaceKey: "browser", aiNeedsSignIn: false, ready: true }}>{children}</Ctx.Provider>;
}

function AuthAwareConfig({ server, serverUserId, serverWorkspaceId, children }: { server: ServerConfig; serverUserId: string | null; serverWorkspaceId: string | null; children: React.ReactNode }) {
  const auth = useAuth();
  // The server already knows who is signed in, so the app never waits on Clerk's
  // browser script: if it is slow or fails to load, the signed-out app still works.
  const userId = auth.isLoaded ? (auth.isSignedIn ? auth.userId : null) : serverUserId;
  // The team space is the organization the Clerk session is in. The server reads the same session, so the two always agree.
  const workspaceId = !TEAMS_ENABLED || !userId ? null : auth.isLoaded ? (auth.orgId ?? null) : serverWorkspaceId;
  const value = useMemo<ClientConfig>(
    () =>
      userId
        ? { ...server, authAvailable: true, userId, workspaceId, spaceKey: workspaceId ?? `me:${userId}`, aiNeedsSignIn: false, ready: true }
        : {
            ...server,
            mode: "demo",
            missing: [],
            authAvailable: true,
            userId: null,
            workspaceId: null,
            spaceKey: "browser",
            aiNeedsSignIn: server.ai.enabled,
            ready: true,
            ai: server.ai.enabled ? { enabled: false, reason: "Sign in to use AI. Everything else works without an account." } : server.ai,
          },
    [server, userId, workspaceId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): ClientConfig {
  const v = useContext(Ctx);
  if (!v) throw new Error("ConfigProvider missing");
  return v;
}
