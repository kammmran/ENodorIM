import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIN_SUPPORT,
  SCORE_THRESHOLD,
  nearest,
  predictDescriptors,
  predictReceptors,
  predictedPairs,
  tanimoto,
  type PredictIndex,
} from "../predict";

const dir = new URL("../../../data/processed/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("predict_index.json", dir), "utf8")) as PredictIndex;
const fps = new Uint8Array(readFileSync(new URL("predict_fp.bin", dir)));
const NB = index.fingerprint.n_bytes;

const fpOf = (ik: string, which: "receptors" | "descriptors") => {
  const i = index[which].molecules.findIndex((m) => m.inchikey === ik);
  if (i < 0) throw new Error(`${ik} not in ${which} index`);
  return fps.slice((index[which].offset + i) * NB, (index[which].offset + i + 1) * NB);
};

/** Predict as if this molecule had never been measured. */
function holdOut(ik: string, k = 40) {
  const q = fpOf(ik, "receptors");
  const ns = nearest(q, fps, index.receptors.molecules, index.receptors.offset, NB, { k, exclude: ik });
  return { neighbours: ns, receptors: predictReceptors(ns) };
}

describe("fingerprint index", () => {
  it("has one fingerprint per molecule, in index order", () => {
    const total = index.receptors.count + index.descriptors.count;
    expect(fps.length).toBe(total * NB);
    expect(index.receptors.molecules.length).toBe(index.receptors.count);
    expect(index.descriptors.molecules.length).toBe(index.descriptors.count);
    expect(index.descriptors.offset).toBe(index.receptors.count);
  });
  it("uses 2048-bit Morgan fingerprints of radius 2", () => {
    expect(index.fingerprint).toMatchObject({ kind: "morgan", radius: 2, n_bits: 2048, n_bytes: 256 });
  });
});

describe("Tanimoto", () => {
  const a = new Uint8Array([0b1100_0000, 0, 0]);
  const b = new Uint8Array([0b1010_0000, 0, 0]);
  it("is 1 for identical and 0 for disjoint fingerprints", () => {
    expect(tanimoto(a, 0, a, 0, 3)).toBe(1);
    expect(tanimoto(a, 0, new Uint8Array([0b0000_0011, 0, 0]), 0, 3)).toBe(0);
  });
  it("counts shared over union bits", () => {
    expect(tanimoto(a, 0, b, 0, 3)).toBeCloseTo(1 / 3, 10);
  });
  it("gives every indexed molecule similarity 1 with itself", () => {
    for (const ik of ["MWOOGOJBHIARFG-UHFFFAOYSA-N", "XBDQKXXYIPTUBI-UHFFFAOYSA-N"]) {
      const f = fpOf(ik, "receptors");
      expect(tanimoto(f, 0, f, 0, NB)).toBe(1);
    }
  });
});

describe("nearest neighbours", () => {
  it("excludes the query molecule and returns results in descending similarity", () => {
    const ik = "MWOOGOJBHIARFG-UHFFFAOYSA-N"; // vanillin
    const { neighbours } = holdOut(ik);
    expect(neighbours.find((n) => n.molecule.inchikey === ik)).toBeUndefined();
    const sims = neighbours.map((n) => n.similarity);
    expect([...sims].sort((a, b) => b - a)).toEqual(sims);
    expect(sims[0]).toBeGreaterThan(0.3);
  });
  it("finds chemically sensible neighbours for vanillin", () => {
    const { neighbours } = holdOut("MWOOGOJBHIARFG-UHFFFAOYSA-N");
    const names = neighbours.slice(0, 8).map((n) => n.molecule.name.toLowerCase());
    expect(names.some((n) => n.includes("vanillin") || n.includes("vanilly") || n.includes("anis"))).toBe(true);
  });
});

describe("hold-one-out receptor prediction", () => {
  // Each molecule is predicted with its own measurements removed. Ground truth
  // is read from the index itself rather than hardcoded, so the test tracks the
  // data rather than a snapshot of it.
  const truthFor = (ik: string) =>
    new Set((index.receptors.molecules.find((m) => m.inchikey === ik)?.agonists ?? []).map((a) => a.r));
  const cases = [
    { name: "vanillin", ik: "MWOOGOJBHIARFG-UHFFFAOYSA-N" },
    { name: "isoeugenol", ik: "BJIOGJUNALELMI-ONEGZZNKSA-N" },
    { name: "(R)-carvone", ik: "ULDHMXUKGWMISQ-SECBINFHSA-N" },
  ];
  for (const c of cases) {
    it(`recovers at least one true receptor for ${c.name}`, () => {
      const truth = truthFor(c.ik);
      expect(truth.size).toBeGreaterThan(0);
      const { receptors } = holdOut(c.ik);
      const predicted = receptors.filter((r) => r.score >= SCORE_THRESHOLD).map((r) => r.receptor);
      expect(predicted.length).toBeGreaterThan(0);
      expect(predicted.some((r) => truth.has(r))).toBe(true);
    });
    it(`ranks a true receptor first for ${c.name}`, () => {
      const truth = truthFor(c.ik);
      const { receptors } = holdOut(c.ik);
      // The top of the ranking is what the interface leads with, so it is the
      // part that has to be right.
      expect(receptors.length).toBeGreaterThan(0);
      expect(truth.has(receptors[0].receptor)).toBe(true);
    });
  }
  it("reports only receptors with enough tested evidence, and scores within [0, 1]", () => {
    const { receptors } = holdOut("ULDHMXUKGWMISQ-SECBINFHSA-N");
    for (const r of receptors) {
      expect(r.support).toBeGreaterThanOrEqual(MIN_SUPPORT);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.for.length + r.against.length).toBeGreaterThan(0);
    }
  });
  it("carries the supporting molecules for every prediction", () => {
    const { receptors } = holdOut("MWOOGOJBHIARFG-UHFFFAOYSA-N");
    const top = receptors.filter((r) => r.score >= SCORE_THRESHOLD)[0];
    expect(top.for.length).toBeGreaterThan(0);
    expect(top.for[0].similarity).toBeGreaterThan(0);
    expect(top.for[0].name).toBeTruthy();
  });
  it("predicts EC50 inside the range of the neighbours it averaged", () => {
    const { receptors } = holdOut("ULDHMXUKGWMISQ-SECBINFHSA-N");
    for (const r of receptors) {
      if (r.logEc50 === null) continue;
      const vals = r.for.filter((f) => f.ec50 !== null).map((f) => f.ec50 as number);
      expect(r.logEc50).toBeGreaterThanOrEqual(Math.min(...vals) - 1e-9);
      expect(r.logEc50).toBeLessThanOrEqual(Math.max(...vals) + 1e-9);
    }
  });
});

