"""Test odorants: identity (PubChem), M2OR matching and odor descriptors.

Odorants are identified by InChIKey, so stereoisomers stay separate
(OR1A1, for example, responds differently to the carvone enantiomers).
"""
from __future__ import annotations

import ast
import urllib.parse

import pandas as pd
from rdkit import Chem, RDLogger

from .paths import PYRFUME_DIR
from .sources import cached_json

RDLogger.DisableLog("rdApp.*")

# Test odorants. Seeds come from the project brief (section 3.2), adjusted
# after the M2OR check (PLAN.md, decision D4): racemic muscone and
# (S)-(-)-citronellol are the forms with data; ethyl vanillin was dropped
# (9 ORs tested, no agonist). `claimed` = receptor named in the brief,
# checked against M2OR by the build. `inchikey` pins the stereoisomer.
SEEDS = [
    dict(id="propionic-acid", name="propionic acid", pubchem="propionic acid", claimed=["OR51E2"]),
    dict(id="muscone", name="muscone (racemic)", inchikey="ALHUZKCOMYUFRB-UHFFFAOYSA-N", claimed=["OR5AN1", "OR1A1"]),
    dict(id="androstenone", name="androstenone", pubchem="androstenone", claimed=["OR7D4"]),
    dict(id="guaiacol", name="guaiacol", pubchem="guaiacol", claimed=["OR10G4"]),
    dict(id="vanillin", name="vanillin", pubchem="vanillin", claimed=["OR10G4"]),
    dict(id="beta-ionone", name="β-ionone", pubchem="beta-ionone", claimed=["OR5A1"]),
    dict(id="cis-3-hexenol", name="cis-3-hexen-1-ol", pubchem="cis-3-hexen-1-ol", claimed=["OR2J3"]),
    dict(id="bourgeonal", name="bourgeonal", pubchem="bourgeonal", claimed=["OR1D2"]),
    dict(id="isovaleric-acid", name="isovaleric acid", pubchem="isovaleric acid", claimed=[]),
    dict(id="s-citronellol", name="(S)-(−)-citronellol", inchikey="QMVPMAAFGQKVCJ-JTQLQIEISA-N", claimed=["OR1A1"]),
    dict(id="r-carvone", name="(R)-(−)-carvone", pubchem="(R)-(-)-carvone", claimed=["OR1A1"]),
    dict(id="s-carvone", name="(S)-(+)-carvone", pubchem="(S)-(+)-carvone", claimed=["OR1A1"]),
]

# Common fragrance materials chosen from the data (most human ORs tested and
# most agonists in M2OR) to make the combinatorial pattern rich.
EXTRAS = [
    dict(id="isoeugenol", name="isoeugenol", pubchem="isoeugenol", claimed=[]),
    dict(id="geranyl-acetate", name="geranyl acetate", pubchem="geranyl acetate", claimed=[]),
    dict(id="l-menthol", name="(−)-menthol", pubchem="(-)-menthol", claimed=[]),
    dict(id="phenylacetaldehyde", name="phenylacetaldehyde", pubchem="phenylacetaldehyde", claimed=[]),
]


def resolve(spec: dict) -> dict | None:
    return pubchem_by_inchikey(spec["inchikey"]) if spec.get("inchikey") else pubchem_by_name(spec["pubchem"])


def pubchem_by_name(name: str) -> dict | None:
    url = ("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/" + urllib.parse.quote(name)
           + "/property/InChIKey,IsomericSMILES,SMILES,MolecularFormula,MolecularWeight,IUPACName,Title/JSON")
    d = cached_json(url)
    if not d:
        return None
    p = d["PropertyTable"]["Properties"][0]
    p["smiles"] = p.get("SMILES") or p.get("IsomericSMILES")
    return p


def pubchem_by_inchikey(ik: str) -> dict | None:
    url = ("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/" + ik
           + "/property/InChIKey,IsomericSMILES,SMILES,MolecularFormula,MolecularWeight,IUPACName,Title/JSON")
    d = cached_json(url)
    if not d:
        return None
    p = d["PropertyTable"]["Properties"][0]
    p["smiles"] = p.get("SMILES") or p.get("IsomericSMILES")
    return p


def inchikey(smiles: str) -> str | None:
    m = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
    return Chem.MolToInchiKey(m) if m else None


# --- odor descriptors -------------------------------------------------------

def load_leffingwell() -> pd.DataFrame:
    d = PYRFUME_DIR / "leffingwell"
    beh = pd.read_csv(d / "behavior_sparse.csv")
    stim = pd.read_csv(d / "stimuli.csv")
    df = beh.merge(stim, on="Stimulus")
    df["inchikey"] = df["IsomericSMILES"].map(inchikey)
    df["labels"] = df["Labels"].map(ast.literal_eval)
    return df[["inchikey", "CID", "name", "Raw Labels", "labels", "IsomericSMILES"]]


