import { SignIn } from "@clerk/nextjs";
import { appMode } from "@/lib/server/config";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function SignInPage() {
  if (appMode() !== "production") {
    return (
      <main className="mx-auto max-w-md p-10 text-sm">
        Authentication is not configured, so the app runs in local demo mode. <Link className="underline" href="/">Back to the app</Link>
      </main>
    );
  }
  // Already signed in: go straight to the app. Rendering the Clerk form here makes it
  // bounce between /sign-in and /sign-up forever after an email link is opened.
  if ((await auth()).userId) redirect("/");
  return (
    <main className="flex flex-1 items-center justify-center p-10">
      <SignIn signUpUrl="/sign-up" forceRedirectUrl="/" />
    </main>
  );
}
