"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { MAX_SUPPORT_MESSAGE, MAX_SUPPORT_SCREENSHOTS, SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABEL, type SupportCategory } from "@/lib/support-options";

interface Shot {
  name: string;
  dataUrl: string;
}

/** Longest side of a screenshot after shrinking; plenty to read text in, small enough to send three. */
const MAX_SIDE = 1600;

/** Shrinks a picture and saves it as a JPEG so three of them fit in one request. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no canvas");
  // White behind see-through pictures, which would otherwise turn black as a JPEG.
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

const field = "mt-1.5 block w-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/15";
const label = "block text-sm font-medium text-neutral-900";

export function SupportForm() {
  const [category, setCategory] = useState<SupportCategory>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  async function addShots(files: File[]) {
    setError(null);
    const room = MAX_SUPPORT_SCREENSHOTS - shots.length;
    if (files.length > room) setError(`Up to ${MAX_SUPPORT_SCREENSHOTS} screenshots. The extra ones were left out.`);
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        const dataUrl = await shrink(file);
        setShots((list) => (list.length < MAX_SUPPORT_SCREENSHOTS ? [...list, { name: file.name, dataUrl }] : list));
      } catch {
        setError(`${file.name} could not be read. Use a PNG or JPEG picture.`);
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message, email, website, screenshots: shots.map((s) => s.dataUrl) }),
      });
      if (res.ok) return setSent(true);
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "That did not send. Please try again in a minute.");
    } catch {
      setError("That did not send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent)
    return (
      <div role="status" className="border border-neutral-300 bg-white p-6">
        <p className="flex items-center gap-2 text-base font-semibold text-neutral-900">
          <Check className="size-5 text-green-700" /> Sent. Thank you.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">A person reads every message. The reply will come to {email}.</p>
        <p className="mt-4 text-sm">
          <Link href="/" className="font-medium text-neutral-900 underline underline-offset-2">
            Back to the home page
          </Link>
        </p>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-5 border border-neutral-300 bg-white p-6">
      <div>
        <label htmlFor="support-category" className={label}>
          What is it about?
        </label>
        <select id="support-category" className={field} value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
          {SUPPORT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {SUPPORT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="support-message" className={label}>
          What happened?
        </label>
        <textarea
          id="support-message"
          required
          rows={6}
          maxLength={MAX_SUPPORT_MESSAGE}
          className={field}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What you did, what you expected, and what you saw instead. For an Outlook problem, say which Outlook (Windows, Mac, or on the web)."
        />
      </div>

      <div>
        <label htmlFor="support-email" className={label}>
          Your email
        </label>
        <input id="support-email" type="email" required maxLength={200} autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        <p className="mt-1 text-xs text-neutral-500">Only used to reply to you.</p>
      </div>

      {/* A trap for bots. People never see it or reach it with the keyboard. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="support-website">Website</label>
        <input id="support-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div>
        <p className={label}>Screenshots (optional)</p>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            void addShots([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {shots.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {shots.map((s, i) => (
              <li key={`${s.name}-${i}`} className="relative size-20 overflow-hidden border border-neutral-300 bg-neutral-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.dataUrl} alt={s.name} className="size-full object-cover" />
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  className="absolute top-0.5 right-0.5 bg-black/70 p-0.5 text-white hover:bg-black"
                  onClick={() => setShots((list) => list.filter((_, j) => j !== i))}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {shots.length < MAX_SUPPORT_SCREENSHOTS && (
          <button type="button" onClick={() => picker.current?.click()} className="mt-2 inline-flex items-center gap-2 border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
            <ImagePlus className="size-4" /> Add a screenshot
          </button>
        )}
        <p className="mt-1 text-xs text-neutral-500">Up to {MAX_SUPPORT_SCREENSHOTS}. A picture of the problem usually gets it fixed faster.</p>
      </div>

      {error && (
        <p role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button type="submit" disabled={sending} className="inline-flex items-center gap-2 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">
        {sending && <Loader2 className="size-4 animate-spin" />} {sending ? "Sending" : "Send"}
      </button>
    </form>
  );
}
