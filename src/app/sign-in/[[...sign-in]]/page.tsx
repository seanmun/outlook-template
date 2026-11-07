import { SignIn } from "@clerk/nextjs";
import { appMode } from "@/lib/server/config";
import Link from "next/link";

export default function SignInPage() {
  if (appMode() !== "production") {
    return (
      <main className="mx-auto max-w-md p-10 text-sm">
        Authentication is not configured, so the app runs in local demo mode. <Link className="underline" href="/">Go to drafts</Link>
      </main>
    );
  }
  return (
    <main className="flex flex-1 items-center justify-center p-10">
      <SignIn />
    </main>
  );
}
