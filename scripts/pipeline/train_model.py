"""Train a per-receptor model of "does this molecule activate this receptor?".

The nearest-neighbour baseline in predict_index.py answers by similarity. This
module instead fits a regularised logistic regression per receptor on Morgan
fingerprint bits, which can learn that particular substructures matter rather
than overall similarity.

Both are evaluated on the *same* stratified folds, and the result is written
into the model file, so the site can state which one is actually better rather
than assuming the learned model wins. Only receptors with enough measured
molecules on both sides are trained at all.

The exported model is a small matrix (selected bits x receptors), so inference
runs in the browser as a dot product — no server.
"""
from __future__ import annotations

import json

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold

from . import m2or
from .paths import PROCESSED

# A receptor needs this many molecules on each side before a model is fitted.
MIN_POSITIVES = 8
MIN_NEGATIVES = 8
# A fingerprint bit must be set in this many training molecules to be kept,
# which cuts 2048 sparse columns to a few hundred informative ones.
MIN_BIT_COUNT = 5
N_FOLDS = 5
SEED = 0


def _unpack(blob: bytes, n: int, n_bytes: int) -> np.ndarray:
    return np.unpackbits(np.frombuffer(blob[: n * n_bytes], dtype=np.uint8).reshape(n, n_bytes), axis=1)


def _knn_scores(sim: np.ndarray, y: np.ndarray, train: np.ndarray, test: np.ndarray, k: int = 25) -> np.ndarray:
    """Similarity-weighted neighbour vote, the same rule the site's baseline uses."""
    out = np.zeros(len(test))
    for i, t in enumerate(test):
        s = sim[t, train]
        order = np.argsort(-s)[:k]
        w = s[order]
        w = np.where(w > 0, w, 0.0)
        out[i] = float((w * y[train][order]).sum() / w.sum()) if w.sum() > 0 else 0.0
    return out


def build_dataset(index: dict, blob: bytes) -> tuple[np.ndarray, dict[str, np.ndarray], list[str]]:
    mols = index["receptors"]["molecules"]
    n, nb = len(mols), index["fingerprint"]["n_bytes"]
    bits = _unpack(blob, n, nb)
    labels: dict[str, np.ndarray] = {}
    for gene in {a["r"] for m in mols for a in m["agonists"]} | {r for m in mols for r in m["inactive"]}:
        y = np.full(n, -1, dtype=np.int8)  # -1 = not tested on this receptor
        for i, m in enumerate(mols):
            if gene in {a["r"] for a in m["agonists"]}:
                y[i] = 1
            elif gene in m["inactive"]:
                y[i] = 0
        labels[gene] = y
    return bits, labels, [m["inchikey"] for m in mols]


def train(index: dict, blob: bytes) -> dict:
    bits, labels, keys = build_dataset(index, blob)
    n = bits.shape[0]
    # Tanimoto between every pair, reused for the baseline arm of the comparison.
    inter = bits.astype(np.float32) @ bits.astype(np.float32).T
    counts = bits.sum(1).astype(np.float32)
    union = counts[:, None] + counts[None, :] - inter
    sim = np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)
    np.fill_diagonal(sim, 0.0)

    receptors: list[dict] = []
    per_receptor_eval: list[dict] = []
    for gene in sorted(labels):
        y_all = labels[gene]
        idx = np.where(y_all >= 0)[0]
        y = y_all[idx].astype(int)
        if y.sum() < MIN_POSITIVES or (len(y) - y.sum()) < MIN_NEGATIVES:
            continue
        X_full = bits[idx]
        keep = np.where(X_full.sum(0) >= MIN_BIT_COUNT)[0]
        if len(keep) < 5:
            continue
        X = X_full[:, keep].astype(np.float32)

        # Same folds for both methods, so the comparison is like for like.
        skf = StratifiedKFold(n_splits=min(N_FOLDS, int(y.sum()), int(len(y) - y.sum())), shuffle=True, random_state=SEED)
        model_scores, knn_scores, truths = [], [], []
        for tr, te in skf.split(X, y):
            clf = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000, random_state=SEED)
            clf.fit(X[tr], y[tr])
            model_scores.append(clf.predict_proba(X[te])[:, 1])
            knn_scores.append(_knn_scores(sim, y_all.clip(0), idx[tr], idx[te]))
            truths.append(y[te])
        yt = np.concatenate(truths)
        ms, ks = np.concatenate(model_scores), np.concatenate(knn_scores)
        if len(np.unique(yt)) < 2:
            continue
        ev = dict(
            receptor=gene, n=int(len(y)), positives=int(y.sum()),
            model_auc=round(float(roc_auc_score(yt, ms)), 3), knn_auc=round(float(roc_auc_score(yt, ks)), 3),
            model_ap=round(float(average_precision_score(yt, ms)), 3), knn_ap=round(float(average_precision_score(yt, ks)), 3),
        )
        per_receptor_eval.append(ev)

        # Final model on all of this receptor's data.
        clf = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000, random_state=SEED)
        clf.fit(X, y)
        receptors.append(dict(
            receptor=gene, bits=keep.tolist(),
            coef=[round(float(c), 4) for c in clf.coef_[0]], intercept=round(float(clf.intercept_[0]), 4),
            n=int(len(y)), positives=int(y.sum()), auc=ev["model_auc"],
        ))

    summary = _summarise(per_receptor_eval)
    return dict(
        kind="logistic-regression",
        fingerprint=index["fingerprint"],
        trained_on=dict(source="M2OR human reference-allele pairs", doi="10.1093/nar/gkad886",
                        molecules=int(n), min_positives=MIN_POSITIVES, min_negatives=MIN_NEGATIVES,
                        min_bit_count=MIN_BIT_COUNT, C=0.1, class_weight="balanced"),
        evaluation=dict(scheme=f"{N_FOLDS}-fold stratified cross-validation per receptor, identical folds for both methods",
                        per_receptor=per_receptor_eval, **summary),
        receptors=receptors,
    )


def _summarise(evs: list[dict]) -> dict:
    if not evs:
        return dict(receptors=0)
    m = np.array([e["model_auc"] for e in evs])
    k = np.array([e["knn_auc"] for e in evs])
    mp = np.array([e["model_ap"] for e in evs])
    kp = np.array([e["knn_ap"] for e in evs])
    return dict(
        receptors=len(evs),
        mean_model_auc=round(float(m.mean()), 3), mean_knn_auc=round(float(k.mean()), 3),
        median_model_auc=round(float(np.median(m)), 3), median_knn_auc=round(float(np.median(k)), 3),
        mean_model_ap=round(float(mp.mean()), 3), mean_knn_ap=round(float(kp.mean()), 3),
        model_better=int((m > k).sum()), knn_better=int((k > m).sum()), tied=int((m == k).sum()),
    )


def write(model: dict) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "predict_model.json").write_text(json.dumps(model, separators=(",", ":")))


def summary(model: dict) -> list[str]:
    e = model["evaluation"]
    if not e.get("receptors"):
        return ["   no receptor had enough measured molecules to train on"]
    winner = "learned model" if e["mean_model_auc"] > e["mean_knn_auc"] else "nearest-neighbour baseline"
    return [
        f"   trained {len(model['receptors'])} per-receptor models ({e['scheme']})",
        f"   mean ROC-AUC: learned {e['mean_model_auc']:.3f} vs neighbours {e['mean_knn_auc']:.3f}  "
        f"(better on {e['model_better']}/{e['receptors']} receptors) -> {winner} wins on average",
        f"   mean average precision: learned {e['mean_model_ap']:.3f} vs neighbours {e['mean_knn_ap']:.3f}",
    ]
