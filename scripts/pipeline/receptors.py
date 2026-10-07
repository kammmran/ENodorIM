"""Human OR identity: HGNC symbols, UniProt, GPCRdb, AlphaFold DB, PDB.

HGNC is the naming authority (its OR symbols follow the HORDE
classification). M2OR uses several spellings for the same gene
("hOR10AC", "OR 10G9", old symbols), so each M2OR name is mapped to an
HGNC symbol by: exact symbol -> previous/alias symbol -> the UniProt ID
on the M2OR row -> exact sequence match. Unmapped names are kept and
reported.
"""
from __future__ import annotations

import json
import re

import pandas as pd

from .paths import GPCRDB_JSON, RAW, UNIPROT_TSV
from .sources import cached_json, cached_json_many, download

HGNC_TSV = RAW / "hgnc" / "hgnc_complete_set.txt"
HGNC_URL = "https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt"
_OR_SYMBOL = re.compile(r"^OR(\d+)([A-Z]+)(\d+)(P?)$")

# Experimental structures shown in the 3D viewer. Values checked against
# RCSB (data.rcsb.org) on 2026-10-07.
STRUCTURES = [
    dict(pdb="8F76", receptor="OR51E2", ligand="propionate", ligand_id="PPI", method="cryo-EM", resolution=3.1,
         doi="10.1038/s41586-023-05798-y", note="Native human receptor with miniGs399."),
    dict(pdb="8HTI", receptor="OR52cs", ligand="octanoic acid", ligand_id="OCA", method="cryo-EM", resolution=2.97,
         doi="10.1038/s41467-023-43983-9", note="Consensus OR52 sequence (class I); not a single human gene."),
    dict(pdb="8UXV", receptor="consOR51", ligand=None, ligand_id=None, method="cryo-EM", resolution=3.2,
         doi="10.1038/s41586-024-08126-0", note="Engineered consensus class I receptor, no ligand, with mini-Gs."),
    dict(pdb="8UXY", receptor="consOR1", ligand="L-menthol", ligand_id="XUQ", method="cryo-EM", resolution=3.3,
         doi="10.1038/s41586-024-08126-0", note="Engineered consensus class II receptor (family 1)."),
    dict(pdb="8UY0", receptor="consOR2", ligand="(S)-carvone", ligand_id="0WU", method="cryo-EM", resolution=3.2,
         doi="10.1038/s41586-024-08126-0", note="Engineered consensus class II receptor (family 2)."),
    dict(pdb="8UYQ", receptor="consOR4", ligand="2-methylthiazoline", ligand_id="XVT", method="cryo-EM", resolution=3.5,
         doi="10.1038/s41586-024-08126-0", note="Engineered consensus class II receptor (family 4)."),
]
NATIVE_STRUCTURES = {"OR51E2": "8F76"}


def load_hgnc() -> pd.DataFrame:
    download(HGNC_URL, HGNC_TSV)
    g = pd.read_csv(HGNC_TSV, sep="\t", dtype=str, low_memory=False)
    g = g[g["symbol"].str.match(_OR_SYMBOL, na=False) & g["gene_group"].str.contains("Olfactory receptor", na=False)]
    return g


def classify(symbol: str) -> dict:
    m = _OR_SYMBOL.match(symbol)
    if not m:
        return dict(family=None, subfamily=None, cls=None)
    fam = int(m.group(1))
    # Class I ("fish-like") ORs are families 51-56; class II are families 1-14.
    return dict(family=fam, subfamily=f"{fam}{m.group(2)}", cls="I" if 51 <= fam <= 56 else "II")


def sort_key(symbol: str):
    """HORDE-style order: class I families (51-56) first, then class II;
    within a family by subfamily letters, then member number."""
    m = _OR_SYMBOL.match(symbol)
    if not m:
        return (2, 999, 9, symbol, 0)
    fam = int(m.group(1))
    return (0 if 51 <= fam <= 56 else 1, fam, len(m.group(2)), m.group(2), int(m.group(3)))


class SymbolMapper:
    def __init__(self, hgnc: pd.DataFrame, uniprot: pd.DataFrame):
        self.symbols = set(hgnc["symbol"])
        self.alias: dict[str, set] = {}
        self.by_uniprot: dict[str, set] = {}
        for _, r in hgnc.iterrows():
            for col in ("prev_symbol", "alias_symbol"):
                for a in str(r[col]).split("|") if isinstance(r[col], str) else []:
                    self.alias.setdefault(a.strip(), set()).add(r["symbol"])
            for u in str(r["uniprot_ids"]).split("|") if isinstance(r["uniprot_ids"], str) else []:
                self.by_uniprot.setdefault(u.strip(), set()).add(r["symbol"])
        self.by_seq = {s: g for s, g in zip(uniprot["Sequence"], uniprot["Gene Names (primary)"]) if isinstance(s, str)}

    def map(self, raw: str, uniprot_ids: set, sequences: set) -> tuple[str, str]:
        """Return (symbol, how) for an M2OR gene name."""
        name = raw.replace(" ", "")
        if name in self.symbols:
            return name, "symbol"
        hits = self.alias.get(name, set())
        if len(hits) == 1:
            return next(iter(hits)), "alias"
        for u in uniprot_ids:
            hits = self.by_uniprot.get(u, set())
            if len(hits) == 1:
                return next(iter(hits)), "uniprot"
        for s in sequences:
            if s in self.by_seq:
                return self.by_seq[s], "sequence"
        return name, "unmapped"


def load_uniprot() -> pd.DataFrame:
    return pd.read_csv(UNIPROT_TSV, sep="\t", dtype=str)


def load_gpcrdb() -> dict[str, dict]:
    data = json.loads(GPCRDB_JSON.read_text())
    return {r["accession"]: r for r in data if r.get("species") == "Homo sapiens" and r.get("accession")}


def alphafold_models(accessions: list[str]) -> dict[str, dict]:
    urls = [f"https://alphafold.ebi.ac.uk/api/prediction/{a}" for a in accessions]
    out = {}
    for a, res in zip(accessions, cached_json_many(urls)):
        if res:
            m = res[0]
            out[a] = dict(entry=m.get("entryId"), version=m.get("latestVersion"), plddt=m.get("globalMetricValue"),
                          cif=m.get("cifUrl"), pdb=m.get("pdbUrl"))
    return out


def uniprot_extra(accessions: list[str]) -> dict[str, dict]:
    """Length/sequence for accessions not in the reviewed list (e.g. TrEMBL entries)."""
    out = {}
    for a in accessions:
        d = cached_json(f"https://rest.uniprot.org/uniprotkb/{a}.json")
        if d and d.get("sequence"):
            out[a] = dict(length=d["sequence"]["length"], sequence=d["sequence"]["value"],
                          reviewed=d.get("entryType", "").startswith("UniProtKB reviewed"))
    return out
