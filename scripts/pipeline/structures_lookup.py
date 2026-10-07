"""Resolve InChIKeys to structures via PubChem, in batches.

M2OR stores InChIKeys but leaves canonicalSMILES empty for most rows, and an
InChIKey is a hash, so the structure has to come from a lookup service.
Results are cached on disk, so this is paid once.
"""
from __future__ import annotations

import json
import time

import requests

from .paths import RAW

CACHE = RAW / "pubchem" / "inchikey_to_structure.json"
BATCH = 100
# InChIKey must be requested explicitly: PubChem does not echo the query key,
# returns results in arbitrary order and silently drops keys it cannot resolve,
# so rows are matched on the InChIKey it sends back.
URL = (
    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/property/"
    "InChIKey,SMILES,Title,MolecularFormula,MolecularWeight/JSON"
)


def _load() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    return {}


def _save(d: dict) -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(d))


def resolve(inchikeys: list[str], session: requests.Session | None = None) -> dict[str, dict]:
    """Map InChIKey -> {smiles, name, cid, formula, mw}. Unknown keys map to {}."""
    known = _load()
    todo = sorted({k for k in inchikeys if k and k not in known})
    s = session or requests.Session()
    s.headers["User-Agent"] = "ENodorIM-data-pipeline/0.1 (academic; DIFACQUIM, UNAM)"
    for i in range(0, len(todo), BATCH):
        chunk = todo[i : i + BATCH]
        try:
            r = s.post(URL, data={"inchikey": ",".join(chunk)}, timeout=120)
            props = r.json().get("PropertyTable", {}).get("Properties", []) if r.ok else []
        except (requests.RequestException, ValueError):
            props = []
        for p in props:
            key = p.get("InChIKey")
            if not key:
                continue
            known[key] = dict(
                smiles=p.get("SMILES") or p.get("IsomericSMILES"),
                name=p.get("Title"),
                cid=p.get("CID"),
                formula=p.get("MolecularFormula"),
                mw=p.get("MolecularWeight"),
            )
        # Record misses so they are not retried on every run.
        for key in chunk:
            known.setdefault(key, {})
        _save(known)
        if i + BATCH < len(todo):
            time.sleep(0.3)
    return {k: known.get(k, {}) for k in inchikeys}
