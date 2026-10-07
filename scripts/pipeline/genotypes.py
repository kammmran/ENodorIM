"""Receptor genotypes for the person selector.

Each case compares alleles measured in the same paper, so the genotype
effect is not mixed with between-lab differences.

Two kinds of case:
  * CASES      — allele values read from the M2OR experiment rows of that paper.
  * CURATED    — allele values read from a paper whose numbers are not in the
                 M2OR snapshot. These carry a `curation` note so the interface
                 can say where the numbers come from.
"""
from __future__ import annotations

import math

import pandas as pd

MONOALLELIC = dict(
    text=("Each olfactory sensory neuron expresses one allele of its receptor gene (monoallelic expression, "
          "shown in rodents). A heterozygote is therefore modelled as half of the neurons for this receptor "
          "carrying each allele."),
    doi="10.1016/s0092-8674(94)90562-2",
)

CASES = [
    dict(
        id="OR7D4-androstenone", receptor="OR7D4", odorant="androstenone", doi="10.1038/nature06162",
        alleles={"RT": "ref", "WM": "R88W_T133M"},
        allele_notes={"RT": "Reference allele (R88, T133).",
                      "WM": "Common variant with two substitutions, R88W and T133M."},
        genotypes=[("RT/RT", ["RT", "RT"]), ("RT/WM", ["RT", "WM"]), ("WM/WM", ["WM", "WM"])],
        perception=("Androstenone is perceived by different people as offensive (“sweaty, urinous”), "
                    "pleasant (“sweet, floral”) or odourless. People with RT/WM or WM/WM genotypes were, "
                    "as a group, less sensitive to androstenone and found it less unpleasant than the RT/RT group."),
        by_genotype={"RT/RT": "More sensitive; more often unpleasant (group result).",
                     "RT/WM": "Less sensitive and less unpleasant than RT/RT (group result).",
                     "WM/WM": "Less sensitive and less unpleasant than RT/RT (group result)."},
        conflict=dict(text=("Mainland et al. 2015 reported a response of the WM haplotype with a log EC50 of about "
                            "−5 (whole-log value). M2OR therefore marks this pair as inconclusive; the "
                            "simulation follows Keller et al. 2007, the study that links genotype to perception."),
                      doi="10.1038/sdata.2015.2"),
    ),
    dict(
        id="OR2J3-cis-3-hexenol", receptor="OR2J3", odorant="cis-3-hexenol", doi="10.1093/chemse/bjs049",
        alleles={"reference": "ref", "T113A+R226Q": "T113A_R226Q"},
        allele_notes={"reference": "Reference haplotype.",
                      "T113A+R226Q": "Haplotype carrying both T113A and R226Q."},
        genotypes=[("ref/ref", ["reference", "reference"]),
                   ("ref/T113A+R226Q", ["reference", "T113A+R226Q"]),
                   ("T113A+R226Q/T113A+R226Q", ["T113A+R226Q", "T113A+R226Q"])],
        perception=("T113A and R226Q each impair the response of OR2J3 to cis-3-hexen-1-ol and together abolish "
                    "it in vitro. The haplotype containing both explains 26.4% of the variation in "
                    "cis-3-hexen-1-ol detection in the study cohort."),
        by_genotype={},
        conflict=None,
    ),
]