describe("predicted pairs feed the simulation", () => {
  it("produces agonist PairRecords marked as predicted", () => {
    const { receptors } = holdOut("MWOOGOJBHIARFG-UHFFFAOYSA-N");
    const pairs = predictedPairs(receptors);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(p.provenance).toBe("predicted");
      expect(p.status).toBe("agonist");
      expect(p.log_ec50 !== undefined || p.min_resp_um !== undefined).toBe(true);
    }
  });
});

describe("descriptor prediction", () => {
  it("predicts vanilla-like words for vanillin from its neighbours", () => {
    const ik = "MWOOGOJBHIARFG-UHFFFAOYSA-N";
    const q = fpOf(ik, "descriptors");
    const ns = nearest(q, fps, index.descriptors.molecules, index.descriptors.offset, NB, { k: 25, exclude: ik });
    const labels = predictDescriptors(ns).map((d) => d.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((l) => ["vanilla", "sweet", "balsamic", "creamy", "phenolic"].includes(l))).toBe(true);
  });
  it("returns weights in [0, 1], descending, each with supporting molecules", () => {
    const ik = index.descriptors.molecules[100].inchikey;
    const q = fpOf(ik, "descriptors");
    const ns = nearest(q, fps, index.descriptors.molecules, index.descriptors.offset, NB, { k: 25, exclude: ik });
    const ds = predictDescriptors(ns);
    const ws = ds.map((d) => d.weight);
    expect([...ws].sort((a, b) => b - a)).toEqual(ws);
    for (const d of ds) {
      expect(d.weight).toBeGreaterThan(0);
      expect(d.weight).toBeLessThanOrEqual(1);
      expect(d.from.length).toBeGreaterThan(0);
    }
  });
});
