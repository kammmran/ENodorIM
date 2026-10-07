"""Build the nearest-neighbour index used by the "Draw a molecule" screen.

A drawn molecule has no measured data, so its receptor activation and odor
descriptors are *predicted* from the molecules that do: Morgan fingerprints
(radius 2, 2048 bits) are compared by Tanimoto similarity, and the most
similar known molecules are shown as the evidence for the prediction.

Two reference sets:
  * receptors  — M2OR human molecules, with the receptors each one responds to
  * descriptors — Leffingwell molecules, with their expert odor labels

Fingerprints go into a flat binary file (256 bytes per molecule, in index
order) so the browser can fetch an ArrayBuffer and run Tanimoto directly.
RDKit.js produces bit-identical fingerprints for the same settings, so the
query molecule can be fingerprinted in the browser and compared against these.
"""
from __future__ import annotations

import json

import numpy as np
from rdkit import Chem, RDLogger
from rdkit.Chem import rdFingerprintGenerator

from . import m2or, odorants, structures_lookup
from .paths import PROCESSED

RDLogger.DisableLog("rdApp.*")

RADIUS = 2
N_BITS = 2048
N_BYTES = N_BITS // 8
# Chirality is included: this site's own data show enantiomers activating
# receptors differently ((R)- and (S)-carvone on OR1A1), so a predictor that
# scored them as identical molecules would contradict the measured pairs.
# RDKit.js `useChirality: true` is bit-identical to this setting.
CHIRAL = True
_GEN = rdFingerprintGenerator.GetMorganGenerator(radius=RADIUS, fpSize=N_BITS, includeChirality=CHIRAL)


def fingerprint(smiles: str) -> np.ndarray | None:
    mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
    if mol is None:
        return None
    return np.frombuffer(_GEN.GetFingerprintAsNumPy(mol).astype(np.uint8).tobytes(), dtype=np.uint8)


def _packed(smiles: str) -> bytes | None:
    """Fingerprint packed to 256 bytes, bit order matching RDKit's bit string."""
    mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
    if mol is None:
        return None
    bits = _GEN.GetFingerprintAsNumPy(mol).astype(np.uint8)
    return np.packbits(bits).tobytes()


def build(h, pairs, mols) -> tuple[dict, bytes]:
    """Return (index JSON, fingerprint blob)."""
    ref = [p for p in pairs if p.allele == m2or.REF and p.status != "inconclusive"]
    by_mol: dict[str, list] = {}
    for p in ref:
        by_mol.setdefault(p.inchikey, []).append(p)
    structures = structures_lookup.resolve(sorted(by_mol))

    receptors_rows, blobs = [], []
    for ik in sorted(by_mol):
        smiles = structures.get(ik, {}).get("smiles")
        fp = _packed(smiles) if smiles else None
        if fp is None:
            continue
        ps = by_mol[ik]
        agonists = [p for p in ps if p.status == "agonist"]
        receptors_rows.append(dict(
            inchikey=ik,
            name=structures[ik].get("name") or mols.at[ik, "name"],
            smiles=smiles,
            cid=structures[ik].get("cid"),
            n_tested=len(ps),
            # Receptors this molecule activates, strongest measured first.
            agonists=[dict(r=p.gene, ec50=p.log_ec50, q=p.quality) for p in
                      sorted(agonists, key=lambda p: (p.log_ec50 is None, p.log_ec50 or 0))],
            # Receptors tested without a response: needed so a prediction can say
            # "this neighbour was tested here and did not respond".
            inactive=sorted(p.gene for p in ps if p.status == "non_agonist"),
        ))
        blobs.append(fp)

    leff = odorants.load_leffingwell()
    descriptor_rows = []
    seen: set[str] = set()
    for _, r in leff.iterrows():
        ik, smi = r["inchikey"], r["IsomericSMILES"]
        if not ik or ik in seen or not isinstance(smi, str):
            continue
        fp = _packed(smi)
        if fp is None:
            continue
        seen.add(ik)
        descriptor_rows.append(dict(inchikey=ik, name=r["name"], smiles=smi, labels=list(r["labels"])))
        blobs.append(fp)

    index = dict(
        fingerprint=dict(kind="morgan", radius=RADIUS, n_bits=N_BITS, n_bytes=N_BYTES, chirality=CHIRAL,
                         js_options=dict(radius=RADIUS, nBits=N_BITS, useChirality=CHIRAL),
                         note="RDKit Morgan fingerprint; RDKit.js with js_options is bit-identical."),
        receptors=dict(
            offset=0, count=len(receptors_rows), source="M2OR (human, reference allele)",
            doi="10.1093/nar/gkad886", molecules=receptors_rows,
        ),
        descriptors=dict(
            offset=len(receptors_rows), count=len(descriptor_rows),
            source="Leffingwell PMP 2001 via Pyrfume (CC BY-NC)", doi="10.5281/zenodo.4085098",
            molecules=descriptor_rows,
        ),
    )
    return index, b"".join(blobs)


