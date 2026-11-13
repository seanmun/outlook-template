/**
 * Removes a plain background from a picture, in the browser, and returns a transparent PNG.
 *
 * This is not an AI model. It finds the colour that runs around the edge of the picture, then
 * clears everything of that colour that is connected to the edge, softening the boundary so no
 * pale fringe is left. Small enclosed pockets of the same colour (the insides of letters) go too.
 * That is exactly the common case it is for: a logo or product shot saved
 * as a JPEG on white, which shows as a white box on a dark background. Photos with busy
 * backgrounds are refused with a clear message instead of being mangled.
 */

/** Colours this close to the background (RGB distance, 0-441) are background. */
const HARD = 36;
/** An enclosed area of the background colour is cleared when it is no bigger than this share of the picture. */
const POCKET_SHARE = 0.015;
/** How far (in pixels) to look for the subject's true colour next to a boundary pixel. */
const REACH = 2;

export type RemoveResult = { ok: true; removed: number } | { ok: false; reason: "no-plain-background" | "already-transparent" | "nothing-left" | "nothing-removed" };

/**
 * Clears the background of RGBA pixel data in place. Pure (no canvas), so it can be tested.
 * `removed` is the share of pixels made fully transparent.
 */
export function removePlainBackground(px: Uint8ClampedArray, width: number, height: number): RemoveResult {
  const total = width * height;
  if (total === 0) return { ok: false, reason: "nothing-removed" };
  const edge: number[] = [];
  for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) edge.push(y * width, y * width + width - 1);

  if (edge.filter((i) => px[i * 4 + 3] < 16).length > edge.length / 2) return { ok: false, reason: "already-transparent" };

  // The background is the commonest colour along the edge (grouped coarsely, then averaged).
  const buckets = new Map<number, number>();
  for (const i of edge) {
    const key = ((px[i * 4] >> 4) << 8) | ((px[i * 4 + 1] >> 4) << 4) | (px[i * 4 + 2] >> 4);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const top = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const centre = [((top >> 8) & 15) * 16 + 8, ((top >> 4) & 15) * 16 + 8, (top & 15) * 16 + 8];
  let n = 0;
  const sum = [0, 0, 0];
  for (const i of edge) {
    if (Math.hypot(px[i * 4] - centre[0], px[i * 4 + 1] - centre[1], px[i * 4 + 2] - centre[2]) > 28) continue;
    sum[0] += px[i * 4];
    sum[1] += px[i * 4 + 1];
    sum[2] += px[i * 4 + 2];
    n++;
  }
  const bg = [sum[0] / n, sum[1] / n, sum[2] / n];
  const dist = (i: number) => Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]);

  // A plain background means most of the edge is that one colour.
  if (edge.filter((i) => dist(i) <= HARD).length < edge.length * 0.6) return { ok: false, reason: "no-plain-background" };

  // Flood inward from the edge through background-coloured pixels. 0 = untouched, 1 = background, 2 = boundary.
  const state = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  for (const i of edge) {
    if (state[i] === 0 && dist(i) <= HARD) {
      state[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const near = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const j of near) {
      if (j < 0 || j >= total || state[j] !== 0) continue;
      const d = dist(j);
      if (d <= HARD) {
        state[j] = 1;
        queue[tail++] = j;
      } else {
        state[j] = 2;
      }
    }
  }
  if (tail === 0) return { ok: false, reason: "nothing-removed" };
  if (tail > total * 0.985) return { ok: false, reason: "nothing-left" };
  let cleared = tail;

  // Small pockets of the background colour that the subject encloses, such as the insides of
  // letters, are cleared too. Large enclosed areas are left: they are more likely part of the design.
  const pocketLimit = Math.max(16, Math.round(total * POCKET_SHARE));
  for (let start = 0; start < total; start++) {
    if (state[start] !== 0 || dist(start) > HARD) continue;
    const from = tail;
    const rim: number[] = [];
    state[start] = 3;
    queue[tail++] = start;
    for (let at = from; at < tail; at++) {
      const i = queue[at];
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j < 0 || j >= total) continue;
        if (state[j] === 0 && dist(j) <= HARD) {
          state[j] = 3;
          queue[tail++] = j;
        } else if (state[j] === 0) {
          rim.push(j);
        }
      }
    }
    const size = tail - from;
    if (size <= pocketLimit) {
      for (let at = from; at < tail; at++) state[queue[at]] = 1;
      for (const j of rim) if (state[j] === 0) state[j] = 2;
      cleared += size;
    }
    tail = from; // the queue space is reused; kept pockets stay marked 3 so they are not scanned again
  }

  // Boundary pixels (the subject's outline) are often a blend of subject and background, left by
  // anti-aliasing or JPEG compression. How much of each is worked out from the strongest subject
  // colour nearby: a pixel half as far from the background as its neighbour is half subject.
  // Distances are read before anything is changed, so one pixel's fix cannot skew the next.
  const fixes: [index: number, alpha: number][] = [];
  for (let i = 0; i < total; i++) {
    if (state[i] !== 2) continue;
    const x = i % width;
    const y = (i - x) / width;
    let subject = dist(i);
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (state[j] !== 1 && state[j] !== 3) subject = Math.max(subject, dist(j));
      }
    }
    const a = dist(i) / subject;
    if (a < 0.9) fixes.push([i, Math.max(0.05, a)]);
  }
  for (const [i, a] of fixes) {
    // Take the background's tint out, so the edge shows the subject's colour at reduced opacity.
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, Math.round(bg[c] + (px[i * 4 + c] - bg[c]) / a)));
    px[i * 4 + 3] = Math.round(px[i * 4 + 3] * a);
  }
  for (let i = 0; i < total; i++) if (state[i] === 1) px[i * 4 + 3] = 0;
  return { ok: true, removed: cleared / total };
}

const MESSAGES: Record<Exclude<RemoveResult, { ok: true }>["reason"], string> = {
  "no-plain-background": "This picture doesn't have a plain background to remove. It works on pictures with a single-colour background, like a logo on white.",
  "already-transparent": "This picture already has a transparent background.",
  "nothing-left": "The whole picture is one colour, so there is nothing to keep.",
  "nothing-removed": "No background was found to remove.",
};

const MAX_SIDE = 2400;
const MAX_BYTES = 5 * 1024 * 1024;

/** Loads the picture at `url`, removes its plain background and returns a PNG file. Throws an Error with a readable message. */
export async function cutOutBackground(url: string, name = "image"): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("The picture could not be loaded.");
  const bitmap = await createImageBitmap(await res.blob());
  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt++, scale *= 0.75) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This browser cannot edit pictures.");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const result = removePlainBackground(image.data, w, h);
    if (!result.ok) throw new Error(MESSAGES[result.reason]);
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The picture could not be saved.");
    // Transparent PNGs of large photos can outgrow the upload limit; try again smaller.
    if (blob.size <= MAX_BYTES) return new File([blob], `${name.replace(/\.[a-z0-9]+$/i, "") || "image"}-no-background.png`, { type: "image/png" });
  }
  throw new Error("The picture is too large to save with a transparent background.");
}
