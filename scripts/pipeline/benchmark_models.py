"""Benchmark the shipped predictor against alternatives, with honest validation.

`train_model.py` fits one fixed configuration (L2 logistic regression, C=0.1) and
scores it with plain 5-fold cross-validation. That answers "how good is this
model", but not "how good is the *procedure* that chose it" — and with 70-319
molecules per receptor the second question is where the optimism hides.

So every model family is run through two schemes on identical outer folds:

  flat CV      hyperparameters picked by cross-validation, and the best of those
               cross-validation scores reported. This is what a tuning loop
               reports about itself, and it is biased upwards: the same folds
               chose the winner and graded it.

  nested CV    hyperparameters picked by an inner cross-validation *inside* each
               outer training fold, so every outer test fold is scored by a model
               that never saw it, selection included. The gap between the two is
               the selection bias.

Receptor data sets are tiny and imbalanced, so a single fold's AUC is noise.
Out-of-fold predictions are pooled across the whole outer split before scoring,
and the whole split is repeated with different shuffles; the reported figure is
the mean over repeats, with the spread kept.

Run:  .venv/bin/python -m scripts.pipeline.benchmark_models [--quick]
Writes data/processed/model_benchmark.json and prints the summary tables.
"""
from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass

import numpy as np
from joblib import Parallel, delayed
from sklearn.base import BaseEstimator, ClassifierMixin, TransformerMixin, clone
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import ParameterGrid, StratifiedKFold
from sklearn.naive_bayes import BernoulliNB
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC

from .paths import PROCESSED
from .train_model import MIN_BIT_COUNT, MIN_NEGATIVES, MIN_POSITIVES, build_dataset

OUTER_FOLDS = 5
INNER_FOLDS = 3
N_REPEATS = 3
SEED = 0


# --------------------------------------------------------------------------- #
# pieces that have to live inside the pipeline so they are refitted per fold
# --------------------------------------------------------------------------- #

class MinCountBits(BaseEstimator, TransformerMixin):
    """Drop fingerprint bits set in fewer than `min_count` training molecules.

    train_model.py applies this filter to all of a receptor's data at once. It
    only looks at X, so the leak is mild, but inside the pipeline it costs
    nothing to do it properly.
    """

    def __init__(self, min_count: int = MIN_BIT_COUNT):
        self.min_count = min_count

    def fit(self, X, y=None):
        keep = np.where(np.asarray(X).sum(0) >= self.min_count)[0]
        self.keep_ = keep if len(keep) >= 5 else np.arange(np.asarray(X).shape[1])
        return self

    def transform(self, X):
        return np.asarray(X)[:, self.keep_].astype(np.float32)


class TanimotoKNN(BaseEstimator, ClassifierMixin):
    """Similarity-weighted neighbour vote on raw fingerprint bits.

    The site's baseline, reimplemented as an estimator so it goes through exactly
    the same folds and the same tuning machinery as everything else. `k` is a
    hyperparameter here, which the shipped comparison fixed at 25.
    """

    def __init__(self, k: int = 25):
        self.k = k

    def fit(self, X, y):
        self.X_ = np.asarray(X, dtype=np.float32)
        self.y_ = np.asarray(y, dtype=np.float32)
        self.counts_ = self.X_.sum(1)
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        Q = np.asarray(X, dtype=np.float32)
        inter = Q @ self.X_.T
        union = Q.sum(1)[:, None] + self.counts_[None, :] - inter
        sim = np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)
        k = min(self.k, sim.shape[1])
        out = np.zeros(len(Q))
        for i in range(len(Q)):
            order = np.argpartition(-sim[i], k - 1)[:k]
            w = np.clip(sim[i][order], 0, None)
            out[i] = float((w * self.y_[order]).sum() / w.sum()) if w.sum() > 0 else 0.0
        return np.column_stack([1 - out, out])

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


def _scores(est, X) -> np.ndarray:
    if hasattr(est, "predict_proba"):
        return est.predict_proba(X)[:, 1]
    return est.decision_function(X)


# --------------------------------------------------------------------------- #
# the model families
# --------------------------------------------------------------------------- #

@dataclass
class Family:
    name: str
    label: str
    pipeline: Pipeline
    grid: dict
    note: str = ""

    def fixed(self) -> bool:
        return all(len(v) == 1 for v in self.grid.values())


def _pipe(clf, filter_bits: bool = True) -> Pipeline:
    steps = [("bits", MinCountBits())] if filter_bits else []
    return Pipeline(steps + [("clf", clf)])


