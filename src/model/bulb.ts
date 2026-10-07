// Schematic olfactory bulb: one glomerulus per receptor type.
//
// Axons of OSNs that express the same receptor converge on glomeruli. Humans
// have more than 5,500 glomeruli per bulb, about 16 per receptor type (Maresh
// et al. 2008), and which human receptor maps to which glomerulus is not
// known — so positions here are a layout, not anatomy. Lateral inhibition
// (subtracting a weighted surround) sharpens the pattern; its form and
// strength are illustrative.

export interface GlomerulusPos {
  receptor: string;
  x: number; // 0–1
  y: number; // 0–1
}

/** Place glomeruli on concentric elliptical rings in receptor (family) order. */
export function bulbLayout(order: string[], rings = 4): GlomerulusPos[] {
  const n = order.length;
  const perRing: number[] = [];
  const weights = Array.from({ length: rings }, (_, r) => 1 - r * 0.18);
  const wsum = weights.reduce((a, b) => a + b, 0);
  let left = n;
  for (let r = 0; r < rings; r++) {
    const k = r === rings - 1 ? left : Math.round((n * weights[r]) / wsum);
    perRing.push(k);
    left -= k;
  }
  const out: GlomerulusPos[] = [];
  let idx = 0;
  for (let r = 0; r < rings; r++) {
    const rx = 0.46 - r * 0.075;
    const ry = 0.42 - r * 0.075;
    for (let k = 0; k < perRing[r]; k++) {
      const th = (2 * Math.PI * k) / perRing[r] - Math.PI / 2 + (r % 2) * (Math.PI / perRing[r]);
      out.push({ receptor: order[idx++], x: 0.5 + rx * Math.cos(th), y: 0.5 + ry * Math.sin(th) });
    }
  }
  return out;
}

export interface InhibitionOptions {
  /** Weight of the surround (0 = off). Illustrative. */
  w?: number;
  /** Width of the surround in layout units. Illustrative. */
  sigma?: number;
}

export function lateralInhibition(input: number[], pos: GlomerulusPos[], opts: InhibitionOptions = {}): number[] {
  const w = opts.w ?? 0.6;
  const s2 = 2 * (opts.sigma ?? 0.12) ** 2;
  const n = input.length;
  const out = new Array<number>(n).fill(0);
  const active = input.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < n; i++) {
    if (input[i] <= 0) continue;
    let num = 0, den = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
      const k = Math.exp(-(dx * dx + dy * dy) / s2);
      den += k;
      num += k * input[j];
    }
    // Surround = weighted mean activity of neighbours, scaled by how many are active nearby.
    const surround = den > 0 ? num / den : 0;
    out[i] = Math.max(0, input[i] - w * surround * Math.max(1, active.length / 4));
  }
  return out;
}

/** Fraction of total activity carried by the strongest k glomeruli. */
export function topShare(values: number[], k = 3): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const top = [...values].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
  return top / total;
}
