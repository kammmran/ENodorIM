// Per-receptor logistic regression, evaluated in the browser.
//
// Each receptor's model is a sparse weight vector over fingerprint bits, so
// inference is a dot product over the bits that are set. The model file also
// carries each receptor's cross-validated ROC-AUC, which the interface shows
// as a reliability figure — the models range from near-perfect (OR5AN1) to
// no better than chance, and a single headline number would hide that.

export interface ReceptorModel {
  receptor: string;
  /** Indices of the fingerprint bits this model uses. */
  bits: number[];
  coef: number[];
  intercept: number;
  n: number;
  positives: number;
  /** Cross-validated ROC-AUC for this receptor. */
  auc: number;
}

export interface ModelEvaluationRow {
  receptor: string;
  n: number;
  positives: number;
  model_auc: number;
  knn_auc: number;
  model_ap: number;
  knn_ap: number;
}

export interface LearnedModel {
  kind: string;
  fingerprint: { n_bits: number; n_bytes: number; js_options: { radius: number; nBits: number; useChirality: boolean } };
  trained_on: { source: string; doi: string; molecules: number; min_positives: number; min_negatives: number; C: number };
  evaluation: {
    scheme: string;
    receptors: number;
    mean_model_auc: number;
    mean_knn_auc: number;
    median_model_auc: number;
    median_knn_auc: number;
    mean_model_ap: number;
    mean_knn_ap: number;
    model_better: number;
    knn_better: number;
    tied: number;
    per_receptor: ModelEvaluationRow[];
  };
  receptors: ReceptorModel[];
}

/** AUC at or above which a receptor's model is treated as usable. */
export const RELIABLE_AUC = 0.7;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Is bit `i` set in a packed fingerprint (MSB-first, as numpy.packbits writes)? */
export function bitSet(fp: Uint8Array, i: number): boolean {
  return (fp[i >> 3] & (0x80 >> (i & 7))) !== 0;
}

export interface LearnedPrediction {
  receptor: string;
  probability: number;
  auc: number;
  reliable: boolean;
  n: number;
  positives: number;
}

export function scoreAll(model: LearnedModel, fingerprint: Uint8Array): LearnedPrediction[] {
  const out: LearnedPrediction[] = [];
  for (const r of model.receptors) {
    let z = r.intercept;
    for (let i = 0; i < r.bits.length; i++) if (bitSet(fingerprint, r.bits[i])) z += r.coef[i];
    out.push({
      receptor: r.receptor,
      probability: sigmoid(z),
      auc: r.auc,
      reliable: r.auc >= RELIABLE_AUC,
      n: r.n,
      positives: r.positives,
    });
  }
  out.sort((a, b) => b.probability - a.probability || b.auc - a.auc);
  return out;
}

export function byReceptor(preds: LearnedPrediction[]): Map<string, LearnedPrediction> {
  return new Map(preds.map((p) => [p.receptor, p]));
}
