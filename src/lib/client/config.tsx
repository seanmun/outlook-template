"use client";
import { createContext, useContext } from "react";
import type { ExporterStatus } from "@/lib/export/exporters";

export interface ClientConfig {
  mode: "production" | "demo";
  missing: string[];
  ai: { enabled: boolean; reason?: string; model?: string };
  exporters: ExporterStatus[];
}

const Ctx = createContext<ClientConfig | null>(null);

export function ConfigProvider({ value, children }: { value: ClientConfig; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): ClientConfig {
  const v = useContext(Ctx);
  if (!v) throw new Error("ConfigProvider missing");
  return v;
}
