// Loads the nearest-neighbour index and turns a drawn molecule into a Stimulus.
//
// This is the whole of the Phase 2 seam: the simulation consumes the same
// Stimulus type as a measured odorant, with provenance "predicted".

import type { DescriptorSet, Odorant } from "./types";
import {
  nearest,
  predictDescriptors,
  predictReceptors,
  predictedPairs,
  type DescriptorPrediction,
  type Neighbour,
  type PredictIndex,
  type ReceptorPrediction,
} from "../model/predict";
import { dataState, evidenceTier } from "../model/evidence";
import { RELIABLE_AUC, byReceptor, scoreAll, type LearnedModel, type LearnedPrediction } from "../model/learned";
import type { ResponseModel, Stimulus } from "../model/stimulus";

export interface PredictBundle {
  index: PredictIndex;
  fingerprints: Uint8Array;
  model: LearnedModel;
}

let bundle: Promise<PredictBundle> | null = null;

/** Fetch the index and fingerprint blob once (about 2 MB together). */
export function loadPredictBundle(): Promise<PredictBundle> {
  if (!bundle) {
    const url = (f: string) => new URL(`data/${f}`, document.baseURI).href;
    bundle = Promise.all([
      fetch(url("predict_index.json")).then((r) => {
        if (!r.ok) throw new Error(`predict_index.json (${r.status})`);
        return r.json() as Promise<PredictIndex>;
      }),
      fetch(url("predict_fp.bin")).then(async (r) => {
        if (!r.ok) throw new Error(`predict_fp.bin (${r.status})`);
        return new Uint8Array(await r.arrayBuffer());
      }),
      fetch(url("predict_model.json")).then((r) => {
        if (!r.ok) throw new Error(`predict_model.json (${r.status})`);
        return r.json() as Promise<LearnedModel>;
      }),
    ]).then(([index, fingerprints, model]) => ({ index, fingerprints, model }));
  }
  return bundle;
}

export interface Prediction {
  smiles: string;
  inchikey: string | null;
  receptors: ReceptorPrediction[];
  /** Per-receptor logistic regression scores, where a model exists. */
  learned: LearnedPrediction[];
  learnedByReceptor: Map<string, LearnedPrediction>;
  descriptors: DescriptorPrediction[];
  receptorNeighbours: Neighbour[];
  descriptorNeighbours: Neighbour[];
  /** Set when the drawn molecule is itself in the measured dataset. */
  knownAs: { name: string; inchikey: string } | null;
}

export const NEIGHBOURS_K = 40;
export const DESCRIPTOR_K = 25;

export function predict(b: PredictBundle, smiles: string, fingerprint: Uint8Array, inchikey: string | null): Prediction {
  const { index, fingerprints } = b;
  const nb = index.fingerprint.n_bytes;
  // If the molecule is already measured, exclude it from its own evidence so
  // the prediction is an honest out-of-sample one; the measured data is shown
  // separately.
  const known = inchikey ? index.receptors.molecules.find((m) => m.inchikey === inchikey) : undefined;
  const exclude = inchikey ?? undefined;
  const rn = nearest(fingerprint, fingerprints, index.receptors.molecules, index.receptors.offset, nb, {
    k: NEIGHBOURS_K,
    exclude,
  });
  const dn = nearest(fingerprint, fingerprints, index.descriptors.molecules, index.descriptors.offset, nb, {
    k: DESCRIPTOR_K,
    exclude,
  });
  const learned = scoreAll(index && b.model ? b.model : ({ receptors: [] } as unknown as LearnedModel), fingerprint);
  return {
    smiles,
    inchikey,
    learned,
    learnedByReceptor: byReceptor(learned),
    receptors: predictReceptors(rn),
    descriptors: predictDescriptors(dn),
    receptorNeighbours: rn,
    descriptorNeighbours: dn,
    knownAs: known ? { name: known.name, inchikey: known.inchikey } : null,
  };
}

export const DRAWN_ID = "__drawn__";

/**
 * The score the simulation uses for a receptor: the learned model where its
 * cross-validated AUC says it can be trusted, otherwise the neighbour vote.
 */
export function combinedScore(p: Prediction, receptor: string, neighbourScore: number): { score: number; from: "model" | "neighbours" } {
  const l = p.learnedByReceptor.get(receptor);
  return l && l.auc >= RELIABLE_AUC ? { score: l.probability, from: "model" } : { score: neighbourScore, from: "neighbours" };
}

/** The drawn molecule as an Odorant, so existing panels can render it. */
export function predictedOdorant(p: Prediction, name = "Drawn molecule"): Odorant {
  const descriptors: DescriptorSet[] = p.descriptors.length
    ? [
        {
          source: "leffingwell",
          match: "predicted",
          name,
          raw: p.descriptors.map((d) => d.label).join(", "),
          labels: p.descriptors.filter((d) => d.weight >= 0.1).map((d) => d.label),
        },
      ]
    : [];
  return {
    id: DRAWN_ID,
    name,
    inchikey: p.inchikey ?? "",
    m2or_inchikey: null,
    m2or_match: "none",
    m2or_name: null,
    stereo_alternatives_in_m2or: [],
    cid: null,
    smiles: p.smiles,
    formula: null,
    mw: null,
    iupac: null,
    descriptors,
    provenance: "predicted",
  };
}

/** The drawn molecule as a Stimulus the simulation can run unchanged. */
export function predictedStimulus(p: Prediction, name = "Drawn molecule"): Stimulus {
  const responses = new Map<string, ResponseModel>();
  for (const pair of predictedPairs(p.receptors)) {
    responses.set(pair.receptor, {
      receptor: pair.receptor,
      state: dataState(pair),
      evidence: evidenceTier(pair),
      provenance: "predicted",
      pair,
    });
  }
  return {
    id: DRAWN_ID,
    label: name,
    inchikey: p.inchikey,
    smiles: p.smiles,
    provenance: "predicted",
    responses,
    variants: [],
    percept: predictedOdorant(p, name).descriptors,
  };
}
