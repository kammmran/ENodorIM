"""Load M2OR experiments and aggregate them into one consensus row per pair.

The aggregation reproduces the published M2OR Pair-table rules
(Lalis et al., Nucleic Acids Res 2024, doi:10.1093/nar/gkad886, section
"Pair aggregation table"):

  1. Dose-response measurements take priority over screening data.
  2. Contradictory dose-response results for a pair -> pair discarded.
  3. Screening: a pair responsive at a lower concentration but not at a
     higher one, or inconsistent at the same concentration -> discarded.
  4. A consistent screening pair is responsive if it responds at >= 1
     concentration.
  5. Data quality: "ec50" (dose-response) > "secondaryScreening"
     (>= 2 distinct concentrations) > "primaryScreening" (1 concentration).

Discarded pairs are kept here with status "inconclusive" and a reason, so
the interface can say "tested, results disagree" instead of "not tested".

A receptor is identified by (gene, allele). M2OR stores natural haplotypes
from the Mainland/Trimmer screens as separate sequences named like
"hOR7D4_R88W_T133M" with an empty Mutation column, so the allele is taken
from the Gene ID suffix, falling back to the Mutation column. "ref" is the
reference allele (no suffix, no mutation).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

import pandas as pd

from .paths import M2OR_DIR, M2OR_SNAPSHOT

REF = "ref"
_UNIT_TO_UM = {"uM": 1.0, "mM": 1e3, "M": 1e6, "nM": 1e-3}


def load_experiments() -> tuple[pd.DataFrame, str]:
    """Return (experiments, source label). A manual website export wins over the snapshot."""
    manual = sorted(p for p in M2OR_DIR.glob("*.csv") if p != M2OR_SNAPSHOT)
    path = manual[-1] if manual else M2OR_SNAPSHOT
    df = pd.read_csv(path, sep=";", dtype=str, low_memory=False)
    df = df.drop(columns=[c for c in df.columns if c.startswith("Unnamed")])
    return df, path.name


def _gene_and_allele(gene_id: str, mutation) -> tuple[str, str]:
    g = re.sub(r"^h(?=OR)", "", str(gene_id).strip())
    parts = g.split("_")
    gene = parts[0]
    allele = "_".join(parts[1:])
    if not allele and isinstance(mutation, str) and mutation.strip():
        allele = mutation.strip()
    return gene, allele or REF


def _to_float(x) -> float | None:
    try:
        v = float(str(x).strip())
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def _screen_conc_um(value, unit) -> float | None:
    v = _to_float(value)  # multi-value strings (mixtures) -> None
    if v is None or unit not in _UNIT_TO_UM:
        return None
    return v * _UNIT_TO_UM[unit]


def _ec50(value, unit) -> tuple[float | None, float | None]:
    """Return (log10 EC50 in M, censored lower bound log10 M) from one dose-response row."""
    s = str(value).strip()
    if s.startswith(">"):
        v = _to_float(s[1:].split()[0])
        if v is not None and unit in _UNIT_TO_UM:
            return None, math.log10(v * _UNIT_TO_UM[unit] * 1e-6)
        return None, None
    v = _to_float(s)
    if v is None:
        return None, None
    if unit == "Log(M)":
        return v, None
    if unit in _UNIT_TO_UM and v > 0:
        return math.log10(v * _UNIT_TO_UM[unit] * 1e-6), None
    return None, None


def normalise_human(df: pd.DataFrame) -> pd.DataFrame:
    """Human single-compound experiments with parsed receptor, concentration and EC50 columns."""
    h = df[df["species"].str.lower() == "homo sapiens"].copy()
    h = h[h["Mixture"].isin(["mono", "sum of isomers"])]
    ga = [_gene_and_allele(g, m) for g, m in zip(h["Gene ID"], h["Mutation"])]
    h["gene"] = [x[0] for x in ga]
    h["allele"] = [x[1] for x in ga]
    h["responsive"] = h["Responsive"].astype(int)
    h["is_dr"] = h["Parameter"] == "ec50"
    h["conc_um"] = [_screen_conc_um(v, u) for v, u in zip(h["Value_Screen"], h["Unit_Screen"])]
    ec = [_ec50(v, u) if dr else (None, None) for v, u, dr in zip(h["Value"], h["Unit"], h["is_dr"])]
    h["log_ec50"] = [x[0] for x in ec]
    h["log_ec50_gt"] = [x[1] for x in ec]
    h["doi"] = h["DOI"].map(normalise_doi)
    return h


def normalise_doi(d) -> str | None:
    if not isinstance(d, str) or not d.strip():
        return None
    d = d.strip()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    d = d.replace("%2F", "/").replace("%2f", "/")
    return d.lower()


@dataclass
class Pair:
    gene: str
    allele: str
    inchikey: str
    status: str  # agonist | non_agonist | inconclusive
    quality: str  # ec50 | secondaryScreening | primaryScreening
    reason: str | None = None
    log_ec50: float | None = None  # median of reported log10 EC50 (M) for responsive DR rows
    log_ec50_values: list = field(default_factory=list)  # [(log10 M, doi, rounded_to_log_unit)]
    log_ec50_gt: float | None = None  # censored: EC50 above this (log10 M)
    ec50_below_assay_range: bool = False  # fitted below ASSAY_FLOOR_LOG
    max_conc_um: float | None = None  # highest screening concentration tested
    min_resp_um: float | None = None  # lowest concentration with a positive result
    n_positive: int = 0  # experiments reporting a response
    n_experiments: int = 0
    dois: list = field(default_factory=list)
    assays: list = field(default_factory=list)


# Mainland et al. 2015 (Sci Data) Table 1 reports log EC50 rounded to whole log units.
_ROUNDED_EC50_DOIS = {"10.1038/sdata.2015.2"}

# An EC50 fitted below this (log10 M) lies far under the concentrations these
# cell assays actually use, so the value is an extrapolation of the curve fit
# rather than a measured potency. Such pairs stay in the data but are flagged.
ASSAY_FLOOR_LOG = -9.0  # 1 nM


def _aggregate_one(key, g: pd.DataFrame) -> Pair:
    gene, allele, ik = key
    dois = sorted({d for d in g["doi"] if d})
    assays = sorted({f"{t} / {c}" for t, c in zip(g["Type"].fillna("?"), g["Cell_line"].fillna("?"))})
    pos = g[g["responsive"] == 1]
    pos_c = [c for c in pos["conc_um"] if pd.notna(c) and c > 0]
    base = dict(gene=gene, allele=allele, inchikey=ik, n_experiments=len(g), dois=dois, assays=assays,
                n_positive=len(pos), min_resp_um=min(pos_c) if pos_c else None)
    dr = g[g["is_dr"]]
    if len(dr):
        resp = set(dr["responsive"])
        if len(resp) > 1:
            return Pair(**base, status="inconclusive", quality="ec50", reason="contradictory dose-response results")
        if 1 in resp:
            vals = [
                (round(v, 3), d, d in _ROUNDED_EC50_DOIS)
                for v, d, r in zip(dr["log_ec50"], dr["doi"], dr["responsive"])
                if r == 1 and pd.notna(v)
            ]
            gts = [x for x in dr["log_ec50_gt"] if pd.notna(x)]
            med = float(pd.Series([v for v, _, _ in vals]).median()) if vals else None
            return Pair(
                **base, status="agonist", quality="ec50",
                log_ec50=round(med, 3) if med is not None else None, log_ec50_values=vals,
                log_ec50_gt=round(max(gts), 3) if (gts and not vals) else None,
                ec50_below_assay_range=med is not None and med < ASSAY_FLOOR_LOG,
            )
        return Pair(**base, status="non_agonist", quality="ec50")

    sc = g[g["conc_um"].fillna(1.0) > 0]  # drop 0 µM vehicle-control rows
    by_c: dict = {}
    for c, r in zip(sc["conc_um"], sc["responsive"]):
        by_c.setdefault(c if pd.notna(c) else None, set()).add(r)
    if any(len(s) > 1 for s in by_c.values()):
        return Pair(**base, status="inconclusive", quality="screening", reason="inconsistent results at the same concentration")
    known = sorted((c, next(iter(s))) for c, s in by_c.items() if c is not None)
    for i, (c1, r1) in enumerate(known):
        if r1 == 1 and any(r2 == 0 for c2, r2 in known[i + 1:] if c2 > c1):
            return Pair(**base, status="inconclusive", quality="screening", reason="responsive at a lower but not a higher concentration")
    responsive = any(1 in s for s in by_c.values())
    n_conc = len(by_c)
    return Pair(
        **base,
        status="agonist" if responsive else "non_agonist",
        quality="secondaryScreening" if n_conc >= 2 else "primaryScreening",
        max_conc_um=max((c for c, _ in known), default=None),
    )


def aggregate_pairs(h: pd.DataFrame) -> list[Pair]:
    return [_aggregate_one(k, g) for k, g in h.groupby(["gene", "allele", "InChI Key"], sort=False)]


def molecule_table(h: pd.DataFrame) -> pd.DataFrame:
    """One row per InChIKey with the most common name and any identifiers M2OR gives."""
    def first(s):
        s = s.dropna()
        return s.mode().iat[0] if len(s) else None
    return h.groupby("InChI Key").agg(
        name=("Name", first), cid=("CID", first), cas=("CAS", first),
        smiles=("canonicalSMILES", first), mixture=("Mixture", first),
    )
