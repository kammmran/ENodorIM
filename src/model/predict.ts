// Transparent nearest-neighbour prediction for a molecule with no measured data.
//
// A drawn molecule is fingerprinted in the browser (RDKit.js, Morgan radius 2,
// 2048 bits — bit-identical to the Python fingerprints in the index) and
// compared by Tanimoto similarity to molecules that *do* have data.
//
//   receptor r is predicted to respond with
//     score(r) = Σ sim(n) over neighbours that activate r
//              / Σ sim(n) over neighbours that were tested on r
//
// so the score is "how much of the similar, actually-tested evidence says yes".
// Receptors no neighbour was tested on stay unknown rather than predicted
// negative. Every prediction carries the molecules it came from, so the user
// can judge it — this is a baseline to be read as evidence, not an oracle.

import type { PairRecord, Provenance } from "../data/types";

export interface IndexMolecule {
  inchikey: string;
  name: string;
  smiles: string;
  cid?: number | null;
  n_tested?: number;
  agonists?: { r: string; ec50: number | null; q: string }[];
  inactive?: string[];
  labels?: string[];
}

export interface PredictEvaluation {
  molecules_scored: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  top1_accuracy: number;
  top1_n: number;
  k: number;
  min_similarity: number;
  min_support: number;
  threshold: number;
}

export interface PredictIndex {
  fingerprint: {
    kind: string;
    radius: number;
    n_bits: number;
    n_bytes: number;
    chirality: boolean;
    /** Passed straight to RDKit.js get_morgan_fp so the bits match. */
    js_options: { radius: number; nBits: number; useChirality: boolean };
    note: string;
  };
  evaluation?: PredictEvaluation;
  receptors: { offset: number; count: number; source: string; doi: string; molecules: IndexMolecule[] };
  descriptors: { offset: number; count: number; source: string; doi: string; molecules: IndexMolecule[] };
}

export interface Neighbour {
  molecule: IndexMolecule;
  similarity: number;
}

const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1];

/** Tanimoto similarity between two packed fingerprints of nBytes each. */
export function tanimoto(a: Uint8Array, aOff: number, b: Uint8Array, bOff: number, nBytes: number): number {
  let both = 0, either = 0;
  for (let i = 0; i < nBytes; i++) {
    const x = a[aOff + i], y = b[bOff + i];
    both += POPCOUNT[x & y];
    either += POPCOUNT[x | y];
  }
  return either === 0 ? 0 : both / either;
}

export interface NearestOptions {
  k?: number;
  /** Ignore neighbours below this similarity. */
  minSimilarity?: number;
  /** InChIKey to leave out — used for hold-one-out checks. */
  exclude?: string;
}

export function nearest(
  query: Uint8Array,
  fps: Uint8Array,
  molecules: IndexMolecule[],
  offset: number,
  nBytes: number,
  opts: NearestOptions = {},
): Neighbour[] {
  const { k = 40, minSimilarity = 0.2, exclude } = opts;
  const out: Neighbour[] = [];
  for (let i = 0; i < molecules.length; i++) {
    const m = molecules[i];
    if (exclude && m.inchikey === exclude) continue;
    const s = tanimoto(query, 0, fps, (offset + i) * nBytes, nBytes);
    if (s >= minSimilarity) out.push({ molecule: m, similarity: s });
  }
  out.sort((p, q) => q.similarity - p.similarity);
  return out.slice(0, k);
}

export interface ReceptorPrediction {
  receptor: string;
  /** Share of similar, tested evidence that says this receptor responds (0–1). */
  score: number;
  /** Similarity-weighted mean of neighbours' log10 EC50 (M), when any is known. */
  logEc50: number | null;
  /** Total similarity of neighbours that were tested on this receptor. */
  support: number;
  for: { name: string; inchikey: string; similarity: number; ec50: number | null }[];
  against: { name: string; inchikey: string; similarity: number }[];
}

/**
 * Minimum summed similarity of neighbours actually tested on a receptor before
 * it is reported at all. Set so that one moderately similar molecule is not
 * enough: hold-one-out showed single weak neighbours producing confident-looking
 * score-1.0 predictions from a single measurement.
 */
