import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfigProvider, type ClientConfig } from "@/lib/client/config";
import { publicConfig } from "@/lib/server/config";
import { exporterStatuses } from "@/lib/export/exporters";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Outlook Template Builder",
  description: "Assemble branded internal emails from approved modules and export Outlook templates.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  const config: ClientConfig = { ...publicConfig(), exporters: exporterStatuses() };
  const body = (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <ConfigProvider value={config}>
          <TooltipProvider>{children}</TooltipProvider>
        </ConfigProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
  return config.mode === "production" ? <ClerkProvider>{body}</ClerkProvider> : body;
}
