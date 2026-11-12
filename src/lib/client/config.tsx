"use client";
import { createContext, useContext, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import type { ExporterStatus } from "@/lib/export/exporters";

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
  /** Auth state is known; wait for this before choosing a store. */
  ready: boolean;
}

const Ctx = createContext<ClientConfig | null>(null);

export function ConfigProvider({ value, userId = null, children }: { value: ServerConfig; userId?: string | null; children: React.ReactNode }) {
  if (value.mode === "production") return <AuthAwareConfig server={value} serverUserId={userId}>{children}</AuthAwareConfig>;
  return <Ctx.Provider value={{ ...value, authAvailable: false, userId: null, ready: true }}>{children}</Ctx.Provider>;
}

function AuthAwareConfig({ server, serverUserId, children }: { server: ServerConfig; serverUserId: string | null; children: React.ReactNode }) {
  const auth = useAuth();
  // The server already knows who is signed in, so the app never waits on Clerk's
  // browser script: if it is slow or fails to load, the signed-out app still works.
  const userId = auth.isLoaded ? (auth.isSignedIn ? auth.userId : null) : serverUserId;
  const value = useMemo<ClientConfig>(
    () =>
      userId
        ? { ...server, authAvailable: true, userId, ready: true }
        : {
            ...server,
            mode: "demo",
            missing: [],
            authAvailable: true,
            userId: null,
            ready: true,
            ai: server.ai.enabled ? { enabled: false, reason: "Sign in to use AI. Everything else works without an account." } : server.ai,
          },
    [server, userId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): ClientConfig {
  const v = useContext(Ctx);
  if (!v) throw new Error("ConfigProvider missing");
  return v;
}
