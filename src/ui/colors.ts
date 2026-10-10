import { interpolateLab } from "d3-interpolate";
import { scaleLinear } from "d3-scale";
import { useEffect, useState } from "react";
import { useStore } from "../state/store";

// The activation ramp is one hue (sequential), defined as CSS tokens per theme
// (light: pale → dark; dark: the anchor flips so low values recede into the surface).
// Charts read the tokens at runtime so both themes use the same code.

export interface Palette {
  ramp: (a: number) => string;
  /** Categorical hues in fixed order, for identity (mixture components). */
  cats: string[];
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  axis: string;
  surface: string;
  surface2: string;
  accent: string;
  series1: string;
  series2: string;
  mucus: string;
  tissue: string;
}

function read(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const stops = [v("--act-0"), v("--act-1"), v("--act-2"), v("--act-3"), v("--act-4")];
  const scale = scaleLinear<string>().domain([0, 0.25, 0.5, 0.75, 1]).range(stops).interpolate(interpolateLab).clamp(true);
  return {
    ramp: (a: number) => scale(a),
    cats: [1, 2, 3, 4, 5, 6].map((n) => v(`--cat-${n}`)),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    muted: v("--muted"),
    line: v("--line"),
    axis: v("--axis"),
    surface: v("--surface"),
    surface2: v("--surface-2"),
    accent: v("--accent"),
    series1: v("--series-1"),
    series2: v("--series-2"),
    mucus: v("--mucus"),
    tissue: v("--tissue"),
  };
}

/** Theme-aware palette; re-reads the CSS tokens when the theme changes. */
export function usePalette(): Palette {
  const theme = useStore((s) => s.theme);
  const [pal, setPal] = useState<Palette>(() => read());
  useEffect(() => {
    setPal(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setPal(read());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return pal;
}

/**
 * How many components get their own hue. Categorical slots are assigned in
 * fixed order and never cycled, so anything past the last slot is shown in the
 * neutral "other" grey rather than repeating a colour that already means
 * something else.
 */
export const CAT_SLOTS = 6;

/** Colour for the n-th item of a categorical set, or neutral past the slots. */
export function catColor(pal: Palette, i: number): string {
  return i < pal.cats.length ? pal.cats[i] : pal.muted;
}

/**
 * A one-hue sequential ramp built from a categorical colour: the activation
 * ramp's job (magnitude) in a component's own hue, so a barcode can show both
 * which component drives a receptor and how hard. Anchored on the sunken
 * surface, so it reads the same way in both themes.
 */
export function tintRamp(pal: Palette, color: string): (a: number) => string {
  const mix = interpolateLab(pal.surface2, color);
  const scale = scaleLinear<string>()
    .domain([0, 0.5, 1])
    .range([mix(0.38), mix(0.72), color])
    .interpolate(interpolateLab)
    .clamp(true);
  return (a: number) => scale(a);
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return r;
}