export const MIN_SUPPORT = 1.0;
/** Score at or above which a receptor is predicted to respond. */
export const SCORE_THRESHOLD = 0.5;

export function predictReceptors(neighbours: Neighbour[]): ReceptorPrediction[] {
  const acc = new Map<string, ReceptorPrediction>();
  const get = (r: string) => {
    let p = acc.get(r);
    if (!p) {
      p = { receptor: r, score: 0, logEc50: null, support: 0, for: [], against: [] };
      acc.set(r, p);
    }
    return p;
  };
  const yes = new Map<string, number>();
  for (const n of neighbours) {
    for (const a of n.molecule.agonists ?? []) {
      const p = get(a.r);
      p.support += n.similarity;
      yes.set(a.r, (yes.get(a.r) ?? 0) + n.similarity);
      p.for.push({ name: n.molecule.name, inchikey: n.molecule.inchikey, similarity: n.similarity, ec50: a.ec50 });
    }
    for (const r of n.molecule.inactive ?? []) {
      const p = get(r);
      p.support += n.similarity;
      p.against.push({ name: n.molecule.name, inchikey: n.molecule.inchikey, similarity: n.similarity });
    }
  }
  const out: ReceptorPrediction[] = [];
  for (const p of acc.values()) {
    if (p.support < MIN_SUPPORT) continue;
    p.score = (yes.get(p.receptor) ?? 0) / p.support;
    const withEc50 = p.for.filter((f) => f.ec50 !== null && f.ec50 !== undefined);
    if (withEc50.length) {
      const w = withEc50.reduce((s, f) => s + f.similarity, 0);
      p.logEc50 = withEc50.reduce((s, f) => s + f.similarity * (f.ec50 as number), 0) / w;
    }
    p.for.sort((a, b) => b.similarity - a.similarity);
    p.against.sort((a, b) => b.similarity - a.similarity);
    out.push(p);
  }
  out.sort((a, b) => b.score - a.score || b.support - a.support || a.receptor.localeCompare(b.receptor));
  return out;
}

export interface DescriptorPrediction {
  label: string;
  /** Similarity-weighted share of neighbours carrying this label (0–1). */
  weight: number;
  from: { name: string; similarity: number }[];
}

export function predictDescriptors(neighbours: Neighbour[], max = 10): DescriptorPrediction[] {
  const total = neighbours.reduce((s, n) => s + n.similarity, 0);
  if (total === 0) return [];
  const acc = new Map<string, DescriptorPrediction>();
  for (const n of neighbours) {
    for (const label of n.molecule.labels ?? []) {
      let d = acc.get(label);
      if (!d) {
        d = { label, weight: 0, from: [] };
        acc.set(label, d);
      }
      d.weight += n.similarity / total;
      d.from.push({ name: n.molecule.name, similarity: n.similarity });
    }
  }
  const out = [...acc.values()];
  for (const d of out) d.from.sort((a, b) => b.similarity - a.similarity);
  out.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
  return out.slice(0, max);
}

/**
 * Predicted receptor responses as PairRecords, so the existing simulation can
 * consume a drawn molecule unchanged. Provenance is "predicted" throughout.
 */
export function predictedPairs(preds: ReceptorPrediction[]): PairRecord[] {
  return preds
    .filter((p) => p.score >= SCORE_THRESHOLD)
    .map((p) => {
      const dois = [...new Set(p.for.map((f) => f.inchikey))].slice(0, 0);
      const rec: PairRecord = {
        receptor: p.receptor,
        status: "agonist",
        quality: p.logEc50 !== null ? "ec50" : "primaryScreening",
        provenance: "predicted" as Provenance,
        n_positive: p.for.length,
        n_experiments: p.for.length + p.against.length,
        dois,
        assays: [],
      };
      if (p.logEc50 !== null) rec.log_ec50 = Number(p.logEc50.toFixed(3));
      // Without a predicted EC50 the molecule still "responds", qualitatively,
      // from the lowest concentration the simulation shows.
      else rec.min_resp_um = 0.01;
      return rec;
    });
}
