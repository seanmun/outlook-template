/**
 * The OUTLOOKSUCKS.email mark: one lightning bolt (the kinetic.email bolt, a single layer)
 * cracking a table grid in two. Built as an SVG string so the same source serves the page,
 * the downloadable files and the PNG exports.
 */

/** Bolt outline traced from the kinetic.email logo, fitted to a 64x64 box. */
const BOLT = "M34.8 11.6L34.0 11.8L33.3 12.1L32.6 12.5L32.0 13.1L31.5 13.6L30.9 14.2L30.3 14.8L29.8 15.4L29.2 16.0L28.6 16.6L28.0 17.2L27.4 17.8L26.9 18.4L26.3 19.0L25.7 19.6L25.1 20.2L24.5 20.8L24.0 21.4L23.4 22.0L22.8 22.5L22.2 23.1L21.7 23.7L21.1 24.3L20.6 24.9L20.0 25.4L19.4 26.0L18.9 26.6L18.3 27.2L17.7 27.8L17.1 28.4L16.5 29.0L15.9 29.6L15.4 30.2L14.8 30.8L14.3 31.5L13.9 32.1L13.6 32.9L13.5 33.7L13.5 34.5L13.7 35.3L14.1 36.0L14.6 36.6L15.3 37.0L16.1 37.3L16.9 37.5L17.8 37.6L18.7 37.6L19.6 37.6L20.5 37.6L21.4 37.6L22.2 37.6L23.2 37.6L24.1 37.6L25.0 37.6L25.8 37.6L26.7 37.6L27.6 37.6L28.5 37.6L29.1 37.8L29.5 38.2L29.7 38.7L29.6 39.4L29.4 40.2L29.1 41.0L28.9 41.8L28.7 42.6L28.4 43.4L28.1 44.2L27.9 45.0L27.6 45.8L27.4 46.6L27.1 47.4L26.9 48.2L26.7 49.0L26.7 49.8L26.8 50.6L27.1 51.3L27.6 51.8L28.2 52.2L29.0 52.4L29.7 52.3L30.5 52.0L31.2 51.6L31.8 51.1L32.4 50.5L33.0 49.9L33.6 49.3L34.2 48.7L34.8 48.1L35.4 47.4L36.0 46.8L36.6 46.2L37.2 45.6L37.8 45.0L38.3 44.4L38.9 43.8L39.5 43.2L40.1 42.6L40.7 42.0L41.3 41.4L41.8 40.8L42.4 40.2L43.0 39.6L43.5 39.0L44.1 38.4L44.7 37.8L45.3 37.3L45.8 36.7L46.4 36.1L47.0 35.5L47.6 34.9L48.1 34.3L48.7 33.7L49.3 33.1L49.8 32.4L50.2 31.7L50.4 30.9L50.5 30.1L50.4 29.3L50.1 28.6L49.7 27.9L49.1 27.4L48.4 27.0L47.6 26.7L46.8 26.6L45.9 26.5L45.0 26.5L44.1 26.5L43.2 26.5L42.3 26.5L41.4 26.5L40.5 26.5L39.6 26.5L38.7 26.5L37.8 26.5L36.9 26.5L36.0 26.5L35.2 26.4L34.7 26.1L34.4 25.7L34.3 25.1L34.5 24.3L34.7 23.5L35.0 22.7L35.3 21.9L35.5 21.1L35.8 20.4L36.0 19.6L36.3 18.8L36.5 18.0L36.8 17.2L37.0 16.4L37.2 15.5L37.3 14.7L37.3 13.9L37.1 13.2L36.7 12.5L36.2 12.0L35.5 11.7Z";

/** The crack runs through the bolt's top and bottom points; each half of the grid is clipped to one side. */
const LEFT_HALF = "M46.3 -69.9L17.4 133.8L-80 133.8L-80 -69.9Z";
const RIGHT_HALF = "M46.3 -69.9L17.4 133.8L144 133.8L144 -69.9Z";
const PIVOT = "29.0 56";

export const BRAND = {
  red: "#E7000B",
  ink: "#171717",
  paper: "#FAFAFA",
  white: "#FFFFFF",
  /** The bolt colour of the sister project, kinetic.email. */
  kineticYellow: "#F5B800",
} as const;

function grid(ink: string, simple: boolean): string {
  const [a, b] = [8, 56];
  const lines = simple ? [32] : [20, 32, 44];
  const [outer, inner] = simple ? [5, 4.5] : [2.6, 2.2];
  return (
    `<rect x="${a}" y="${a}" width="${b - a}" height="${b - a}" rx="3" fill="none" stroke="${ink}" stroke-width="${outer}"/>` +
    lines.map((v) => `<path d="M${a} ${v}H${b}M${v} ${a}V${b}" stroke="${ink}" stroke-width="${inner}"/>`).join("")
  );
}

export interface LogoOptions {
  bolt?: string;
  ink?: string;
  /** Solid square behind the mark. Omit for a transparent background. */
  background?: string;
  size?: number;
  /** "simple" is for tiny sizes (browser tabs): a 2x2 grid with heavy lines and a bigger bolt. */
  detail?: "full" | "simple";
  /** Must be unique among the logos on one page (SVG ids are document-wide). */
  id?: string;
}

export function logoSvg({ bolt = BRAND.red, ink = BRAND.ink, background, size = 64, detail = "full", id = "otb" }: LogoOptions = {}): string {
  const simple = detail === "simple";
  const g = grid(ink, simple);
  const boltAt = simple ? ' transform="translate(32 32) scale(1.12) translate(-32 -32)"' : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="OUTLOOKSUCKS.email logo">` +
    (background ? `<rect width="64" height="64" fill="${background}"/>` : "") +
    `<defs><clipPath id="${id}-l"><path d="${LEFT_HALF}"/></clipPath><clipPath id="${id}-r"><path d="${RIGHT_HALF}"/></clipPath>` +
    // The grid is cut away around the bolt, so the mark works on any background.
    `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="-10" y="-10" width="84" height="84"><rect x="-10" y="-10" width="84" height="84" fill="#fff"/><path d="${BOLT}"${boltAt} fill="#000" stroke="#000" stroke-width="${simple ? 5 : 4.5}" stroke-linejoin="round"/></mask></defs>` +
    `<g mask="url(#${id}-m)">` +
    `<g transform="translate(-1.6 0) rotate(-5 ${PIVOT})"><g clip-path="url(#${id}-l)">${g}</g></g>` +
    `<g transform="translate(1.6 0) rotate(4 ${PIVOT})"><g clip-path="url(#${id}-r)">${g}</g></g>` +
    `</g><path d="${BOLT}"${boltAt} fill="${bolt}"/></svg>`
  );
}
