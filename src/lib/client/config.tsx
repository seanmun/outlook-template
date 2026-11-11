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
  /** Auth state is known; wait for this before choosing a store. */
  ready: boolean;
}

const Ctx = createContext<ClientConfig | null>(null);

export function ConfigProvider({ value, signedIn = false, children }: { value: ServerConfig; signedIn?: boolean; children: React.ReactNode }) {
  if (value.mode === "production") return <AuthAwareConfig server={value} serverSignedIn={signedIn}>{children}</AuthAwareConfig>;
  return <Ctx.Provider value={{ ...value, authAvailable: false, ready: true }}>{children}</Ctx.Provider>;
}

function AuthAwareConfig({ server, serverSignedIn, children }: { server: ServerConfig; serverSignedIn: boolean; children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  // The server already knows who is signed in, so the app never waits on Clerk's
  // browser script: if it is slow or fails to load, the signed-out app still works.
  const signedIn = isLoaded ? !!isSignedIn : serverSignedIn;
  const value = useMemo<ClientConfig>(
    () =>
      signedIn
        ? { ...server, authAvailable: true, ready: true }
        : {
            ...server,
            mode: "demo",
            missing: [],
            authAvailable: true,
            ready: true,
            ai: server.ai.enabled ? { enabled: false, reason: "Sign in to use AI. Everything else works without an account." } : server.ai,
          },
    [server, signedIn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): ClientConfig {
  const v = useContext(Ctx);
  if (!v) throw new Error("ConfigProvider missing");
  return v;
}
