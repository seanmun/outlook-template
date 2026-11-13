import Link from "next/link";
import { GUIDES } from "@/lib/marketing/guides";

/** Footer for the marketing and start pages. The editor is a full-screen tool and has none. */
export function SiteFooter() {
  const link = "text-neutral-300 underline-offset-4 hover:text-white hover:underline";
  return (
    <footer className="mt-16 border-t-4 border-red-600 bg-neutral-950 text-neutral-400">
      <div className="mx-auto grid w-full max-w-4xl gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_1.2fr_1fr]">
        <div>
          <Link href="/" aria-label="OUTLOOKSUCKS.email home" className="inline-flex items-baseline font-[family-name:var(--font-display)] text-xl leading-none">
            <span className="text-white">OUTLOOK</span>
            <span className="inline-block -rotate-3 text-red-500">SUCKS</span>
            <span className="ml-0.5 font-sans text-xs font-semibold text-neutral-500">.email</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">Build emails that survive Outlook, without writing a single table. Free to use, no account needed.</p>
        </div>
        <nav aria-label="Product">
          <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Product</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/new" className={link}>
                Build an email
              </Link>
            </li>
            <li>
              <Link href="/#examples-heading" className={link}>
                Examples
              </Link>
            </li>
            <li>
              <Link href="/library" className={link}>
                Library
              </Link>
            </li>
            <li>
              <Link href="/templates" className={link}>
                Templates
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Guides">
          <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Guides</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {GUIDES.map((g) => (
              <li key={g.href}>
                <Link href={g.href} className={link}>
                  {g.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/guides" className={link}>
                All guides
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Good to know</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">
            <li>Without an account, your drafts stay in your browser.</li>
            <li>
              Outlook support data from{" "}
              <a href="https://www.caniemail.com/" target="_blank" rel="noopener" className={link}>
                Can I email
              </a>
              .
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto w-full max-w-4xl space-y-2 px-6 py-4 text-xs leading-relaxed text-neutral-500">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} OUTLOOKSUCKS.email</span>
            <Link href="/privacy" className="hover:text-neutral-300">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-neutral-300">
              Terms
            </Link>
            <span className="sm:ml-auto">
              Project maintained by{" "}
              <a href="https://seanmun.com" target="_blank" rel="noopener" className="text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline">
                Sean Munley
              </a>
            </span>
          </p>
          <p>An independent project, not affiliated with or endorsed by Microsoft. Outlook is a trademark of Microsoft Corporation.</p>
        </div>
      </div>
    </footer>
  );
}
