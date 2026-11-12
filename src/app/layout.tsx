import type { Metadata } from "next";
import { Bungee, Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfigProvider, type ServerConfig } from "@/lib/client/config";
import { publicConfig } from "@/lib/server/config";
import { exporterStatuses } from "@/lib/export/exporters";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// App wordmark only. Emails never use web fonts.
const bungee = Bungee({ variable: "--font-display", weight: "400", subsets: ["latin"] });

const TITLE = "OUTLOOKSUCKS.email: free Outlook email template builder";
const DESCRIPTION = "Build a good-looking email by dragging blocks, then download an .oft template that opens in Outlook. Free, no account needed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | OUTLOOKSUCKS.email" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "OUTLOOKSUCKS.email", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const config: ServerConfig = { ...publicConfig(), exporters: exporterStatuses() };
  const production = config.mode === "production";
  const userId = production ? (await auth()).userId : null;
  const app = (
    <>
      <ConfigProvider value={config} userId={userId}>
        <TooltipProvider>{children}</TooltipProvider>
      </ConfigProvider>
      <Toaster position="bottom-right" />
    </>
  );
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${bungee.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        {production ? <ClerkProvider>{app}</ClerkProvider> : app}
      </body>
    </html>
  );
}
