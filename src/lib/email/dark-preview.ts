/**
 * Dark-mode preview for the canvas. Preview only: the email itself is never changed.
 *
 * Mail apps with a dark theme (Outlook among them) recolour an email on their own: light
 * backgrounds become dark and dark text becomes light, while pictures are left exactly as they are.
 * Each app uses its own rules, so this is an approximation of that behaviour, good enough to show
 * what matters: text stays readable, and a picture with a white background turns into a white box.
 *
 * Works on the renderer's output, where every colour is a six-digit hex in a style or bgcolor attribute.
 */

type Hsl = [h: number, s: number, l: number];

function toHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function toHex([h, s, l]: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}

/** Light surfaces go dark (white lands on a soft near-black); surfaces that are already dark are left alone. */
export function darkSurface(hex: string): string {
  const [h, s, l] = toHsl(hex);
  if (l < 0.5) return hex.toLowerCase();
  return toHex([h, s * 0.6, 0.12 + (1 - l) * 0.6]);
}

/** Dark text goes light (black lands on near-white); text that is already light is left alone. */
export function darkText(hex: string): string {
  const [h, s, l] = toHsl(hex);
  if (l > 0.5) return hex.toLowerCase();
  return toHex([h, s, 0.94 - l * 0.6]);
}

const HEX = /#[0-9a-fA-F]{6}\b/g;

function recolourStyle(style: string): string {
  return style
    .split(";")
    .map((decl) => {
      const at = decl.indexOf(":");
      if (at < 0) return decl;
      const prop = decl.slice(0, at).trim().toLowerCase();
      if (prop === "color") return decl.slice(0, at + 1) + decl.slice(at + 1).replace(HEX, darkText);
      if (prop === "background" || prop === "background-color" || prop.startsWith("border")) return decl.slice(0, at + 1) + decl.slice(at + 1).replace(HEX, darkSurface);
      return decl;
    })
    .join(";");
}

/** Recolours the email inside `<body>`; the canvas's own selection styles in `<head>` are not touched. */
export function darkModePreview(html: string): string {
  const at = html.indexOf("<body");
  if (at < 0) return html;
  const body = html
    .slice(at)
    .replace(/\sstyle="([^"]*)"/g, (_, style: string) => ` style="${recolourStyle(style)}"`)
    .replace(/\sbgcolor="(#[0-9a-fA-F]{6})"/g, (_, hex: string) => ` bgcolor="${darkSurface(hex)}"`);
  return html.slice(0, at) + body;
}
