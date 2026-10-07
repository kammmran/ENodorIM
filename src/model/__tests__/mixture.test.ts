import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Odorant, OdorantPairs } from "../../data/types";
import { hill, pairActivation } from "../activation";
import { combineReceptors, componentDrive, mixtureStimulus, normaliseFractions, type MixtureComponent } from "../mixture";
import { stimulusFromData, type Stimulus } from "../stimulus";

const load = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../../../data/processed/${f}`, import.meta.url), "utf8"));
const odorants = load<{ odorants: Odorant[] }>("odorants.json").odorants;
const pairs = load<{ odorants: OdorantPairs[] }>("pairs.json").odorants;

const stim = (id: string): Stimulus =>
  stimulusFromData(odorants.find((o) => o.id === id)!, pairs.find((p) => p.odorant === id));

const mix = (ids: string[], fractions?: number[]): MixtureComponent[] =>
  ids.map((id, i) => ({ stimulus: stim(id), fraction: fractions?.[i] ?? 1 / ids.length }));

describe("fractions", () => {
  it("normalises to 1 and tolerates unnormalised input", () => {
    const n = normaliseFractions(mix(["r-carvone", "guaiacol"], [3, 1]));
    expect(n[0].fraction).toBeCloseTo(0.75, 10);
    expect(n[1].fraction).toBeCloseTo(0.25, 10);
    expect(n.reduce((s, c) => s + c.fraction, 0)).toBeCloseTo(1, 10);
  });
  it("falls back to equal shares when all fractions are zero", () => {
    const n = normaliseFractions(mix(["r-carvone", "guaiacol"], [0, 0]));
    expect(n.every((c) => c.fraction === 0.5)).toBe(true);
  });
});

describe("competitive combination", () => {
  it("reproduces the single odorant exactly when the mixture has one component", () => {
    const single = stim("r-carvone");
    const combined = combineReceptors([{ stimulus: single, fraction: 1 }]);
    const or1a1 = combined.find((r) => r.receptor === "OR1A1")!;
    const measured = single.responses.get("OR1A1")!.pair;
    expect(Math.log10(or1a1.ec50!)).toBeCloseTo(measured.log_ec50!, 6);
  });

  it("halving a component's share halves its contribution to the potency sum", () => {
    const full = combineReceptors([{ stimulus: stim("r-carvone"), fraction: 1 }]);
    const half = combineReceptors([
      { stimulus: stim("r-carvone"), fraction: 0.5 },
      { stimulus: stim("guaiacol"), fraction: 0.5 },
    ]);
    const a = full.find((r) => r.receptor === "OR1A1")!;
    const b = half.find((r) => r.receptor === "OR1A1")!;
    // Guaiacol does not activate OR1A1, so only the dilution of carvone matters.
    expect(b.ec50!).toBeCloseTo(a.ec50! * 2, 6);
  });

  it("puts the mixture's potency between its components, never beyond them", () => {
    // At a fixed TOTAL concentration, mixing dilutes: the effective EC50 is a
    // fraction-weighted harmonic mean, so it can never beat the best component.
    const m = combineReceptors(mix(["r-carvone", "s-carvone"]));
    const shared = m.find((r) => r.receptor === "OR1A1")!;
    const singles = ["r-carvone", "s-carvone"].map((id) => 10 ** stim(id).responses.get("OR1A1")!.pair.log_ec50!);
    expect(shared.ec50!).toBeGreaterThanOrEqual(Math.min(...singles) - 1e-12);
    expect(shared.ec50!).toBeLessThanOrEqual(Math.max(...singles) + 1e-12);
    expect(shared.bestSingleEc50!).toBe(Math.min(...singles));
    expect(shared.contributions.length).toBe(2);
    expect(shared.contributions.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 10);
  });

  it("adding a second agonist raises activation when the first is not diluted", () => {
    // The other comparison: hold component 1 at the same concentration and add
    // component 2 on top. Competition then increases the response.
    const r = stim("r-carvone").responses.get("OR1A1")!.pair;
    const s2 = stim("s-carvone").responses.get("OR1A1")!.pair;
    const c = 3e-5;
    const alone = hill(c, 10 ** r.log_ec50!);
    const sum = c / 10 ** r.log_ec50! + c / 10 ** s2.log_ec50!;
    const together = sum / (1 + sum);
    expect(together).toBeGreaterThan(alone);
  });

  it("matches the explicit competitive formula at a given concentration", () => {
    const components = mix(["r-carvone", "s-carvone"], [0.7, 0.3]);
    const conc = 1e-4;
    const combined = combineReceptors(components);
    for (const r of combined.filter((x) => !x.qualitative).slice(0, 10)) {
      // Σ(C_i/EC50_i) / (1 + Σ(C_i/EC50_i)), computed directly from the parts.
      let sum = 0;
      for (const { stimulus, fraction } of normaliseFractions(components)) {
        const p = stimulus.responses.get(r.receptor)?.pair;
        if (p?.status === "agonist" && p.log_ec50 != null) sum += (fraction * conc) / 10 ** p.log_ec50;
      }
      const direct = sum / (1 + sum);
      expect(hill(conc, r.ec50!)).toBeCloseTo(direct, 6);
    }
  });

  it("ranks the strongest contributor first and the shares sum to one", () => {
    for (const r of combineReceptors(mix(["r-carvone", "guaiacol", "vanillin"]))) {
      const shares = r.contributions.map((c) => c.share);
      expect([...shares].sort((a, b) => b - a)).toEqual(shares);
      expect(shares.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    }
  });

  it("flags receptors whose potency rests on screening-only components", () => {
    const m = combineReceptors(mix(["isoeugenol", "vanillin"]));
    expect(m.some((r) => r.qualitative)).toBe(true);
    for (const r of m) {
      const anyQual = r.contributions.some((c) => c.qualitative);
      expect(r.qualitative).toBe(anyQual);
    }
  });

  it("never loses a receptor that a component activates", () => {
    const ids = ["r-carvone", "guaiacol"];
    const union = new Set<string>();
    for (const id of ids)
      for (const [r, resp] of stim(id).responses) if (resp.pair.status === "agonist") union.add(r);
    const combined = new Set(combineReceptors(mix(ids)).map((r) => r.receptor));
    for (const r of union) expect(combined.has(r)).toBe(true);
  });
});

describe("mixture as a stimulus", () => {
  it("builds pairs the ordinary activation function can use", () => {
    const s = mixtureStimulus(mix(["r-carvone", "s-carvone"]));
    expect(s.responses.size).toBeGreaterThan(0);
    for (const [, resp] of s.responses) {
      expect(resp.state).toBe("agonist");
      const a = pairActivation(resp.pair, 1e-4);
      expect(a.a).toBeGreaterThan(0);
      expect(a.a).toBeLessThanOrEqual(1);
    }
  });
  it("is marked predicted when any component is predicted", () => {
    const measured = mixtureStimulus(mix(["r-carvone", "guaiacol"]));
    expect(measured.provenance).toBe("measured");
    const withPredicted = mixtureStimulus([
      { stimulus: stim("r-carvone"), fraction: 0.5 },
      { stimulus: { ...stim("guaiacol"), provenance: "predicted" }, fraction: 0.5 },
    ]);
    expect(withPredicted.provenance).toBe("predicted");
  });
  it("gives each component a drive that grows with its share", () => {
    const low = componentDrive(mix(["r-carvone", "guaiacol"], [0.1, 0.9]), 1e-4);
    const high = componentDrive(mix(["r-carvone", "guaiacol"], [0.9, 0.1]), 1e-4);
    expect(high.get("r-carvone")!).toBeGreaterThan(low.get("r-carvone")!);
  });
});