def families(quick: bool) -> list[Family]:
    rf_trees = 200 if quick else 400
    out = [
        Family(
            "shipped", "logistic C=0.1 (shipped)",
            _pipe(LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000, random_state=SEED)),
            {},
            "the configuration in predict_model.json, no tuning at all",
        ),
        Family(
            "logreg", "logistic regression (L2)",
            _pipe(LogisticRegression(class_weight="balanced", max_iter=5000, random_state=SEED)),
            {"clf__C": [0.01, 0.03, 0.1, 0.3, 1.0, 3.0]},
        ),
        Family(
            "logreg_l1", "logistic regression (L1)",
            _pipe(LogisticRegression(penalty="l1", solver="liblinear", class_weight="balanced",
                                     max_iter=5000, random_state=SEED)),
            {"clf__C": [0.03, 0.1, 0.3, 1.0, 3.0]},
        ),
        Family(
            "svm_linear", "linear SVM",
            _pipe(SVC(kernel="linear", class_weight="balanced", random_state=SEED)),
            {"clf__C": [0.01, 0.1, 1.0, 10.0]},
        ),
        Family(
            "svm_rbf", "RBF SVM",
            _pipe(SVC(kernel="rbf", class_weight="balanced", random_state=SEED)),
            {"clf__C": [1.0, 10.0, 100.0], "clf__gamma": ["scale", 0.001, 0.01]},
        ),
        Family(
            "rf", "random forest",
            _pipe(RandomForestClassifier(n_estimators=rf_trees, class_weight="balanced_subsample",
                                         n_jobs=1, random_state=SEED)),
            {"clf__max_features": ["sqrt", 0.1], "clf__min_samples_leaf": [1, 3]},
        ),
        Family(
            "et", "extra trees",
            _pipe(ExtraTreesClassifier(n_estimators=rf_trees, class_weight="balanced",
                                       n_jobs=1, random_state=SEED)),
            {"clf__max_features": ["sqrt", 0.1], "clf__min_samples_leaf": [1, 3]},
        ),
        Family(
            "nb", "Bernoulli naive Bayes",
            _pipe(BernoulliNB()),
            {"clf__alpha": [0.1, 1.0, 5.0]},
            "the classic fingerprint baseline from cheminformatics",
        ),
        Family(
            "knn", "Tanimoto neighbours",
            _pipe(TanimotoKNN(), filter_bits=False),
            {"clf__k": [10, 25, 40]},
            "the site's similarity baseline; k=25 is what the shipped comparison used",
        ),
    ]
    if quick:
        keep = {"shipped", "logreg", "rf", "knn"}
        out = [f for f in out if f.name in keep]
    return out


# --------------------------------------------------------------------------- #
# evaluation
# --------------------------------------------------------------------------- #

def _n_splits(y: np.ndarray, want: int) -> int:
    return max(2, min(want, int(y.sum()), int(len(y) - y.sum())))


def _oof(pipeline: Pipeline, params: dict, X: np.ndarray, y: np.ndarray, splits) -> np.ndarray:
    """Out-of-fold scores for one fixed parameter setting."""
    oof = np.zeros(len(y))
    for tr, te in splits:
        est = clone(pipeline).set_params(**params)
        est.fit(X[tr], y[tr])
        oof[te] = _scores(est, X[te])
    return oof


def _pooled(y: np.ndarray, s: np.ndarray) -> tuple[float, float]:
    return float(roc_auc_score(y, s)), float(average_precision_score(y, s))


def evaluate_family(fam: Family, X: np.ndarray, y: np.ndarray) -> dict:
    """Flat and nested CV for one family on one receptor, over N_REPEATS shuffles."""
    grid = list(ParameterGrid(fam.grid)) or [{}]
    flat_auc, flat_ap, nest_auc, nest_ap, chosen = [], [], [], [], []

    for rep in range(N_REPEATS):
        outer = StratifiedKFold(n_splits=_n_splits(y, OUTER_FOLDS), shuffle=True, random_state=SEED + rep)
        splits = list(outer.split(X, y))

        # ---- flat: tune on these folds, report the winner's own score --------
        best = None
        for params in grid:
            auc, ap = _pooled(y, _oof(fam.pipeline, params, X, y, splits))
            if best is None or auc > best[0]:
                best = (auc, ap, params)
        flat_auc.append(best[0])
        flat_ap.append(best[1])

        # ---- nested: tune inside each outer training fold --------------------
        oof = np.zeros(len(y))
        for tr, te in splits:
            Xtr, ytr = X[tr], y[tr]
            if len(grid) == 1:
                params = grid[0]
            else:
                inner = StratifiedKFold(n_splits=_n_splits(ytr, INNER_FOLDS), shuffle=True,
                                        random_state=SEED + rep)
                isplits = list(inner.split(Xtr, ytr))
                scored = []
                for p in grid:
                    s = _oof(fam.pipeline, p, Xtr, ytr, isplits)
                    scored.append((roc_auc_score(ytr, s) if len(np.unique(ytr)) > 1 else 0.5, p))
                params = max(scored, key=lambda t: t[0])[1]
            chosen.append(json.dumps({k: str(v) for k, v in params.items()}, sort_keys=True))
            est = clone(fam.pipeline).set_params(**params)
            est.fit(Xtr, ytr)
            oof[te] = _scores(est, X[te])
        auc, ap = _pooled(y, oof)
        nest_auc.append(auc)
        nest_ap.append(ap)

    return dict(
        family=fam.name,
        flat_auc=float(np.mean(flat_auc)), flat_auc_sd=float(np.std(flat_auc)),
        flat_ap=float(np.mean(flat_ap)),
        nested_auc=float(np.mean(nest_auc)), nested_auc_sd=float(np.std(nest_auc)),
        nested_ap=float(np.mean(nest_ap)),
        grid_size=len(grid),
        chosen=_mode(chosen) if chosen and len(grid) > 1 else None,
        chosen_distinct=len(set(chosen)) if len(grid) > 1 else 1,
    )


