export type Pt = [number, number];
export type Cubic = [Pt, Pt, Pt, Pt];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic pseudo-random number in [0, 1) for index i (stable across renders). */
export function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function cubicAt([p0, p1, p2, p3]: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** Point at parameter u (0–1) along consecutive cubic segments. */
export function pathAt(segs: Cubic[], u: number): Pt {
  const v = clamp01(u) * segs.length;
  const i = Math.min(segs.length - 1, Math.floor(v));
  return cubicAt(segs[i], v - i);
}

export function cubicD(segs: Cubic[]): string {
  return segs
    .map(([p0, p1, p2, p3], i) => `${i === 0 ? `M${p0[0]} ${p0[1]} ` : ""}C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`)
    .join(" ");
}

/** Point at distance d along a polyline. */
export function polylineAt(pts: Pt[], d: number): Pt | null {
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (left <= len) {
      const t = left / len;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    left -= len;
  }
  return null;
}

export function polylineLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/**
 * Split n marks between components in proportion to `weights` (largest
 * remainder, so the counts add up to exactly n), then interleave them
 * deterministically — otherwise every component's molecules would arrive in one
 * block and the colours would read as a sequence rather than a mixture.
 * Returns one component index per mark.
 */
export function allocateMarks(weights: number[], n: number): number[] {
  if (!weights.length) return [];
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return Array.from({ length: n }, (_, i) => i % weights.length);
  const exact = weights.map((w) => (Math.max(0, w) / total) * n);
  const counts = exact.map((x) => Math.floor(x));
  let left = n - counts.reduce((s, c) => s + c, 0);
  // Hand the remaining marks to the largest fractional parts first.
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; left > 0; k++, left--) counts[order[k % order.length].i]++;
  const flat: number[] = [];
  counts.forEach((c, i) => {
    for (let k = 0; k < c; k++) flat.push(i);
  });
  return flat.map((v, i) => ({ v, r: rand(i * 3 + 11) })).sort((a, b) => a.r - b.r).map((x) => x.v);
}
