"""Generate the one-page LaTeX report from data/processed/model_benchmark.json.

Every number in the report comes out of the benchmark file, so the document
cannot drift from the run that produced it.

    .venv/bin/python -m scripts.report.benchmark_report
    latexmk -pdf -cd reports/benchmark_report.tex
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / "data" / "processed" / "model_benchmark.json"
SUMMARY = ROOT / "data" / "processed" / "prediction_summary.json"
OUT = ROOT / "reports" / "benchmark_report.tex"

AUTHOR = "Kamran Heydarov"
RECIPIENT = "Dr.~Emil Sayilov"

SHORT = {
    "shipped": r"Logistic regression, $C=0.1$ (deployed)",
    "logreg": r"Logistic regression, L2",
    "logreg_l1": r"Logistic regression, L1",
    "svm_linear": r"Support vector machine, linear",
    "svm_rbf": r"Support vector machine, RBF",
    "rf": r"Random forest",
    "et": r"Extra trees",
    "nb": r"Bernoulli naive Bayes",
    "knn": r"Tanimoto $k$-nearest neighbours",
}


def sgn(x: float, places: int = 3) -> str:
    """Signed to `places`, but a value that rounds to zero gets no sign."""
    if abs(x) < 0.5 * 10 ** -places:
        return f"{0:.{places}f}"
    return f"{'+' if x > 0 else '-'}{abs(x):.{places}f}"


def main() -> None:
    b = json.loads(BENCH.read_text())
    fams = b["families"]
    ship = next(f for f in fams if f["family"] == "shipped")
    best = fams[0]
    tuned = [f for f in fams if f["grid_size"] > 1]
    optimism = sum(f["optimism"] for f in tuned) / len(tuned)
    sds = [next(x for x in r["results"] if x["family"] == "shipped")["nested_auc_sd"] for r in b["per_receptor"]]
    noise = sum(sds) / len(sds)
    ns = [r["n"] for r in b["per_receptor"]]
    pos = [r["positives"] for r in b["per_receptor"]]
    sc = b["scheme"]

    nn = json.loads(SUMMARY.read_text())["neighbours"] if SUMMARY.exists() else None
    nfam = len(fams)
    others = [f for f in fams if f["family"] != "shipped"]
    raw_sig = [f for f in others if f["wilcoxon_p"] is not None and f["wilcoxon_p"] < 0.05]
    holm_sig = [f for f in others if f.get("wilcoxon_p_holm") is not None and f["wilcoxon_p_holm"] < 0.05]
    # Stated only as the corrected test supports it.
    if holm_sig:
        sig_claim = ("Differing from the deployed model after Holm correction: "
                     + ", ".join(f"{SHORT.get(f['family'], f['label'])} ({sgn(f['mean_delta_vs_shipped'])})"
                                 for f in holm_sig) + ".")
    else:
        sig_claim = (f"No family differs from the deployed model after Holm correction over the {len(others)} "
                     f"comparisons (Wilcoxon signed-rank, paired by receptor)")
        if raw_sig:
            direction = "worse" if all(f["mean_delta_vs_shipped"] < 0 for f in raw_sig) else "mixed"
            sig_claim += (f"; {len(raw_sig)} reach an uncorrected $p<0.05$ and all are {direction}, not better")
        sig_claim += "."
    best_name = SHORT.get(best["family"], best["label"]).replace(" (deployed)", "")
    if best["family"] == "shipped":
        rival = SHORT.get(others[0]["family"], others[0]["label"])
        if abs(others[0]["mean_delta_vs_shipped"]) < 5e-4:
            tail = f"matched to three decimals by the {rival.lower()} and ahead of the remaining {len(others) - 1}"
        else:
            tail = f"the closest rival, the {rival.lower()}, trailing by {sgn(others[0]['mean_delta_vs_shipped'])}"
        finding_i = (f"No family beats the deployed configuration under nested cross-validation: it is itself the "
                     f"highest-scoring of the {len(fams)} at AUC~{ship['mean_nested_auc']:.3f}, {tail}")
    else:
        finding_i = (f"The best family under nested cross-validation, {best_name}, reaches "
                     f"AUC~{best['mean_nested_auc']:.3f} against {ship['mean_nested_auc']:.3f} for the deployed "
                     f"untuned model ({sgn(best['mean_nested_auc'] - ship['mean_nested_auc'])})")
    majority = [f for f in others if f["beats_shipped"] > f["loses_to_shipped"]]
    maj_claim = ("no family wins on a majority of receptors" if not majority else
                 "a majority of receptors favour " + ", ".join(f["label"] for f in majority))

    rows = []
    for f in fams:
        delta = "---" if f["family"] == "shipped" else sgn(f["mean_delta_vs_shipped"])
        wl = "---" if f["family"] == "shipped" else f"{f['beats_shipped']}/{f['loses_to_shipped']}"
        opt = "---" if f["grid_size"] <= 1 else sgn(f["optimism"])
        ph = "---" if f.get("wilcoxon_p_holm") is None else f"{f['wilcoxon_p_holm']:.2f}"
        nested = f"{f['mean_nested_auc']:.3f}"
        if f is best:
            nested = f"\\textbf{{{nested}}}"
        rows.append(
            f"{SHORT.get(f['family'], f['family'])} & {f['grid_size']} & {f['mean_flat_auc']:.3f} & "
            f"{nested} & {opt} & {f['mean_nested_ap']:.3f} & {delta} & {wl} & {ph} \\\\"
        )
    table = "\n".join(rows)

    nn_line = (
        f"The deployed similarity baseline, evaluated by hold-one-out over {nn['reference_molecules']} reference "
        f"molecules, ranks a true agonist first for {nn['top1_accuracy']*100:.0f}\\% of molecules "
        f"($n={nn['top1_n']}$). "
        if nn
        else ""
    )

    tex = rf"""% Generated by scripts/report/benchmark_report.py -- do not edit by hand.