def _mode(xs: list[str]) -> str:
    vals, counts = np.unique(np.array(xs), return_counts=True)
    return str(vals[int(np.argmax(counts))])


def evaluate_receptor(gene: str, bits: np.ndarray, y_all: np.ndarray, fams: list[Family]) -> dict | None:
    idx = np.where(y_all >= 0)[0]
    y = y_all[idx].astype(int)
    if y.sum() < MIN_POSITIVES or (len(y) - y.sum()) < MIN_NEGATIVES:
        return None
    X = bits[idx]
    return dict(
        receptor=gene, n=int(len(y)), positives=int(y.sum()),
        results=[evaluate_family(f, X, y) for f in fams],
    )


# --------------------------------------------------------------------------- #
# reporting
# --------------------------------------------------------------------------- #

def aggregate(per_receptor: list[dict], fams: list[Family]) -> list[dict]:
    rows = []
    shipped = {r["receptor"]: _find(r, "shipped") for r in per_receptor}
    for fam in fams:
        got = [(r, _find(r, fam.name)) for r in per_receptor]
        flat = np.array([g["flat_auc"] for _, g in got])
        nest = np.array([g["nested_auc"] for _, g in got])
        base = np.array([shipped[r["receptor"]]["nested_auc"] for r, _ in got])
        rows.append(dict(
            family=fam.name, label=fam.label, note=fam.note, grid_size=got[0][1]["grid_size"],
            mean_flat_auc=round(float(flat.mean()), 3),
            mean_nested_auc=round(float(nest.mean()), 3),
            median_nested_auc=round(float(np.median(nest)), 3),
            optimism=round(float((flat - nest).mean()), 3),
            mean_nested_ap=round(float(np.mean([g["nested_ap"] for _, g in got])), 3),
            mean_flat_ap=round(float(np.mean([g["flat_ap"] for _, g in got])), 3),
            beats_shipped=int((nest > base).sum()), loses_to_shipped=int((nest < base).sum()),
            mean_delta_vs_shipped=round(float((nest - base).mean()), 3),
            wilcoxon_p=_wilcoxon(nest, base),
            most_chosen=got[0][1]["chosen"],
        ))
    _holm(rows)
    return sorted(rows, key=lambda r: -r["mean_nested_auc"])


def _holm(rows: list[dict]) -> None:
    """Holm-Bonferroni across the families compared to the shipped model.

    Eight comparisons against one reference on the same 31 receptors; without
    the correction a nominal p < 0.05 here means very little.
    """
    tested = sorted([r for r in rows if r["wilcoxon_p"] is not None], key=lambda r: r["wilcoxon_p"])
    m, prev = len(tested), 0.0
    for i, r in enumerate(tested):
        prev = max(prev, min(1.0, (m - i) * r["wilcoxon_p"]))
        r["wilcoxon_p_holm"] = round(prev, 4)
    for r in rows:
        r.setdefault("wilcoxon_p_holm", None)


def _find(receptor: dict, family: str) -> dict:
    return next(r for r in receptor["results"] if r["family"] == family)


def _wilcoxon(a: np.ndarray, b: np.ndarray) -> float | None:
    try:
        from scipy.stats import wilcoxon
        if np.allclose(a, b):
            return None
        return round(float(wilcoxon(a, b).pvalue), 4)
    except Exception:
        return None


