"use client";
/**
 * Tiny synthesized interface sounds (no audio files). Quiet by design, and
 * optional: the choice is remembered in this browser.
 */
import { useSyncExternalStore } from "react";

export type Sfx = "drop" | "remove" | "move";

const KEY = "otb.sfx";
let ctx: AudioContext | null = null;

export function sfxEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

export function setSfxEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage unavailable: the setting just won't persist.
  }
  listeners.forEach((l) => l());
}

/** The current on/off choice, re-rendering when it changes. On the server it reads as on. */
export function useSfxEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    sfxEnabled,
    () => true,
  );
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Browsers only allow sound after a user gesture; call this from one so later sounds (e.g. when the AI finishes) can play. */
export function primeSfx() {
  if (sfxEnabled()) audio();
}

function tone(ac: AudioContext, at: number, opts: { from: number; to: number; ms: number; gain: number; type?: OscillatorType }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.from, at);
  osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.ms / 1000);
  g.gain.setValueAtTime(opts.gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + opts.ms / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + opts.ms / 1000 + 0.02);
}

function click(ac: AudioContext, at: number, gain: number) {
  const len = Math.floor(ac.sampleRate * 0.012);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = "highpass";
  filter.frequency.value = 1800;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at);
}

/** Plays a sound `count` times in quick succession (capped), e.g. one per block the AI dropped in. */
export function playSfx(kind: Sfx, count = 1) {
  if (!sfxEnabled()) return;
  const ac = audio();
  if (!ac) return;
  for (let i = 0; i < Math.min(count, 6); i++) {
    const t = ac.currentTime + 0.01 + i * 0.07;
    if (kind === "drop") {
      // A soft thunk as the block lands, then a small latch click: "placed and locked".
      tone(ac, t, { from: 190, to: 85, ms: 90, gain: 0.09 });
      click(ac, t, 0.05);
      click(ac, t + 0.055, 0.035);
      tone(ac, t + 0.055, { from: 1500, to: 1100, ms: 30, gain: 0.02, type: "triangle" });
    } else if (kind === "remove") {
      tone(ac, t, { from: 420, to: 150, ms: 110, gain: 0.05, type: "triangle" });
    } else {
      click(ac, t, 0.04);
      tone(ac, t, { from: 700, to: 560, ms: 35, gain: 0.025, type: "triangle" });
    }
  }
}