def with_evaluation(index: dict, blob: bytes) -> dict:
    index["evaluation"] = evaluate(index, blob)
    return index


def write(index: dict, blob: bytes) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "predict_index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    (PROCESSED / "predict_fp.bin").write_bytes(blob)


def summary(index: dict, blob: bytes) -> list[str]:
    r, d = index["receptors"], index["descriptors"]
    n_ag = sum(len(m["agonists"]) for m in r["molecules"])
    e = index.get("evaluation") or {}
    extra = ([
        f"   hold-one-out over {e['molecules_scored']} molecules with enough ground truth: "
        f"top-ranked prediction correct {e['top1_accuracy']:.0%} of the time (n = {e['top1_n']}); "
        f"precision {e['precision']:.2f}, recall {e['recall']:.2f} at score >= {e['threshold']}",
    ] if e else [])
    return extra + [
        f"   receptor reference set: {r['count']} molecules, {n_ag} measured agonist pairs "
        f"(median {int(np.median([m['n_tested'] for m in r['molecules']]))} receptors tested per molecule)",
        f"   descriptor reference set: {d['count']} molecules with expert odor labels",
        f"   fingerprints: {len(blob) / 1024:.0f} KiB ({N_BITS}-bit Morgan, radius {RADIUS}, "
        f"chirality {'on' if CHIRAL else 'off'})",
    ]


def evaluate(index: dict, blob: bytes, k: int = 40, min_sim: float = 0.2,
             min_support: float = 1.0, threshold: float = 0.5) -> dict:
    """Hold-one-out check of the baseline, scored only on receptors the held-out
    molecule was actually tested on (so it is not penalised for receptors nobody
    tested). Mirrors the thresholds used in the browser."""
    mols = index["receptors"]["molecules"]
    n, nb = len(mols), index["fingerprint"]["n_bytes"]
    bits = np.unpackbits(np.frombuffer(blob[: n * nb], dtype=np.uint8).reshape(n, nb), axis=1).astype(np.float32)
    inter = bits @ bits.T
    counts = bits.sum(1)
    union = counts[:, None] + counts[None, :] - inter
    sim = np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)
    np.fill_diagonal(sim, -1.0)

    agonists = [{a["r"] for a in m["agonists"]} for m in mols]
    inactive = [set(m["inactive"]) for m in mols]
    tp = fp = fn = 0
    top1_hits = top1_total = 0
    scored = 0
    for i, m in enumerate(mols):
        truth, neg = agonists[i], inactive[i]
        if not truth or len(truth | neg) < 10:
            continue  # too little ground truth to score against
        order = np.argsort(-sim[i])
        picked = [j for j in order[: k * 3] if sim[i, j] >= min_sim][:k]
        if not picked:
            continue
        scored += 1
        support: dict[str, float] = {}
        yes: dict[str, float] = {}
        for j in picked:
            s = float(sim[i, j])
            for r in agonists[j]:
                support[r] = support.get(r, 0.0) + s
                yes[r] = yes.get(r, 0.0) + s
            for r in inactive[j]:
                support[r] = support.get(r, 0.0) + s
        ranked = sorted(
            ((r, yes.get(r, 0.0) / v, v) for r, v in support.items() if v >= min_support),
            key=lambda x: (-x[1], -x[2]),
        )
        predicted = {r for r, sc, _ in ranked if sc >= threshold}
        tested = truth | neg
        tp += len(predicted & truth)
        fp += len(predicted & neg)
        fn += len(truth - predicted)
        in_tested = [r for r, _, _ in ranked if r in tested]
        if in_tested:
            top1_total += 1
            top1_hits += in_tested[0] in truth
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    return dict(molecules_scored=scored, tp=tp, fp=fp, fn=fn, precision=round(prec, 3), recall=round(rec, 3),
                f1=round(2 * prec * rec / (prec + rec), 3) if prec + rec else 0.0,
                top1_accuracy=round(top1_hits / top1_total, 3) if top1_total else 0.0, top1_n=top1_total,
                k=k, min_similarity=min_sim, min_support=min_support, threshold=threshold)
