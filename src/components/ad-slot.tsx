import { AD_DIMENSIONS, adFor, creativeSrc, sizeFor, type AdPlacement } from "@/lib/ads";

/** The label that sits outside every ad, so it is never mistaken for part of the app. */
function AdLabel({ disclosure }: { disclosure: string }) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[10px] leading-none text-neutral-400">
      <span className="rounded-sm border border-neutral-300 px-1 py-0.5 font-semibold tracking-wide text-neutral-500 uppercase">Ad</span>
      <span className="truncate">{disclosure}</span>
    </div>
  );
}

/**
 * A display ad. The creative runs in a sandboxed frame: it can run its own
 * script and open its link in a new tab, and nothing else. It cannot read
 * cookies or storage, see this page, or navigate it.
 */
export function AdSlot({ placement, className }: { placement: Exclude<AdPlacement, "export-dialog">; className?: string }) {
  const ad = adFor(placement);
  const size = sizeFor(placement);
  const src = ad && size ? creativeSrc(ad, size) : null;
  if (!ad || !size || !src) return null;
  const { width, height } = AD_DIMENSIONS[size];
  return (
    <aside className={className} aria-label={`Advertisement: ${ad.advertiser}`} data-ad-placement={placement} style={{ width }}>
      <AdLabel disclosure={ad.disclosure} />
      <iframe
        src={src}
        title={`Advertisement: ${ad.advertiser}`}
        width={width}
        height={height}
        loading="lazy"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="block rounded-sm opacity-90 transition-opacity hover:opacity-100"
        style={{ border: 0, width, height }}
      />
    </aside>
  );
}

/** A one-line text ad, for places where a display ad would be too much. */
export function TextAd({ placement }: { placement: AdPlacement }) {
  const ad = adFor(placement);
  if (!ad?.text) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t pt-3 text-xs text-neutral-500" data-ad-placement={placement}>
      <span className="rounded-sm border border-neutral-300 px-1 py-0.5 text-[10px] leading-none font-semibold tracking-wide text-neutral-500 uppercase">Ad</span>
      <span>
        {ad.advertiser}: {ad.text.headline}
      </span>
      <a href={ad.text.url} target="_blank" rel="sponsored noopener" className="font-medium text-neutral-800 underline underline-offset-2 hover:text-neutral-950">
        {ad.text.cta} →
      </a>
    </p>
  );
}
