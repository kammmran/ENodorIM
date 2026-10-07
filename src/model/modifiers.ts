// Every person-selector effect lives here, with its source and a comment on
// the value. Receptor genotype is the only modifier that changes receptor
// activation, and it uses measured allele data (see stimulus.ts). Age applies
// only a small shift after the receptor stage. Where the literature gives a
// direction but no usable number, the value is marked "illustrative".

export type AgeBand = "young" | "older";

export interface PersonProfile {
  age: AgeBand;
  /** Genotype id per genotype case id, e.g. { "OR7D4-androstenone": "RT/WM" }. */
  genotypes: Record<string, string>;
}

export const DEFAULT_PROFILE: PersonProfile = { age: "young", genotypes: {} };

export type ModifierLevel = "Receptors and transduction" | "Olfactory bulb" | "Behaviour" | "Cortex";
export type ModifierTarget =
  | "receptor-activation"
  | "detection-threshold"
  | "late-appraisal"
  | "cortical-activation"
  | "none";

export interface Modifier {
  id: string;
  level: ModifierLevel;
  finding: string;
  evidence: string;
  target: ModifierTarget;
  kind: "measured" | "illustrative" | "note";
  doi?: string;
  /** Multiplier for the target; 1 = no change. */
  value: (p: PersonProfile) => number;
  applies: (p: PersonProfile) => boolean;
  comment: string;
}

const always = () => true;
const one = () => 1;

export const MODIFIERS: Modifier[] = [
  {
    id: "receptor-genotype",
    level: "Receptors and transduction",
    finding: "Receptor genotype changes how strongly a receptor responds (OR7D4 for androstenone, OR2J3 for cis-3-hexen-1-ol).",
    evidence: "Alleles measured in the same paper (cell assays) and linked to perception in that study.",
    target: "receptor-activation",
    kind: "measured",
    value: one,
    applies: always,
    comment:
      "Allele activation comes from that paper's EC50 or 'no response'. A heterozygote is half of each, because each " +
      "sensory neuron expresses one allele (monoallelic expression, rodent data).",
    doi: "10.1016/s0092-8674(94)90562-2",
  },
  {
    id: "age-cortex",
    level: "Cortex",
    finding:
      "In older adults, age was negatively correlated with activation in olfactory regions (primary olfactory cortex, insula, hippocampus).",
    evidence: "fMRI, n = 37 older adults.",
    target: "cortical-activation",
    kind: "illustrative",
    doi: "10.18632/oncotarget.16977",
    value: (p) => (p.age === "older" ? 0.82 : 1),
    applies: (p) => p.age === "older",
    comment:
      "Applied to primary olfactory cortex, insula and hippocampus. The multiplier is illustrative; only the " +
      "direction (lower in older adults) comes from the study.",
  },
];

function product(p: PersonProfile, target: ModifierTarget): number {
  return MODIFIERS.filter((m) => m.target === target && m.applies(p)).reduce((acc, m) => acc * m.value(p), 1);
}

/** Relative detection threshold (1 = reference). Lower means more sensitive. */
export const detectionThresholdFactor = (p: PersonProfile) => product(p, "detection-threshold");
/** Multiplier on the late appraisal signal in the perception stage. */
export const appraisalFactor = (p: PersonProfile) => product(p, "late-appraisal");
/** Multiplier on activation of the regions named in the age modifier. */
export const AGE_SENSITIVE_REGIONS = ["piriform-frontal", "piriform-temporal", "aon", "tubercle", "insula", "hippocampus"];
export const corticalFactor = (p: PersonProfile, region: string) =>
  AGE_SENSITIVE_REGIONS.includes(region) ? product(p, "cortical-activation") : 1;

export function activeModifiers(p: PersonProfile): Modifier[] {
  return MODIFIERS.filter((m) => m.applies(p));
}
