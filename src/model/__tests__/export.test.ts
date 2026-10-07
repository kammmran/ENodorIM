import { describe, expect, it } from "vitest";
import { slug, toCSV, toJSON, type ExportMeta } from "../export";
import { decodeShare, encodeShare } from "../../state/shareLink";
import type { ReceptorActivation } from "../stimulus";

const meta: ExportMeta = {
  stimulus: "(R)-(−)-carvone",
  kind: "odorant",
  provenance: "measured",
  concentration: 1e-4,
  inchikey: "ULDHMXUKGWMISQ-SECBINFHSA-N",
  smiles: "CC1=CC[C@H](CC1=O)C(=C)C",
  dataBuilt: "2026-10-07",
  m2orFile: "M2OR_20230428.csv",
  siteUrl: "https://example.org/#/simulate",
};

const acts: ReceptorActivation[] = [
  { receptor: "OR1A1", a: 0.77, kind: "quantitative", state: "agonist", evidence: "dose-response", provenance: "measured", ec50: 2.99e-5 },
  { receptor: "OR2W1", a: 0.5, kind: "qualitative", state: "agonist", evidence: "single", provenance: "measured", threshold: 1e-4 },
  { receptor: "OR5K1", a: 0, kind: "none", state: "non_agonist", evidence: null, provenance: "measured" },
  { receptor: "OR51E2", a: 0, kind: "none", state: "untested", evidence: null, provenance: "measured" },
  { receptor: 'OR"odd,name', a: 0.1, kind: "quantitative", state: "agonist", evidence: "confirmed", provenance: "predicted" },
];

/** Split one CSV line, honouring quoted fields and doubled quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

describe("CSV export", () => {
  const csv = toCSV(acts, meta);
  const lines = csv.trim().split("\n");
  const header = lines.filter((l) => l.startsWith("#"));
  const columns = lines[header.length];
  const rows = lines.slice(header.length + 1);

  it("writes one row per receptor plus a header row", () => {
    expect(rows.length).toBe(acts.length);
    expect(columns.split(",")[0]).toBe("receptor");
  });
  it("records the stimulus, concentration and data provenance in the comments", () => {
    const text = header.join("\n");
    expect(text).toContain("(R)-(−)-carvone");
    expect(text).toContain("1.000e-4");
    expect(text).toContain("ULDHMXUKGWMISQ-SECBINFHSA-N");
    expect(text).toContain("M2OR_20230428.csv");
    expect(text).toContain("not a nasal concentration");
  });
  const row = (gene: string) => parseCsvLine(rows.find((r) => parseCsvLine(r)[0] === gene)!);

  it("leaves activation blank for untested receptors rather than writing a zero", () => {
    expect(row("OR51E2")[1]).toBe("");
    expect(row("OR51E2")[2]).toBe("Not tested");
  });
  it("distinguishes a tested non-responder from an untested receptor", () => {
    expect(row("OR5K1")[1]).toBe("0.0000");
    expect(row("OR5K1")[2]).toBe("Tested, no response");
  });
  it("keeps every row at the declared column count", () => {
    const n = parseCsvLine(columns).length;
    for (const r of rows) expect(parseCsvLine(r)).toHaveLength(n);
  });
  it("writes EC50 and thresholds in mol/L", () => {
    expect(rows.find((r) => r.startsWith("OR1A1"))!).toContain("2.9900e-5");
    expect(rows.find((r) => r.startsWith("OR2W1"))!).toContain("1.0000e-4");
  });
  it("quotes values containing commas or quotes, and they survive a round trip", () => {
    const odd = rows.find((r) => r.startsWith('"OR'))!;
    expect(odd.startsWith('"OR""odd,name"')).toBe(true);
    expect(parseCsvLine(odd)[0]).toBe('OR"odd,name');
  });
});

describe("JSON export", () => {
  const parsed = JSON.parse(toJSON(acts, meta));
  it("carries the metadata and one entry per receptor", () => {
    expect(parsed.meta.stimulus).toBe("(R)-(−)-carvone");
    expect(parsed.meta.concentration_unit).toBe("mol/L");
    expect(parsed.receptors).toHaveLength(acts.length);
  });
  it("uses null, not 0, for untested receptors", () => {
    expect(parsed.receptors.find((r: { receptor: string }) => r.receptor === "OR51E2").activation).toBeNull();
    expect(parsed.receptors.find((r: { receptor: string }) => r.receptor === "OR5K1").activation).toBe(0);
  });
  it("keeps each value's provenance", () => {
    expect(parsed.receptors.find((r: { receptor: string }) => r.receptor === 'OR"odd,name').provenance).toBe("predicted");
  });
});

describe("filenames", () => {
  it("makes a safe slug from a display name", () => {
    expect(slug("(R)-(−)-carvone")).toBe("r-carvone");
    // Non-Latin characters are dropped, and no leading or trailing dashes remain.
    expect(slug("β-ionone + guaiacol")).toBe("ionone-guaiacol");
    expect(slug("///")).toBe("export");
  });
});

describe("share links", () => {
  it("round-trips an odorant, concentration and genotype", () => {
    const state = { odorantId: "androstenone", logConc: -5.5, genotypes: { "OR7D4-androstenone": "RT/WM" } };
    const back = decodeShare(`#/simulate?${encodeShare(state)}`);
    expect(back.odorantId).toBe("androstenone");
    expect(back.logConc).toBeCloseTo(-5.5, 6);
    expect(back.genotypes).toEqual({ "OR7D4-androstenone": "RT/WM" });
  });
  it("round-trips a mixture", () => {
    const mixture = [
      { id: "r-carvone", fraction: 2 },
      { id: "guaiacol", fraction: 0.5 },
    ];
    expect(decodeShare(`#/mixtures?${encodeShare({ mixture })}`).mixture).toEqual(mixture);
  });
  it("handles genotype labels that themselves contain a colon or slash", () => {
    const genotypes = { "OR2J3-cis-3-hexenol": "T113A+R226Q/T113A+R226Q" };
    expect(decodeShare(`#/x?${encodeShare({ genotypes })}`).genotypes).toEqual(genotypes);
  });
  it("ignores a hash with no query, and junk values", () => {
    expect(decodeShare("#/simulate")).toEqual({});
    expect(decodeShare("#/simulate?c=notanumber").logConc).toBeUndefined();
    expect(decodeShare("#/simulate?c=99").logConc).toBeUndefined(); // outside the slider range
    expect(decodeShare("#/simulate?g=nocolon").genotypes).toBeUndefined();
    expect(decodeShare("#/mixtures?m=bad").mixture).toBeUndefined();
  });
  it("keeps a negative concentration inside the accepted range", () => {
    expect(decodeShare("#/x?c=-8").logConc).toBe(-8);
    expect(decodeShare("#/x?c=-2").logConc).toBe(-2);
    expect(decodeShare("#/x?c=-8.1").logConc).toBeUndefined();
  });
});
