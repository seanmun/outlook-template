import "server-only";

/**
 * Mode detection. "production" requires BOTH Clerk and Supabase; anything less
 * runs the clearly labelled local demo (browser storage, no server persistence).
 */
export type AppMode = "production" | "demo";

export interface PublicConfig {
  mode: AppMode;
  missing: string[];
  ai: { enabled: boolean; reason?: string; model?: string };
}

export function isClerkConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function appMode(): AppMode {
  return isClerkConfigured() && isSupabaseConfigured() ? "production" : "demo";
}

export const DEFAULT_MODEL = "claude-opus-5-5";

export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

export function aiAvailability(): PublicConfig["ai"] {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { enabled: false, reason: "AI is off: ANTHROPIC_API_KEY is not set on the server. Manual editing works normally." };
  }
  if (appMode() === "demo" && process.env.DEMO_ALLOW_AI !== "true") {
    return {
      enabled: false,
      reason: "AI is off in demo mode because requests would be unauthenticated. Set DEMO_ALLOW_AI=true for local development only.",
    };
  }
  return { enabled: true, model: anthropicModel() };
}

export function publicConfig(): PublicConfig {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  if (!process.env.CLERK_SECRET_KEY) missing.push("CLERK_SECRET_KEY");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { mode: appMode(), missing, ai: aiAvailability() };
}
