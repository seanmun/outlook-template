"use client";
import { useEffect, useRef } from "react";

/** Must match the .grid-paper background in globals.css. */
const CELL = 56;
/** How long a released key takes to spring most of the way back, in ms. */
const RELEASE_MS = 260;
const RIPPLE_SPEED = 0.012; // cells per ms
const RIPPLE_REACH = 9; // cells

interface Ripple {
  cx: number;
  cy: number;
  start: number;
}

/**
 * The home page grid behaves like a keyboard: the cell under the pointer sinks, then springs back,
 * so the mouse leaves a short fading trail, and a click sends a ripple outward.
 * Decoration only: desktop pointers only, off for reduced motion, and it never takes clicks.
 * It draws only the pressed cells; the grid lines themselves are the CSS background underneath.
 */
export function GridKeys() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const allowed = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)");

    /** Pressed amount per cell, 0..1, keyed "column,row" in page coordinates. */
    const cells = new Map<string, number>();
    let ripples: Ripple[] = [];
    let pointer: { x: number; y: number } | null = null; // viewport coordinates
    let frame = 0;
    let last = 0;

    // The canvas's own box, not window.innerWidth: that includes the scrollbar, which would stretch
    // the drawing and push cells further off the grid lines the further right they are.
    let width = 0;
    let height = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    };

    const draw = (now: number) => {
      frame = 0;
      const dt = Math.min(now - last, 50);
      last = now;
      const hover = pointer && allowed.matches ? `${Math.floor(pointer.x / CELL)},${Math.floor((pointer.y + window.scrollY) / CELL)}` : null;

      // Keys spring back, except the one under the pointer, which is held down.
      const release = Math.exp(-dt / RELEASE_MS);
      for (const [key, v] of cells) {
        if (key === hover) continue;
        const next = v * release;
        if (next < 0.02) cells.delete(key);
        else cells.set(key, next);
      }
      if (hover) {
        const v = cells.get(hover) ?? 0;
        cells.set(hover, v + (1 - v) * Math.min(1, dt / 50));
      }

      // Each ripple is a ring of keys pressed as it passes, weaker the further it travels.
      ripples = ripples.filter((r) => (now - r.start) * RIPPLE_SPEED < RIPPLE_REACH);
      for (const r of ripples) {
        const radius = (now - r.start) * RIPPLE_SPEED;
        const strength = 0.9 * (1 - radius / RIPPLE_REACH);
        const span = Math.ceil(radius) + 1;
        for (let dx = -span; dx <= span; dx++) {
          for (let dy = -span; dy <= span; dy++) {
            if (Math.abs(Math.hypot(dx, dy) - radius) > 0.5) continue;
            const key = `${r.cx + dx},${r.cy + dy}`;
            cells.set(key, Math.max(cells.get(key) ?? 0, strength));
          }
        }
      }

      ctx.clearRect(0, 0, width, height);
      const scroll = window.scrollY;
      for (const [key, v] of cells) {
        const [cx, cy] = key.split(",").map(Number);
        const x = cx * CELL + 1; // inside the 1px grid line
        const y = cy * CELL + 1 - scroll;
        const s = CELL - 1;
        if (y > height || y + s < 0) continue;
        // A sunk key: darker face, shadow along the top and left, a lit edge along the bottom and right.
        ctx.fillStyle = `rgba(23,23,23,${0.05 * v})`;
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = `rgba(23,23,23,${0.1 * v})`;
        ctx.fillRect(x, y, s, 3);
        ctx.fillRect(x, y + 3, 3, s - 3);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * v})`;
        ctx.fillRect(x + 3, y + s - 2, s - 3, 2);
        ctx.fillRect(x + s - 2, y + 3, 2, s - 5);
      }

      // Rest when nothing is moving: a key held fully down under a still pointer needs no redraw.
      const settled = ripples.length === 0 && (cells.size === 0 || (cells.size === 1 && hover !== null && (cells.get(hover) ?? 0) > 0.995));
      if (!settled) frame = requestAnimationFrame(draw);
    };
    const kick = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer = { x: e.clientX, y: e.clientY };
      kick();
    };
    const leave = () => {
      pointer = null;
      kick();
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !allowed.matches) return;
      ripples.push({ cx: Math.floor(e.clientX / CELL), cy: Math.floor((e.clientY + window.scrollY) / CELL), start: performance.now() });
      if (ripples.length > 4) ripples.shift();
      kick();
    };
    const resize = () => {
      size();
      kick();
    };

    size();
    // Catches the scrollbar appearing or going, which changes the canvas width without a window resize.
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", resize);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", resize);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  // Behind the page content (the wrapper is its own stacking context) and never in the way of clicks.
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden h-full w-full lg:block" />;
}