# Values read from the main text of Mainland et al. 2014 (Nat Neurosci,
# doi:10.1038/nn.3598), Results, "OR10G4". The guaiacol x OR10G4 reference
# allele is absent from the M2OR snapshot, so these numbers are curated by
# hand rather than derived from the pipeline's M2OR tables.
CURATED = [
    dict(
        id="OR10G4-guaiacol", receptor="OR10G4", odorant="guaiacol", doi="10.1038/nn.3598",
        curation=("Allele potencies read from the main text of Mainland et al. 2014; this receptor–odorant pair is "
                  "not in the M2OR snapshot used elsewhere on this site."),
        alleles={
            "reference": dict(haplotype="ALTYMGPVRK", status="agonist", log_ec50=-7.4,
                              note="Reference allele (ALTYMGPVRK)."),
            "APT (2 aa)": dict(haplotype="APTYMGPERK", status="agonist", log_ec50=-7.7,
                               note="Differs from the reference by 2 amino acids; slightly more sensitive to guaiacol, "
                                    "but the effect is small."),
            "VLT (5 aa)": dict(haplotype="VLTYVGPEGQ", status="agonist", log_ec50=-5.5,
                               note="Differs by 5 amino acids; much lower affinity, but still responds significantly."),
            "ALI (8 aa)": dict(haplotype="ALICVSSEGQ", status="non_agonist", log_ec50=None,
                               note="Differs by 8 amino acids; not significantly different from vector-only control "
                                    "cells (p = 0.11), i.e. non-functional in this assay."),
        },
        genotypes=[
            ("ref/ref", ["reference", "reference"]),
            ("ref/VLT", ["reference", "VLT (5 aa)"]),
            ("ref/ALI", ["reference", "ALI (8 aa)"]),
            ("VLT/VLT", ["VLT (5 aa)", "VLT (5 aa)"]),
            ("ALI/ALI", ["ALI (8 aa)", "ALI (8 aa)"]),
        ],
        perception=("OR10G4 allele type explained 15.4% of the variance in perceived intensity of guaiacol and 10.3% "
                    "of the variance in perceived valence (n = 308). It did not explain perception of the "
                    "lower-affinity agonists vanillin and ethyl vanillin."),
        # Per-copy effects from the paper's multiple regression on odor rating rank.
        by_genotype={
            "ref/ref": "Each copy of the reference allele raised perceived intensity by about 2.1 ranks (β = 2.10).",
            "ref/VLT": "One reference copy (+2.1 ranks intensity) and one VLT copy (−2.4 ranks intensity, "
                       "+3.3 ranks valence, i.e. less unpleasant).",
            "ref/ALI": "One reference copy (+2.1 ranks intensity) and one ALI copy (−4.3 ranks intensity, "
                       "+3.7 ranks valence).",
            "VLT/VLT": "Each copy of VLT lowered perceived intensity by about 2.4 ranks and raised valence by "
                       "about 3.3 ranks (β = −2.39; β = 3.33).",
            "ALI/ALI": "Each copy of ALI lowered perceived intensity by about 4.3 ranks and raised valence by "
                       "about 3.7 ranks (β = −4.34; β = 3.71) — the weakest and least unpleasant percept of guaiacol.",
        },
        conflict=None,
    ),
]


def build(h: pd.DataFrame, inchikey_of: dict[str, str]) -> list[dict]:
    out = []
    for case in CASES:
        ik = inchikey_of[case["odorant"]]
        rows = h[(h["gene"] == case["receptor"]) & (h["InChI Key"] == ik) & (h["doi"] == case["doi"])]
        alleles = {}
        for label, m2or_allele in case["alleles"].items():
            r = rows[rows["allele"] == m2or_allele]
            dr = r[r["is_dr"]]
            src = dr if len(dr) else r
            responsive = bool(len(src)) and bool((src["responsive"] == 1).all())
            logs = [v for v, ok in zip(src["log_ec50"], src["responsive"]) if ok == 1 and pd.notna(v)]
            tested = [c for c in r["conc_um"] if pd.notna(c)]
            alleles[label] = dict(
                m2or_allele=m2or_allele, note=case["allele_notes"][label], n_rows=len(r),
                status=("agonist" if responsive else "non_agonist") if len(src) else "untested",
                log_ec50=round(float(pd.Series(logs).median()), 3) if logs else None,
                max_tested_um=max(tested) if tested else None,
            )
        out.append(dict(
            id=case["id"], receptor=case["receptor"], odorant=case["odorant"], doi=case["doi"],
            alleles=alleles,
            genotypes=[dict(id=g, alleles=a, perception=case["by_genotype"].get(g)) for g, a in case["genotypes"]],
            perception=case["perception"], conflict=case["conflict"], expression=MONOALLELIC,
            provenance="measured",
        ))
    return out


def build_curated() -> list[dict]:
    """Curated cases: the numbers are literals, so there is nothing to look up."""
    out = []
    for case in CURATED:
        alleles = {
            label: dict(m2or_allele=None, note=a["note"], haplotype=a["haplotype"], n_rows=0,
                        status=a["status"], log_ec50=a["log_ec50"], max_tested_um=None)
            for label, a in case["alleles"].items()
        }
        out.append(dict(
            id=case["id"], receptor=case["receptor"], odorant=case["odorant"], doi=case["doi"],
            alleles=alleles,
            genotypes=[dict(id=g, alleles=a, perception=case["by_genotype"].get(g)) for g, a in case["genotypes"]],
            perception=case["perception"], conflict=case["conflict"], expression=MONOALLELIC,
            curation=case["curation"], provenance="measured",
        ))
    return out


def check(cases: list[dict]) -> list[str]:
    """Human-readable lines for the build summary."""
    lines = []
    for c in cases:
        parts = []
        for label, a in c["alleles"].items():
            ec = f"EC50 {10 ** a['log_ec50'] * 1e6:.3g} µM" if a["log_ec50"] is not None and math.isfinite(a["log_ec50"]) else ""
            lim = f"(tested to {a['max_tested_um']:g} µM)" if a["status"] == "non_agonist" and a["max_tested_um"] else ""
            parts.append(f"{label}: {a['status']} {ec}{lim}".strip())
        tag = " (curated)" if c.get("curation") else ""
        lines.append(f"   {c['receptor']} × {c['odorant']}{tag} [{c['doi']}]: " + "; ".join(parts))
    return lines