\documentclass[10pt,a4paper]{{article}}
\usepackage[margin=1.9cm]{{geometry}}
\usepackage{{booktabs}}
\usepackage{{microtype}}
\usepackage[T1]{{fontenc}}
\usepackage{{lmodern}}
\usepackage[font=small,skip=4pt]{{caption}}
\usepackage[hidelinks]{{hyperref}}
\setlength{{\parskip}}{{1pt}}
\pagestyle{{empty}}

\title{{\vspace{{-1.6cm}}\large Model selection for per-receptor odorant activity prediction:\\
cross-validation versus nested cross-validation}}
\author{{\normalsize {AUTHOR}}}
\date{{\normalsize Submitted to {RECIPIENT} \quad\textbullet\quad {date.today().isoformat()}}}

\begin{{document}}
\maketitle
\vspace{{-1.25cm}}

\paragraph{{Question.}} The ENodorIM simulator predicts, for an arbitrary molecule, which of the human odorant
receptors it activates. The predictor deployed on the site is one fixed configuration---an $L_2$-regularised
logistic regression per receptor on Morgan fingerprint bits---reported with ordinary $k$-fold cross-validation.
Two questions were conflated by that figure: \emph{{how good is this model}}, and \emph{{how good is the procedure
that chooses a model}}. The second is the one that matters before tuning, and it requires the hyperparameter
search to be nested inside the validation. This report answers both on identical folds.

\paragraph{{Data.}} Human single-compound dose--response and screening experiments from M2OR, reduced to one
consensus label per receptor--molecule pair, giving {b['molecules']} molecules described by 2048-bit Morgan
fingerprints (radius 2, chirality retained, because measured enantiomers activate receptors differently).
{b['receptors']} receptors have at least eight molecules on each side and are modelled; each has
{min(ns)}--{max(ns)} tested molecules and {min(pos)}--{max(pos)} agonists, so every per-receptor data set is
small and imbalanced.

\paragraph{{Protocol.}} {sc['outer_folds']}-fold stratified outer folds, repeated {sc['repeats']}$\times$ with
different shuffles; out-of-fold scores are pooled across a split before scoring, since a single fold can hold two
positives. \emph{{Flat}}: hyperparameters chosen on the outer folds and the winner's own score reported---what a
tuning loop reports about itself. \emph{{Nested}}: hyperparameters chosen by {sc['inner_folds']}-fold inner
cross-validation within each outer training fold, so selection is never graded on data it saw. Fingerprint-bit
filtering is refitted per training fold. The difference between the two columns is the selection bias.

\begin{{table}}[h]
\centering\small
\setlength{{\tabcolsep}}{{4.5pt}}
\begin{{tabular}}{{lrrrrrrrr}}
\toprule
Model family & Grid & Flat & Nested & Optimism & Nested AP & $\Delta$ vs dep. & W/L & $p_{{\mathrm{{Holm}}}}$ \\
\midrule
{table}
\bottomrule
\end{{tabular}}
\caption*{{\small Mean per-receptor ROC-AUC over {b['receptors']} receptors. \emph{{Grid}}: hyperparameter settings
searched. \emph{{Optimism}}: flat minus nested. \emph{{W/L}}: receptors where the family's nested AUC beats or
loses to the deployed model. {sig_claim}}}
\end{{table}}

\vspace{{-0.45cm}}
\paragraph{{Findings.}} (i) {finding_i}; {maj_claim}.
(ii) Hyperparameter search inflates the flat-CV figure by {sgn(optimism)} AUC on average---larger than the entire
spread between the {nfam} families---so a tuned model reported by flat cross-validation would appear to beat the
deployed one while being no better. (iii) Repeating the identical evaluation with a different fold shuffle moves a
single receptor's AUC by $\pm${noise:.3f}, again comparable to the between-model differences. {nn_line}

\paragraph{{Conclusion.}} On this data set model choice is not the binding constraint: {nfam} families spanning
linear, kernel, ensemble and instance-based learning fall within the noise of one another, and the untuned
deployed configuration is retained---it carries no selection bias to lose. Per-receptor performance is governed by
the amount of measured data, not the algorithm, which is why the simulator reports each receptor's own
cross-validated AUC and uses a learned score only above AUC~0.70 rather than quoting a single headline number.
The next gain must come from more measured pairs, or from a model that shares one representation across receptors
(a graph encoder with a receptor-sequence embedding), rather than from a wider hyperparameter search.

\paragraph{{Reproducibility.}} \texttt{{python -m scripts.pipeline.benchmark\_models}} ($\approx${b['seconds']/60:.0f}~min)
writes \texttt{{model\_benchmark.json}}, from which this report and the site's benchmark page are generated.
Data: M2OR, \textsc{{doi:}}10.1093/nar/gkad886. Results: \url{{https://kammmran.github.io/ENodorIM/\#/benchmark}}.

\end{{document}}
"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(tex)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
