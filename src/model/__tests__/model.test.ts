import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GenotypeCase, Odorant, OdorantPairs, PairRecord, Receptor } from "../../data/types";
import { CENSORED_LEVEL, QUALITATIVE_LEVEL, hill, pairActivation } from "../activation";
import { bulbLayout, lateralInhibition, topShare } from "../bulb";
import { evidenceTier } from "../evidence";
import { DEFAULT_PROFILE, appraisalFactor, corticalFactor, detectionThresholdFactor, type PersonProfile } from "../modifiers";
import { activationVector, stimulusFromData } from "../stimulus";
import { STAGES, TOTAL_DURATION, locate, physiologicalTime, stageStart } from "../timeline";
import { meanRate, peak, simulateOSN } from "../transduction";

const load = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../../../data/processed/${f}`, import.meta.url), "utf8"));
const receptors = load<{ receptors: Receptor[] }>("receptors.json").receptors;
const odorants = load<{ odorants: Odorant[] }>("odorants.json").odorants;
const pairs = load<{ odorants: OdorantPairs[] }>("pairs.json").odorants;
const cases = load<{ cases: GenotypeCase[] }>("genotypes.json").cases;
const order = receptors.map((r) => r.gene);

function vector(id: string, conc: number, profile: PersonProfile = DEFAULT_PROFILE) {
  const od = odorants.find((o) => o.id === id)!;
  const stim = stimulusFromData(od, pairs.find((p) => p.odorant === id));
  return new Map(activationVector(stim, order, conc, profile, cases).map((x) => [x.receptor, x]));
}

const pair = (over: Partial<PairRecord>): PairRecord => ({
  receptor: "ORX", status: "agonist", quality: "ec50", provenance: "measured", n_positive: 1, n_experiments: 1, dois: [], assays: [], ...over,
});

describe("Hill function", () => {
  it("is half-maximal at the EC50 and bounded", () => {
    expect(hill(1e-5, 1e-5)).toBeCloseTo(0.5, 10);
    expect(hill(0, 1e-5)).toBe(0);
    expect(hill(1e-2, 1e-5)).toBeGreaterThan(0.99);
    expect(hill(1e-8, 1e-5)).toBeLessThan(0.01);
  });
  it("is monotonic in concentration", () => {
    const xs = [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3].map((c) => hill(c, 3e-5));
    xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(xs[i]));
  });
});

describe("pair activation", () => {
  it("uses the EC50 when measured", () => {
    const r = pairActivation(pair({ log_ec50: -5 }), 1e-5);
    expect(r.kind).toBe("quantitative");
    expect(r.a).toBeCloseTo(0.5, 6);
  });
  it("switches screening-only agonists on at the lowest responsive concentration", () => {
    const p = pair({ quality: "primaryScreening", min_resp_um: 100 });
    expect(pairActivation(p, 99e-6).a).toBe(0);
    expect(pairActivation(p, 100e-6)).toMatchObject({ a: QUALITATIVE_LEVEL, kind: "qualitative" });
  });
  it("uses the lower level when the EC50 is above the tested range", () => {
    const p = pair({ log_ec50_gt: -3 });
    expect(pairActivation(p, 5e-4).a).toBe(0);
    expect(pairActivation(p, 1e-3).a).toBe(CENSORED_LEVEL);
  });
  it("is zero for non-agonists and inconclusive pairs", () => {
    expect(pairActivation(pair({ status: "non_agonist" }), 1).a).toBe(0);
    expect(pairActivation(pair({ status: "inconclusive" }), 1).a).toBe(0);
  });
  it("classifies evidence", () => {
    expect(evidenceTier(pair({}))).toBe("dose-response");
    expect(evidenceTier(pair({ quality: "secondaryScreening" }))).toBe("confirmed");
    expect(evidenceTier(pair({ quality: "primaryScreening", n_positive: 2 }))).toBe("confirmed");
    expect(evidenceTier(pair({ quality: "primaryScreening", n_positive: 1 }))).toBe("single");
    expect(evidenceTier(pair({ status: "non_agonist" }))).toBeNull();
  });
});

describe("patterns for the test odorants (M2OR data)", () => {
  it("covers every receptor in the barcode, in the same order", () => {
    for (const o of odorants) {
      const v = vector(o.id, 1e-4);
      expect([...v.keys()]).toEqual(order);
    }
  });
  it("propionic acid: OR51E2 is the only responder (EC50 ≈ 363 µM)", () => {
    const v = vector("propionic-acid", 1e-3);
    const active = [...v.values()].filter((x) => x.a > 0).map((x) => x.receptor);
    expect(active).toEqual(["OR51E2"]);
    expect(v.get("OR51E2")!.ec50!).toBeCloseTo(3.63e-4, 5);
  });
  it("muscone: OR5AN1 responds with a measured EC50", () => {
    const v = vector("muscone", 1e-4);
    expect(v.get("OR5AN1")!.kind).toBe("quantitative");
    expect(v.get("OR5AN1")!.a).toBeGreaterThan(0.5);
  });
  it("β-ionone: OR5A1 responds (EC50 1.3 µM)", () => {
    expect(vector("beta-ionone", 1e-5).get("OR5A1")!.a).toBeGreaterThan(0.8);
  });
  it("carvone: OR1A1 responds more strongly to (R)- than to (S)-carvone", () => {
    expect(vector("r-carvone", 1e-4).get("OR1A1")!.a).toBeGreaterThan(vector("s-carvone", 1e-4).get("OR1A1")!.a);
  });
  it("recruits more receptors as concentration rises", () => {
    const n = (c: number) => [...vector("isoeugenol", c).values()].filter((x) => x.a > 0.05).length;
    expect(n(1e-3)).toBeGreaterThanOrEqual(n(1e-5));
    expect(n(1e-5)).toBeGreaterThanOrEqual(n(1e-7));
  });
  it("keeps untested receptors at zero and labelled as untested", () => {
    const v = vector("propionic-acid", 1e-2);
    const untested = [...v.values()].filter((x) => x.state === "untested");
    expect(untested.length).toBeGreaterThan(300);
    expect(untested.every((x) => x.a === 0)).toBe(true);
  });
});

describe("person modifiers", () => {
  const withGenotype = (g: string): PersonProfile => ({ ...DEFAULT_PROFILE, genotypes: { "OR7D4-androstenone": g } });
  it("OR7D4 genotype changes androstenone activation (Keller et al. 2007 values)", () => {
    const rt = vector("androstenone", 1e-4, withGenotype("RT/RT")).get("OR7D4")!.a;
    const het = vector("androstenone", 1e-4, withGenotype("RT/WM")).get("OR7D4")!.a;
    const wm = vector("androstenone", 1e-4, withGenotype("WM/WM")).get("OR7D4")!.a;
    expect(rt).toBeCloseTo(hill(1e-4, 12e-6), 3);
    expect(het).toBeCloseTo(rt / 2, 6);
    expect(wm).toBe(0);
  });
  it("OR2J3 T113A+R226Q abolishes the cis-3-hexen-1-ol response (McRae et al. 2012)", () => {
    const g = (x: string) => vector("cis-3-hexenol", 1e-4, { ...DEFAULT_PROFILE, genotypes: { "OR2J3-cis-3-hexenol": x } }).get("OR2J3")!.a;
    expect(g("ref/ref")).toBeCloseTo(hill(1e-4, 24.3e-6), 3);
    expect(g("T113A+R226Q/T113A+R226Q")).toBe(0);
  });
  it("age never changes receptor activation", () => {
    const base = vector("isoeugenol", 1e-4);
    const v = vector("isoeugenol", 1e-4, { ...DEFAULT_PROFILE, age: "older" as const });
    for (const [k, x] of base) expect(v.get(k)!.a).toBe(x.a);
  });
  it("applies only small, documented shifts after the receptor stage", () => {
    expect(detectionThresholdFactor(DEFAULT_PROFILE)).toBe(1);
    expect(appraisalFactor(DEFAULT_PROFILE)).toBe(1);
    expect(corticalFactor(DEFAULT_PROFILE, "piriform-frontal")).toBe(1);
    expect(corticalFactor({ ...DEFAULT_PROFILE, age: "older" }, "piriform-frontal")).toBeCloseTo(0.82, 10);
    expect(corticalFactor({ ...DEFAULT_PROFILE, age: "older" }, "amygdala")).toBe(1);
  });
});

describe("OSN transduction model", () => {
  it("is silent without a stimulus", () => {
    const tr = simulateOSN(0);
    expect(tr.spikes.length).toBe(0);
    expect(peak(tr.icng)).toBe(0);
  });
  it("starts firing a few tens of ms after a strong stimulus and stays ≤ 200 Hz", () => {
    const tr = simulateOSN(1);
    const latency = tr.spikes[0] - tr.stimOn;
    expect(latency).toBeGreaterThanOrEqual(30);
    expect(latency).toBeLessThan(150);
    expect(peak(tr.rate)).toBeLessThanOrEqual(200);
  });
  it("lets the Cl⁻ current carry most, but at most 90%, of the receptor current", () => {
    for (const a of [0.1, 0.3, 1]) {
      const tr = simulateOSN(a);
      // Steady part of the response (after the rising phase, while the stimulus is on).
      const fractions = tr.icl.map((c, i) =>
        tr.t[i] > tr.stimOn + 300 && tr.t[i] < tr.stimOff && c + tr.icng[i] > 0.05 ? c / (c + tr.icng[i]) : 0);
      expect(peak(fractions)).toBeLessThanOrEqual(0.905);
      if (a === 1) expect(peak(fractions)).toBeGreaterThan(0.5);
    }
  });
  it("adapts during a sustained stimulus", () => {
    const tr = simulateOSN(0.3);
    const total = tr.icng.map((x, i) => x + tr.icl[i]);
    const end = tr.t.findIndex((t) => t >= tr.stimOff - 4);
    expect(total[end]).toBeLessThan(0.8 * peak(total));
  });
  it("fires more with stronger drive and stops after the stimulus ends", () => {
    const rates = [0.05, 0.2, 0.5, 1].map((a) => meanRate(simulateOSN(a)));
    rates.slice(1).forEach((r, i) => expect(r).toBeGreaterThanOrEqual(rates[i]));
    const tr = simulateOSN(1);
    expect(tr.spikes.filter((s) => s > tr.stimOff + 500).length).toBe(0);
  });
});

describe("olfactory bulb", () => {
  const pos = bulbLayout(order);
  it("places one glomerulus per receptor", () => {
    expect(pos.map((p) => p.receptor)).toEqual(order);
  });
  it("sharpens the pattern with lateral inhibition and keeps silent glomeruli silent", () => {
    const input = order.map((_, i) => (i === 10 ? 1 : i === 11 || i === 12 ? 0.3 : i === 200 ? 0.6 : 0));
    const out = lateralInhibition(input, pos);
    expect(topShare(out, 2)).toBeGreaterThan(topShare(input, 2));
    expect(out[11]).toBeLessThan(input[11]);
    out.forEach((x, i) => input[i] === 0 && expect(x).toBe(0));
  });
});

describe("timeline", () => {
  it("runs through all stages in order", () => {
    expect(locate(0)).toMatchObject({ index: 0, p: 0 });
    expect(locate(TOTAL_DURATION).index).toBe(STAGES.length - 1);
    STAGES.forEach((_, i) => expect(locate(stageStart(i) + 0.01).index).toBe(i));
  });
  it("maps the OSN clock monotonically", () => {
    const ts = Array.from({ length: 200 }, (_, i) => (i / 199) * TOTAL_DURATION).map(physiologicalTime);
    ts.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(ts[i]));
  });
});
