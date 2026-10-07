// Typed loaders for the JSON in public/data (written by scripts/pipeline).

import { createContext, useContext } from "react";
import { stimulusFromData, type Stimulus } from "../model/stimulus";
import type {
  GenotypeCase,
  Meta,
  Odorant,
  OdorantPairs,
  PredictionSummary,
  Receptor,
  Reference,
  StructureEntry,
} from "./types";

export interface AppData {
  meta: Meta;
  receptors: Receptor[];
  receptorIndex: Map<string, Receptor>;
  /** Receptor order used by every barcode, grid and bulb layout. */
  order: string[];
  structures: StructureEntry[];
  odorants: Odorant[];
  odorantIndex: Map<string, Odorant>;
  pairs: Map<string, OdorantPairs>;
  stimuli: Map<string, Stimulus>;
  genotypeCases: GenotypeCase[];
  references: Reference[];
  refIndex: Map<string, Reference>;
  /** Headline numbers for the Phase 2/3 predictors (small, always loaded). */
  prediction: PredictionSummary;
}

// Honours vite's relative base so the static build works from any sub-path.
const url = (f: string) => new URL(`data/${f}`, document.baseURI).href;

async function getJSON<T>(f: string): Promise<T> {
  const r = await fetch(url(f));
  if (!r.ok) throw new Error(`Could not load ${f} (${r.status})`);
  return r.json() as Promise<T>;
}

export async function loadData(): Promise<AppData> {
  const [rec, od, pr, gt, refs, pred] = await Promise.all([
    getJSON<{ meta: Meta; receptors: Receptor[]; structures: StructureEntry[] }>("receptors.json"),
    getJSON<{ odorants: Odorant[] }>("odorants.json"),
    getJSON<{ odorants: OdorantPairs[] }>("pairs.json"),
    getJSON<{ cases: GenotypeCase[] }>("genotypes.json"),
    getJSON<{ references: Reference[] }>("references.json"),
    getJSON<PredictionSummary>("prediction_summary.json"),
  ]);
  const pairs = new Map(pr.odorants.map((p) => [p.odorant, p]));
  const refIndex = new Map<string, Reference>();
  for (const r of refs.references) {
    if (r.doi) refIndex.set(r.doi.toLowerCase(), r);
    if (r.id) refIndex.set(r.id, r);
  }
  return {
    meta: rec.meta,
    receptors: rec.receptors,
    receptorIndex: new Map(rec.receptors.map((r) => [r.gene, r])),
    order: rec.receptors.map((r) => r.gene),
    structures: rec.structures,
    odorants: od.odorants,
    odorantIndex: new Map(od.odorants.map((o) => [o.id, o])),
    pairs,
    stimuli: new Map(od.odorants.map((o) => [o.id, stimulusFromData(o, pairs.get(o.id))])),
    genotypeCases: gt.cases,
    references: refs.references,
    refIndex,
    prediction: pred,
  };
}

export const DataContext = createContext<AppData | null>(null);

export function useData(): AppData {
  const d = useContext(DataContext);
  if (!d) throw new Error("Data not loaded");
  return d;
}