def load_dravnieks() -> pd.DataFrame:
    d = PYRFUME_DIR / "dravnieks_1985"
    beh = pd.read_csv(d / "behavior_1.csv")
    stim = pd.read_csv(d / "stimuli.csv")
    mol = pd.read_csv(d / "molecules.csv")
    df = beh.merge(stim[["Stimulus", "CID", "Conc", "Name"]], on="Stimulus").merge(
        mol[["CID", "IsomericSMILES"]], on="CID", how="left")
    df["inchikey"] = df["IsomericSMILES"].map(inchikey)
    return df


_NO_STEREO = "UHFFFAOYSA"


def _candidates(frame: pd.DataFrame, ik: str):
    """Exact InChIKey first; otherwise the same skeleton, but only where the
    source gives no stereochemistry. A different enantiomer is never used:
    (R)- and (S)-carvone smell different."""
    yield "exact", frame[frame.inchikey == ik]
    same = frame[(frame.inchikey.str[:14] == ik[:14]) & (frame.inchikey.str[15:25] == _NO_STEREO)]
    yield "stereo unspecified in source", same


KELLER_DESCRIPTORS = ["EDIBLE", "BAKERY", "SWEET", "FRUIT", "FISH", "GARLIC", "SPICES", "COLD", "SOUR", "BURNT",
                      "ACID", "WARM", "MUSKY", "SWEATY", "AMMONIA/URINOUS", "DECAYED", "WOOD", "GRASS", "FLOWER",
                      "CHEMICAL"]


def load_keller() -> dict[int, dict]:
    """Keller & Vosshall 2016: per CID, at the higher of the two test dilutions.

    Intensity and pleasantness are means (0-100) over panelists who reported
    smelling something. A descriptor slider left untouched is NA in the data,
    so descriptors are reported as the share of those panelists who used it
    and their mean rating.
    """
    d = PYRFUME_DIR / "keller_2016"
    beh = pd.read_csv(d / "behavior.csv", usecols=["Stimulus", "Subject", "MeasurementValue", "Value"])
    stim = pd.read_csv(d / "stimuli.csv", usecols=["Stimulus", "CIDs", "Concentration", "Ratio"])
    stim = stim[stim["CIDs"].astype(str).str.fullmatch(r"\d+")]
    stim["CID"] = stim["CIDs"].astype(int)
    high = stim.sort_values("Concentration").groupby("CID").tail(1).set_index("Stimulus")
    beh = beh[beh["Stimulus"].isin(high.index)]
    smelled = beh[(beh["MeasurementValue"] == "CAN OR CAN'T SMELL") & (beh["Value"] == "I smell something")]
    ok = set(zip(smelled["Stimulus"], smelled["Subject"]))
    beh = beh[[(s_, u) in ok for s_, u in zip(beh["Stimulus"], beh["Subject"])]]
    beh = beh.assign(v=pd.to_numeric(beh["Value"], errors="coerce"))
    out = {}
    for stim_id, g in beh.groupby("Stimulus"):
        n = g["Subject"].nunique()
        def mean_of(label):
            x = g.loc[g["MeasurementValue"] == label, "v"].dropna()
            return round(float(x.mean()), 1) if len(x) else None
        desc = {}
        for k in KELLER_DESCRIPTORS:
            x = g.loc[g["MeasurementValue"] == k, "v"].dropna()
            x = x[x > 0]
            if len(x):
                desc[k.lower()] = dict(share=round(len(x) / n, 2), mean=round(float(x.mean()), 1))
        row = high.loc[stim_id]
        out[int(row["CID"])] = dict(source="keller_2016", dilution=row["Ratio"], n_panelists=n,
                                    intensity=mean_of("HOW STRONG IS THE SMELL?"),
                                    pleasantness=mean_of("HOW PLEASANT IS THE SMELL?"),
                                    familiarity=mean_of("HOW FAMILIAR IS THE SMELL?"),
                                    descriptors=dict(sorted(desc.items(), key=lambda kv: -kv[1]["share"])))
    return out


def descriptors_for(ik: str, leff: pd.DataFrame, drav: pd.DataFrame) -> list[dict]:
    """Descriptor sets for one odorant from each perception dataset."""
    out = []
    for label, frame in _candidates(leff, ik):
        if len(frame):
            r = frame.iloc[0]
            out.append(dict(source="leffingwell", match=label, name=r["name"], raw=r["Raw Labels"], labels=r["labels"]))
            break
    desc_cols = [c for c in drav.columns if c not in ("Stimulus", "CID", "Conc", "Name", "IsomericSMILES", "inchikey")]
    for label, frame in _candidates(drav, ik):
        if len(frame):
            r = frame.sort_values("Conc").iloc[0]  # "high" sorts before "low"
            top = r[desc_cols].astype(float).sort_values(ascending=False).head(8)
            out.append(dict(source="dravnieks_1985", match=label, name=r["Name"], concentration=r["Conc"],
                            applicability={k.title(): round(v, 1) for k, v in top.items() if v > 0}))
            break
    return out
