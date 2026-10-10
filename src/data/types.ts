// Shapes of the JSON written by scripts/pipeline (data/processed/*.json).

export type Provenance = "measured" | "predicted" | "schematic";
export type PairStatus = "agonist" | "non_agonist" | "inconclusive";
export type Quality = "ec50" | "secondaryScreening" | "primaryScreening" | "screening";

export interface Meta {
  built: string;
  m2or_file: string;
  filters: string;
  untested: string;
}

export interface Ec50Value {
  log_ec50: number;
  doi: string;
  rounded: boolean;
}

export interface PairRecord {
  receptor: string;
  allele?: string;
  status: PairStatus;
  quality: Quality;
  provenance: Provenance;
  reason?: string;
  log_ec50?: number;
  ec50_values?: Ec50Value[];
  log_ec50_gt?: number;
  ec50_below_assay_range?: boolean;
  max_conc_um?: number;
  min_resp_um?: number;
  n_positive: number;
  n_experiments: number;
  dois: string[];
  assays: string[];
}

export interface OdorantPairs {
  odorant: string;
  pairs: PairRecord[];
  variant_pairs: PairRecord[];
}

export interface LeffingwellDescriptors {
  source: "leffingwell";
  match: string;
  name: string;
  raw: string;
  labels: string[];
}
export interface DravnieksDescriptors {
  source: "dravnieks_1985";
  match: string;
  name: string;
  concentration: string;
  applicability: Record<string, number>;
}
export interface KellerDescriptors {
  source: "keller_2016";
  dilution: string;
  n_panelists: number;
  intensity: number | null;
  pleasantness: number | null;
  familiarity: number | null;
  descriptors: Record<string, { share: number; mean: number }>;
}
export type DescriptorSet = LeffingwellDescriptors | DravnieksDescriptors | KellerDescriptors;

export interface Odorant {
  id: string;
  name: string;
  inchikey: string;
  m2or_inchikey: string | null;
  m2or_match: string;
  m2or_name: string | null;
  stereo_alternatives_in_m2or: { inchikey: string; name: string; n_tested: number }[];
  cid: number | null;
  smiles: string | null;
  formula: string | null;
  mw: number | null;
  iupac: string | null;
  descriptors: DescriptorSet[];
  provenance: Provenance;
}

export interface Receptor {
  gene: string;
  hgnc_id: string | null;
  horde_id: string | null;
  locus_type: string | null;
  location: string | null;
  cls: "I" | "II" | null;
  family: number | null;
  subfamily: string | null;
  uniprot: string | null;
  length: number | null;
  gpcrdb: string | null;
  gpcrdb_class: string | null;
  structure:
    | { source: "pdb"; id: string }
    | { source: "alphafold"; id: string; version: number; plddt: number; cif: string }
    | null;
  n_tested: number;
  n_agonists: number;
  n_inconclusive: number;
  agonists: { inchikey: string; name: string; quality: Quality; log_ec50: number | null; below_assay_range?: boolean; dois: string[] }[];
  alleles_tested: string[];
  functional_variants: { allele: string; differs_for: { inchikey: string; name: string; ref: PairStatus; variant: PairStatus }[] }[];
  m2or_names: string[];
}

export interface StructureContact {
  chain: string;
  residue: string;
  number: number;
  distance: number;
  ligand_atom: string;
  residue_atom: string;
  segment: string | null;
  generic_number: string | null;
  kind: string;
}

export interface StructureEntry {
  pdb: string;
  receptor: string;
  ligand: string | null;
  ligand_id: string | null;
  method: string;
  resolution: number;
  doi: string;
  note: string;
  bundled: boolean;
  contacts?: StructureContact[];
  contacts_note?: string;
}

export interface GenotypeAllele {
  m2or_allele: string | null;
  haplotype?: string;
  note: string;
  n_rows: number;
  status: "agonist" | "non_agonist" | "untested";
  log_ec50: number | null;
  max_tested_um: number | null;
}

export interface GenotypeCase {
  id: string;
  receptor: string;
  odorant: string;
  doi: string;
  alleles: Record<string, GenotypeAllele>;
  genotypes: { id: string; alleles: [string, string]; perception: string | null }[];
  perception: string;
  conflict: { text: string; doi: string } | null;
  expression: { text: string; doi: string };
  /** Set when the allele values were read from a paper rather than from M2OR. */
  curation?: string;
  provenance: Provenance;
}

export interface PredictionSummary {
  meta: { built: string };
  neighbours: {
    reference_molecules: number;
    descriptor_molecules: number;
    fingerprint: { radius: number; n_bits: number; chirality: boolean };
    molecules_scored: number;
    precision: number;
    recall: number;
    top1_accuracy: number;
    top1_n: number;
    threshold: number;
    k: number;
  };
  model: {
    scheme: string;
    receptors: number;
    mean_model_auc: number;
    mean_knn_auc: number;
    mean_model_ap: number;
    mean_knn_ap: number;
    model_better: number;
    knn_better: number;
    trained: number;
    best_receptor: string;
    best_auc: number;
  };
}

export interface Reference {
  doi?: string;
  id?: string;
  url?: string;
  title: string | null;
  authors: string | null;
  year: number | null;
  journal: string | null;
  volume?: string | null;
  page?: string | null;
  type?: string;
  source_type?: string | null;
  resolved: string | null;
  cited_for: string | null;
}

/**
 * Output of scripts/pipeline/benchmark_models.py: every model family scored
 * under both flat and nested cross-validation. Loaded only by the benchmark
 * page, so it stays out of the initial payload.
 */
export interface ModelBenchmark {
  kind: "model-benchmark";
  molecules: number;
  receptors: number;
  seconds: number;
  scheme: {
    outer_folds: number;
    inner_folds: number;
    repeats: number;
    metric: string;
    flat: string;
    nested: string;
  };
  families: BenchmarkFamily[];
  per_receptor: BenchmarkReceptor[];
}

export interface BenchmarkFamily {
  family: string;
  label: string;
  note: string;
  grid_size: number;
  mean_flat_auc: number;
  mean_nested_auc: number;
  median_nested_auc: number;
  /** flat minus nested: what tuning on the test folds buys you for free. */
  optimism: number;
  mean_nested_ap: number;
  mean_flat_ap: number;
  beats_shipped: number;
  loses_to_shipped: number;
  mean_delta_vs_shipped: number;
  wilcoxon_p: number | null;
  most_chosen: string | null;
}

export interface BenchmarkReceptor {
  receptor: string;
  n: number;
  positives: number;
  results: {
    family: string;
    flat_auc: number;
    flat_auc_sd: number;
    flat_ap: number;
    nested_auc: number;
    nested_auc_sd: number;
    nested_ap: number;
    grid_size: number;
    chosen: string | null;
    chosen_distinct: number;
  }[];
}
