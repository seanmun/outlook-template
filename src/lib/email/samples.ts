import { SAMPLE_IMAGES } from "./samples.generated";
import { SOCIAL_ICON_IMAGES } from "./social-icons.generated";

export type SampleImage = (typeof SAMPLE_IMAGES)[number] | (typeof SOCIAL_ICON_IMAGES)[number];

export function getSampleImage(id: string): SampleImage | undefined {
  return SAMPLE_IMAGES.find((s) => s.id === id) ?? SOCIAL_ICON_IMAGES.find((s) => s.id === id);
}

export function sampleDataUrl(id: string): string | null {
  const s = getSampleImage(id);
  return s ? `data:${s.mimeType};base64,${s.base64}` : null;
}

export function sampleBytes(id: string): Uint8Array | null {
  const s = getSampleImage(id);
  if (!s) return null;
  const bin = atob(s.base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const SAMPLE_HERO_BY_BRAND: Record<string, string> = {
  "harbor-pine": "hero-harbor",
  "lumen-labs": "hero-lumen",
  copperfield: "hero-copper",
};
