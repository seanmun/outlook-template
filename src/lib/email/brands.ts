/**
 * Brand definitions live in code for the MVP.
 *
 * ALL BRANDS BELOW ARE FICTIONAL SAMPLES. They exist to exercise the module
 * system until real brand assets and approved HTML are supplied. They do not
 * represent any real client, and contain no approved marketing claims.
 */

export interface BrandColors {
  pageBackground: string;
  contentBackground: string;
  heading: string;
  text: string;
  mutedText: string;
  primary: string;
  primaryText: string;
  link: string;
  footerBackground: string;
  footerText: string;
}

export interface Brand {
  id: string;
  name: string;
  description: string;
  isSample: boolean;
  /** Web-safe stacks only: external fonts are not allowed. */
  fontFamily: string;
  headingFontFamily: string;
  colors: BrandColors;
  /** Swatches offered in the editor and to the AI. */
  palette: { label: string; value: string }[];
  wordmark: string;
  headlineSizes: number[];
  buttonRadius: number;
  /** Module types this brand may use, in catalogue order. */
  modules: string[];
  /** Tone guidance passed to the AI. Not marketing claims. */
  voice: string;
}

const STANDARD_MODULES = ["header", "hero", "text", "cta", "footer"];

export const BRANDS: Brand[] = [
  {
    id: "harbor-pine",
    name: "Harbor & Pine (Sample)",
    description: "Fictional sample brand: calm navy and green, centred layouts.",
    isSample: true,
    fontFamily: "Arial, Helvetica, sans-serif",
    headingFontFamily: "Georgia, 'Times New Roman', Times, serif",
    colors: {
      pageBackground: "#eef2f5",
      contentBackground: "#ffffff",
      heading: "#14304a",
      text: "#33414e",
      mutedText: "#6b7a88",
      primary: "#1f6f50",
      primaryText: "#ffffff",
      link: "#1f6f50",
      footerBackground: "#14304a",
      footerText: "#d5dee6",
    },
    palette: [
      { label: "Navy", value: "#14304a" },
      { label: "Pine", value: "#1f6f50" },
      { label: "Slate", value: "#33414e" },
      { label: "Mist", value: "#eef2f5" },
      { label: "White", value: "#ffffff" },
      { label: "Sand", value: "#f4efe6" },
    ],
    wordmark: "Harbor & Pine",
    headlineSizes: [22, 26, 30],
    buttonRadius: 4,
    modules: STANDARD_MODULES,
    voice: "Warm, plain-spoken, concise. Short sentences. No hype.",
  },
  {
    id: "lumen-labs",
    name: "Lumen Labs (Sample)",
    description: "Fictional sample brand: bright violet accent, left-aligned copy.",
    isSample: true,
    fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
    headingFontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
    colors: {
      pageBackground: "#f5f3fb",
      contentBackground: "#ffffff",
      heading: "#221a3d",
      text: "#3a3550",
      mutedText: "#7a7591",
      primary: "#5b3fd6",
      primaryText: "#ffffff",
      link: "#5b3fd6",
      footerBackground: "#f5f3fb",
      footerText: "#7a7591",
    },
    palette: [
      { label: "Ink", value: "#221a3d" },
      { label: "Violet", value: "#5b3fd6" },
      { label: "Lilac", value: "#e9e4fb" },
      { label: "Fog", value: "#f5f3fb" },
      { label: "White", value: "#ffffff" },
      { label: "Graphite", value: "#3a3550" },
    ],
    wordmark: "LUMEN LABS",
    headlineSizes: [20, 24, 28],
    buttonRadius: 20,
    modules: STANDARD_MODULES,
    voice: "Energetic but professional. Direct calls to action. Avoid jargon.",
  },
  {
    id: "copperfield",
    name: "Copperfield Group (Sample)",
    description: "Fictional sample brand: copper accent bar header (brand-specific header renderer).",
    isSample: true,
    fontFamily: "Verdana, Geneva, sans-serif",
    headingFontFamily: "Verdana, Geneva, sans-serif",
    colors: {
      pageBackground: "#f3f1ee",
      contentBackground: "#ffffff",
      heading: "#2b2420",
      text: "#4a423c",
      mutedText: "#8a8079",
      primary: "#b0602c",
      primaryText: "#ffffff",
      link: "#b0602c",
      footerBackground: "#2b2420",
      footerText: "#cfc6bf",
    },
    palette: [
      { label: "Espresso", value: "#2b2420" },
      { label: "Copper", value: "#b0602c" },
      { label: "Stone", value: "#f3f1ee" },
      { label: "White", value: "#ffffff" },
      { label: "Clay", value: "#4a423c" },
    ],
    wordmark: "Copperfield Group",
    headlineSizes: [20, 24, 28],
    buttonRadius: 0,
    modules: STANDARD_MODULES,
    voice: "Measured, formal, factual. Prefers clear headings and brief bodies.",
  },
];

export function getBrand(id: string): Brand | undefined {
  return BRANDS.find((b) => b.id === id);
}

export function requireBrand(id: string): Brand {
  const b = getBrand(id);
  if (!b) throw new Error(`Unknown brand: ${id}`);
  return b;
}