def _table(rows: list[list[str]]) -> list[str]:
    w = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
    out = []
    for n, r in enumerate(rows):
        out.append("  " + "  ".join(c.ljust(w[i]) if i == 0 else c.rjust(w[i]) for i, c in enumerate(r)))
        if n == 0:
            out.append("  " + "  ".join("-" * w[i] for i in range(len(w))))
    return out


def report(bench: dict) -> list[str]:
    agg = bench["families"]
    lines = [
        f"Benchmark: {bench['receptors']} receptors, {bench['molecules']} molecules, "
        f"{bench['scheme']['outer_folds']}-fold outer x {bench['scheme']['repeats']} repeats, "
        f"{bench['scheme']['inner_folds']}-fold inner.",
        "",
        "Mean per-receptor ROC-AUC (pooled out-of-fold, averaged over repeats):",
        "",
    ]
    head = ["model", "grid", "flat CV", "nested CV", "optimism", "nested AP", "vs shipped", "win/loss", "p"]
    rows = [head]
    for r in agg:
        rows.append([
            r["label"], str(r["grid_size"]), f"{r['mean_flat_auc']:.3f}", f"{r['mean_nested_auc']:.3f}",
            f"{r['optimism']:+.3f}", f"{r['mean_nested_ap']:.3f}", f"{r['mean_delta_vs_shipped']:+.3f}",
            f"{r['beats_shipped']}/{r['loses_to_shipped']}",
            "-" if r["wilcoxon_p"] is None else f"{r['wilcoxon_p']:.3f}",
        ])
    lines += _table(rows)
    best = agg[0]
    ship = next(r for r in agg if r["family"] == "shipped")
    lines += [
        "",
        f"Best by nested AUC: {best['label']} ({best['mean_nested_auc']:.3f}); "
        f"shipped model {ship['mean_nested_auc']:.3f} "
        f"(delta {best['mean_nested_auc'] - ship['mean_nested_auc']:+.3f}).",
        f"Tuning optimism, averaged over the tuned families: "
        f"{np.mean([r['optimism'] for r in agg if r['grid_size'] > 1]):+.3f} AUC.",
    ]
    return lines


def per_receptor_table(bench: dict, families_shown: list[str]) -> list[str]:
    head = ["receptor", "n", "pos"] + families_shown
    rows = [head]
    for r in bench["per_receptor"]:
        rows.append([r["receptor"], str(r["n"]), str(r["positives"])] +
                    [f"{_find(r, f)['nested_auc']:.3f}" for f in families_shown])
    return ["Nested-CV AUC per receptor:", ""] + _table(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="four families, fewer trees")
    ap.add_argument("--jobs", type=int, default=-1)
    ap.add_argument("--reaggregate", action="store_true",
                    help="recompute the summary from the stored per-receptor results, without refitting")
    args = ap.parse_args()

    if args.reaggregate:
        bench = json.loads((PROCESSED / "model_benchmark.json").read_text())
        names = {f.name: f for f in families(False)}
        present = [names[n] for n in (r["family"] for r in bench["per_receptor"][0]["results"]) if n in names]
        bench["families"] = aggregate(bench["per_receptor"], present)
        (PROCESSED / "model_benchmark.json").write_text(json.dumps(bench, separators=(",", ":")))
        print("\n".join(report(bench)))
        return

    index = json.loads((PROCESSED / "predict_index.json").read_text())
    blob = (PROCESSED / "predict_fp.bin").read_bytes()
    bits, labels, _ = build_dataset(index, blob)
    fams = families(args.quick)

    genes = sorted(labels)
    t0 = time.time()
    done = Parallel(n_jobs=args.jobs, verbose=5)(
        delayed(evaluate_receptor)(g, bits, labels[g], fams) for g in genes
    )
    per_receptor = [d for d in done if d]

    bench = dict(
        kind="model-benchmark",
        molecules=int(bits.shape[0]),
        receptors=len(per_receptor),
        seconds=round(time.time() - t0, 1),
        scheme=dict(outer_folds=OUTER_FOLDS, inner_folds=INNER_FOLDS, repeats=N_REPEATS,
                    metric="ROC-AUC and average precision on pooled out-of-fold scores",
                    flat="hyperparameters chosen on the outer folds, best of those scores reported",
                    nested="hyperparameters chosen by inner CV within each outer training fold"),
        families=aggregate(per_receptor, fams),
        per_receptor=per_receptor,
    )
    (PROCESSED / "model_benchmark.json").write_text(json.dumps(bench, separators=(",", ":")))
    print()
    print("\n".join(report(bench)))
    print()
    print("\n".join(per_receptor_table(bench, [f.name for f in fams])))
    print(f"\nwrote {PROCESSED / 'model_benchmark.json'} ({bench['seconds']}s)")


if __name__ == "__main__":
    main()
