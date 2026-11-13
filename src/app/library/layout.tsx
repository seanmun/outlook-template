import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Personal to each visitor, so kept out of search. The pages are client components; their metadata lives here.
export const metadata: Metadata = pageMetadata({ title: "Library", description: "Your emails, saved blocks and images.", path: "/library", index: false });

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
