/**
 * Advertising shown around the app. Every ad is clearly labelled and never
 * appears inside the editor canvas.
 *
 * Display creatives are standard HTML5 ads: one self-contained index.html per
 * IAB size under public/ads/<advertiser>/<size>/, which reads its destination
 * from a `clickTag` query parameter. To add an advertiser, drop its files there
 * and add an entry below. To update one, replace its files.
 *
 * kinetic.email's creatives are generated in that project's repo
 * (kinetic-email/ads/outlooksucks) and copied here.
 */
/**
 * The one switch for all advertising. While false, no ad renders anywhere:
 * not the home page rails, the inline slot, or the export dialog line.
 * Flip to true and deploy to turn them on.
 */
export const ADS_ENABLED = false;

export type AdSize = "160x600" | "300x250";

/** Where an ad can appear. */
export type AdPlacement = "rail-left" | "rail-right" | "inline" | "export-dialog";

export interface Ad {
  id: string;
  advertiser: string;
  /** How the advertiser relates to this site, shown beside the "Ad" label. */
  disclosure: string;
  /** Display creatives by size, as paths under /public. */
  creatives: Partial<Record<AdSize, string>>;
  /** One-line text ad. */
  text?: { headline: string; cta: string; url: string };
  placements: AdPlacement[];
  /** Destination for display creatives; passed to the creative as clickTag. Omit to use the creative's own default. */
  clickUrl?: string;
}

export const ADS: Ad[] = [
  {
    id: "kinetic",
    advertiser: "kinetic.email",
    disclosure: "From the maker of this site",
    creatives: { "160x600": "/ads/kinetic/160x600/index.html", "300x250": "/ads/kinetic/300x250/index.html" },
    text: {
      headline: "Interactive emails from a prompt, with an Outlook fallback.",
      cta: "Try KineticAI",
      url: "https://kinetic.email/?utm_source=outlooksucks&utm_medium=text&utm_campaign=house",
    },
    placements: ["rail-left", "rail-right", "inline", "export-dialog"],
  },
];

export const AD_DIMENSIONS: Record<AdSize, { width: number; height: number }> = {
  "160x600": { width: 160, height: 600 },
  "300x250": { width: 300, height: 250 },
};

const PLACEMENT_SIZE: Partial<Record<AdPlacement, AdSize>> = { "rail-left": "160x600", "rail-right": "160x600", inline: "300x250" };

/** The ad for a placement, or null when none is booked. With several candidates, `pick` chooses (0 ≤ pick < 1). */
export function adFor(placement: AdPlacement, pick = 0): Ad | null {
  if (!ADS_ENABLED) return null;
  const size = PLACEMENT_SIZE[placement];
  const candidates = ADS.filter((a) => a.placements.includes(placement) && (size ? !!a.creatives[size] : !!a.text));
  return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(pick * candidates.length))] : null;
}

export function sizeFor(placement: AdPlacement): AdSize | null {
  return PLACEMENT_SIZE[placement] ?? null;
}

/** The creative's URL, with the click destination attached when the ad sets one. */
export function creativeSrc(ad: Ad, size: AdSize): string | null {
  const path = ad.creatives[size];
  if (!path) return null;
  return ad.clickUrl ? `${path}?clickTag=${encodeURIComponent(ad.clickUrl)}` : path;
}
