import { describe, expect, it } from "vitest";
import { removePlainBackground } from "./remove-background";

/** A w x h picture filled with `bg`, then painted by `paint(x, y)` where it returns a colour. */
function picture(w: number, h: number, bg: number[], paint: (x: number, y: number) => number[] | null) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = paint(x, y) ?? bg;
      px.set([c[0], c[1], c[2], c[3] ?? 255], (y * w + x) * 4);
    }
  return px;
}
const at = (px: Uint8ClampedArray, w: number, x: number, y: number) => [...px.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe("removing a plain background", () => {
  const W = 40;
  const H = 30;
  const inBox = (x: number, y: number) => x >= 10 && x < 30 && y >= 8 && y < 22;

  it("clears a white background and keeps the subject solid", () => {
    const px = picture(W, H, [255, 255, 255], (x, y) => (inBox(x, y) ? [20, 60, 160] : null));
    const r = removePlainBackground(px, W, H);
    expect(r.ok).toBe(true);
    expect(at(px, W, 0, 0)[3]).toBe(0);
    expect(at(px, W, 5, 15)[3]).toBe(0);
    expect(at(px, W, 20, 15)).toEqual([20, 60, 160, 255]);
    expect(at(px, W, 10, 8)).toEqual([20, 60, 160, 255]);
  });

  it("tolerates JPEG noise in the background", () => {
    const px = picture(W, H, [255, 255, 255], (x, y) => (inBox(x, y) ? [200, 30, 30] : [250 - ((x * 7 + y * 3) % 9), 252 - ((x + y) % 6), 249 - ((x * 3) % 8)]));
    expect(removePlainBackground(px, W, H).ok).toBe(true);
    expect(at(px, W, 3, 3)[3]).toBe(0);
    expect(at(px, W, 20, 15)[3]).toBe(255);
  });

  it("keeps a large white area enclosed by the subject", () => {
    // a blue frame with a white middle (4% of the picture): not connected to the edge and too big to be a letter's inside
    const hole = (x: number, y: number) => x >= 16 && x < 24 && y >= 12 && y < 18;
    const px = picture(W, H, [255, 255, 255], (x, y) => (inBox(x, y) && !hole(x, y) ? [20, 60, 160] : null));
    expect(removePlainBackground(px, W, H).ok).toBe(true);
    expect(at(px, W, 20, 15)).toEqual([255, 255, 255, 255]);
    expect(at(px, W, 2, 2)[3]).toBe(0);
  });

  it("clears small enclosed pockets, like the insides of letters", () => {
    // the same frame with a 3x3 white pocket (under 1.5% of the picture)
    const pocket = (x: number, y: number) => x >= 19 && x < 22 && y >= 14 && y < 17;
    const px = picture(W, H, [255, 255, 255], (x, y) => (inBox(x, y) && !pocket(x, y) ? [20, 60, 160] : null));
    const r = removePlainBackground(px, W, H);
    expect(r.ok).toBe(true);
    expect(at(px, W, 20, 15)[3]).toBe(0);
    expect(at(px, W, 12, 10)).toEqual([20, 60, 160, 255]);
    // counted in what was removed: everything outside the box, plus the pocket
    expect(r.ok && Math.round(r.removed * W * H)).toBe(W * H - 20 * 14 + 9);
  });

  it("makes blended edge pixels partly transparent and takes the white out of them", () => {
    // one column of half-blue, half-white pixels along the subject's left side, as anti-aliasing leaves
    const px = picture(W, H, [255, 255, 255], (x, y) => (inBox(x, y) ? [0, 0, 255] : x === 9 && y >= 8 && y < 22 ? [170, 170, 255] : null));
    expect(removePlainBackground(px, W, H).ok).toBe(true);
    const [r, g, b, a] = at(px, W, 9, 15);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
    expect(b).toBe(255);
    expect(r).toBeLessThan(120);
    expect(g).toBeLessThan(120);
  });

  it("works on a coloured background too", () => {
    const px = picture(W, H, [30, 30, 30], (x, y) => (inBox(x, y) ? [240, 200, 40] : null));
    expect(removePlainBackground(px, W, H).ok).toBe(true);
    expect(at(px, W, 1, 1)[3]).toBe(0);
    expect(at(px, W, 20, 15)[3]).toBe(255);
  });

  it("refuses a picture whose edge is not one colour", () => {
    const px = picture(W, H, [0, 0, 0], (x, y) => [(x * 37) % 256, (y * 53) % 256, ((x + y) * 29) % 256]);
    const before = px.slice();
    expect(removePlainBackground(px, W, H)).toEqual({ ok: false, reason: "no-plain-background" });
    expect(px).toEqual(before);
  });

  it("refuses a picture that is already transparent, and one that is a single colour", () => {
    const clear = picture(W, H, [255, 255, 255, 0], (x, y) => (inBox(x, y) ? [20, 60, 160, 255] : null));
    expect(removePlainBackground(clear, W, H)).toEqual({ ok: false, reason: "already-transparent" });
    const flat = picture(W, H, [255, 255, 255], () => null);
    expect(removePlainBackground(flat, W, H)).toEqual({ ok: false, reason: "nothing-left" });
  });
});
