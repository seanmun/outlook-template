import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = pageMetadata({
  title: "Start an email",
  description: "Start an Outlook email from an example or a blank page, then drag blocks into place and download an .oft template. Free, no account needed.",
  path: "/new",
});

export default function NewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
