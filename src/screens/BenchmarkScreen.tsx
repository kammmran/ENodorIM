import { useEffect, useMemo, useState } from "react";
import { SHIPPED, familyResult, loadBenchmark } from "../data/benchmarkService";
import type { BenchmarkFamily, ModelBenchmark } from "../data/types";
import { RELIABLE_AUC } from "../model/learned";
import { usePalette } from "../ui/colors";

const f3 = (x: number) => x.toFixed(3);
/** Signed to three places; a value that rounds to zero carries no sign. */
const signed = (x: number) => (Math.abs(x) < 0.0005 ? "0.000" : `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(3)}`);

export function BenchmarkScreen() {
  const [bench, setBench] = useState<ModelBenchmark | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadBenchmark().then(setBench, (e: Error) => setError(e.message));
  }, []);

  if (error)
    return (
      <div className="prose">
        <h1>Model benchmark</h1>
        <p className="small">
          The benchmark file could not be loaded ({error}). It is written by{" "}
          <span className="mono">python -m scripts.pipeline.benchmark_models</span>, which takes about half an hour; run
          it and then <span className="mono">npm run assets</span>.
        </p>
      </div>
    );
  if (!bench) return <p className="muted">Loading benchmark…</p>;

  const ship = bench.families.find((f) => f.family === SHIPPED)!;
  const best = bench.families[0];
  const tuned = bench.families.filter((f) => f.grid_size > 1);
  const meanOptimism = tuned.reduce((s, f) => s + f.optimism, 0) / tuned.length;
  const noise = meanFoldNoise(bench);

  return (
    <div className="prose">
      <h1>Model benchmark</h1>
      <p>
        The site ships one predictor per receptor and has to say honestly how good it is. That means answering two
        different questions. <em>How good is this model?</em> is answered by cross-validation. <em>How good is the
        procedure that chose this model?</em> — the one that matters if you intend to tune anything — needs the
        hyperparameter search to happen <strong>inside</strong> the validation, which is nested cross-validation. With{" "}
        {range(bench)} molecules per receptor, the difference between the two answers is not academic.
      </p>

      <h2>How this was measured</h2>
      <ul>
        <li>
          <strong>Flat CV.</strong> {bench.scheme.flat}. This is the number a tuning loop reports about itself, and it is
          biased upwards, because the same folds chose the winner and graded it.
        </li>
        <li>
          <strong>Nested CV.</strong> {bench.scheme.nested}, so every test fold is scored by a model that never saw it —
          hyperparameter choice included. The gap between the two columns <em>is</em> the selection bias.
        </li>
        <li>
          {bench.scheme.outer_folds}-fold stratified outer folds, {bench.scheme.inner_folds}-fold inner folds, repeated{" "}
          {bench.scheme.repeats}× with different shuffles. A single fold holds as few as two positives, so predictions
          are pooled across the whole split before scoring and the figure is the mean over repeats.
        </li>
        <li>
          Fingerprint-bit filtering is refitted inside each training fold rather than once over all of a receptor's data,
          which is the one place the shipped training script is slightly optimistic.
        </li>
      </ul>

      <h2>Result</h2>
      <p>
        Across {bench.receptors} receptors and {bench.molecules} molecules,{" "}
        {best.family === SHIPPED ? (
          <>
            nothing beats the shipped fixed-hyperparameter logistic regression: it is itself the highest-scoring of the{" "}
            {bench.families.length} families under nested CV at AUC {f3(ship.mean_nested_auc)}
            {Math.abs(runnerUp(bench)?.mean_delta_vs_shipped ?? 1) < 0.0005 ? (
              <>
                , matched to three decimals by <strong>{runnerUp(bench)?.label}</strong> and ahead of the rest
              </>
            ) : (
              <>
                , with the closest rival, <strong>{runnerUp(bench)?.label}</strong>, trailing by{" "}
                {signed(runnerUp(bench)?.mean_delta_vs_shipped ?? 0)}
              </>
            )}
          </>
        ) : (
          <>
            the best family under nested CV is <strong>{best.label}</strong> at AUC {f3(best.mean_nested_auc)}, against{" "}
            {f3(ship.mean_nested_auc)} for the shipped fixed-hyperparameter logistic regression — a difference of{" "}
            {signed(best.mean_nested_auc - ship.mean_nested_auc)}
          </>
        )}
        . Tuning buys on average{" "}
        <strong>{signed(meanOptimism)} AUC</strong> of flat-CV score that does not survive nesting, and repeating the
        same evaluation with a different fold shuffle moves a single receptor's AUC by ±{noise.toFixed(3)}. Both of those
        are larger than the spread between the families.
      </p>

      <DumbbellPlot families={bench.families} />

      <table className="data">
        <thead>
          <tr>
            <th>Model family</th>
            <th className="num">Grid</th>
            <th className="num">Flat CV</th>
            <th className="num">Nested CV</th>
            <th className="num">Optimism</th>
            <th className="num">Nested AP</th>
            <th className="num">vs shipped</th>
            <th className="num">Win / loss</th>
            <th className="num">p</th>
            <th className="num">p (Holm)</th>
          </tr>
        </thead>
        <tbody>
          {bench.families.map((f) => (
            <tr key={f.family}>
              <td>
                {f.label}
                {f.note && <div className="small muted">{f.note}</div>}
              </td>
              <td className="num">{f.grid_size}</td>
              <td className="num">{f3(f.mean_flat_auc)}</td>
              <td className="num">
                <strong>{f3(f.mean_nested_auc)}</strong>
              </td>
              <td className="num">{f.grid_size > 1 ? signed(f.optimism) : "—"}</td>
              <td className="num">{f3(f.mean_nested_ap)}</td>
              <td className="num">{f.family === SHIPPED ? "—" : signed(f.mean_delta_vs_shipped)}</td>
              <td className="num">
                {f.family === SHIPPED ? "—" : `${f.beats_shipped} / ${f.loses_to_shipped}`}
              </td>
              <td className="num">{f.wilcoxon_p === null ? "—" : f.wilcoxon_p.toFixed(3)}</td>
              <td className="num">{f.wilcoxon_p_holm === null ? "—" : f.wilcoxon_p_holm.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Mean per-receptor ROC-AUC and average precision on pooled out-of-fold scores. <em>Optimism</em> is flat minus
        nested. <em>Win / loss</em> counts receptors where the family's nested AUC beats or loses to the shipped model;{" "}
        <em>p</em> is a Wilcoxon signed-rank test over the {bench.receptors} paired receptors, and{" "}
        <em>p (Holm)</em> corrects it for the {bench.families.length - 1} comparisons against the shipped model.
      </p>

      <p>
        {sigSentence(bench)}
      </p>

      <h2>What it changes</h2>
      <p>
        Nothing, for the shipped model — and that is the finding worth publishing. The configuration already on the site
        was never tuned, so it has no selection bias to lose, and no tuned family reliably beats it once their tuning is
        paid for honestly. Searching a six-point regularisation grid, swapping in random forests, extra trees, linear and
        RBF support vector machines, or naive Bayes all land inside the fold-to-fold noise.
      </p>
      <p>
        The practical reading is that per-receptor AUC is set by how much data the receptor has, not by the algorithm.
        That is why the simulation still gates on each receptor's own AUC at {RELIABLE_AUC} rather than on a headline
        number, and why the next real gain has to come from more measured pairs or from sharing information between
        receptors — a model that learns one representation across all of them — not from a bigger hyperparameter search.
      </p>

      <h2>Per receptor</h2>
      <div className="bench-scroll">
        <PerReceptorTable bench={bench} />
      </div>
      <p className="small muted">
        Nested-CV AUC, mean over {bench.scheme.repeats} shuffles. Receptors are the {bench.receptors} with at least eight
        measured molecules on each side. Values near 0.5 are chance;{" "}
        {belowChance(bench) === 1
          ? "one receptor falls"
          : `${belowChance(bench)} receptors fall`}{" "}
        below it for every family, which is what a dataset of this size looks like when there is no signal to find.
      </p>
    </div>
  );
}

/** Tested-molecule range across receptors, e.g. "70–319". */
function range(b: ModelBenchmark): string {
  const ns = b.per_receptor.map((r) => r.n);
  return `${Math.min(...ns)}–${Math.max(...ns)}`;
}

/** Best family that is not the shipped one (families arrive sorted by nested AUC). */
function runnerUp(b: ModelBenchmark) {
  return b.families.find((f) => f.family !== SHIPPED);
}

/** Mean within-receptor SD of the shipped model's nested AUC across shuffles. */
function meanFoldNoise(b: ModelBenchmark): number {
  const sds = b.per_receptor.map((r) => familyResult(r, SHIPPED)?.nested_auc_sd ?? 0);
  return sds.reduce((s, x) => s + x, 0) / Math.max(1, sds.length);
}

/** States the significance result as the corrected test actually supports it. */
function sigSentence(b: ModelBenchmark): string {
  const others = b.families.filter((f) => f.family !== SHIPPED);
  const holm = others.filter((f) => f.wilcoxon_p_holm !== null && f.wilcoxon_p_holm < 0.05);
  const raw = others.filter((f) => f.wilcoxon_p !== null && f.wilcoxon_p < 0.05);
  const better = others.filter((f) => f.mean_delta_vs_shipped > 0);
  if (holm.length === 0) {
    const nominal =
      raw.length === 0
        ? "No family even reaches an uncorrected p < 0.05"
        : `${raw.length} families reach an uncorrected p < 0.05 — ${raw
            .map((f) => f.label)
            .join(", ")} — and all of them are ${raw.every((f) => f.mean_delta_vs_shipped < 0) ? "worse" : "mixed"}, not better`;
    return `After Holm correction for the ${others.length} comparisons against the shipped model, no family differs from it significantly. ${nominal}. ${
      better.length === 0
        ? "Not one family has a positive mean difference."
        : `${better.length} family has a positive mean difference, within noise.`
    }`;
  }
  return `After Holm correction, ${holm.length} families differ from the shipped model: ${holm
    .map((f) => `${f.label} (${f.mean_delta_vs_shipped > 0 ? "better" : "worse"})`)
    .join(", ")}.`;
}

function belowChance(b: ModelBenchmark): number {
  return b.per_receptor.filter((r) => r.results.every((x) => x.nested_auc < 0.5)).length;
}

/**
 * Flat vs nested AUC per family: a paired comparison of two values across a
 * handful of categories, so a dumbbell reads better than grouped bars — the
 * length of the connector *is* the quantity of interest (the optimism).
 */
function DumbbellPlot({ families }: { families: BenchmarkFamily[] }) {
  const pal = usePalette();
  const rows = useMemo(() => [...families].sort((a, b) => b.mean_nested_auc - a.mean_nested_auc), [families]);
  const W = 560;
  const ROW = 26;
  const m = { l: 168, r: 54, t: 26, b: 30 };
  const ih = rows.length * ROW;
  const H = ih + m.t + m.b;
  const lo = Math.min(...rows.map((r) => Math.min(r.mean_nested_auc, r.mean_flat_auc)));
  const hi = Math.max(...rows.map((r) => Math.max(r.mean_nested_auc, r.mean_flat_auc)));
  const pad = Math.max(0.004, (hi - lo) * 0.18);
  const d0 = lo - pad;
  const d1 = hi + pad;
  const x = (v: number) => m.l + ((v - d0) / (d1 - d0)) * (W - m.l - m.r);
  const y = (i: number) => m.t + i * ROW + ROW / 2;
  const ticks = axisTicks(d0, d1);

  return (
    <figure className="bench-fig">
      <div className="legend-row" role="list" aria-label="Legend">
        <span role="listitem">Mean ROC-AUC per model family</span>
        <span role="listitem">{dot(pal.series1, pal.surface)} nested CV</span>
        <span role="listitem">{dot(pal.series2, pal.surface)} flat CV</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Flat versus nested cross-validated AUC for each model family">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t - 6} y2={m.t + ih} stroke={pal.line} strokeWidth={1} />
            <text x={x(t)} y={m.t + ih + 16} textAnchor="middle" fontSize={10} fill={pal.muted}>
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const xn = x(r.mean_nested_auc);
          const xf = x(r.mean_flat_auc);
          return (
            <g key={r.family}>
              <text x={m.l - 10} y={y(i) + 3.5} textAnchor="end" fontSize={11} fill={pal.ink2}>
                {r.label}
              </text>
              <line x1={Math.min(xn, xf)} x2={Math.max(xn, xf)} y1={y(i)} y2={y(i)} stroke={pal.axis} strokeWidth={2} />
              {/* flat behind, nested in front: the honest number reads first */}
              <circle cx={xf} cy={y(i)} r={4.5} fill={pal.series2} stroke={pal.surface} strokeWidth={2}>
                <title>{`${r.label} — flat CV ${f3(r.mean_flat_auc)}`}</title>
              </circle>
              <circle cx={xn} cy={y(i)} r={4.5} fill={pal.series1} stroke={pal.surface} strokeWidth={2}>
                <title>{`${r.label} — nested CV ${f3(r.mean_nested_auc)}`}</title>
              </circle>
              <text x={W - m.r + 8} y={y(i) + 3.5} fontSize={10.5} fill={pal.ink2} fontVariant="tabular-nums">
                {f3(r.mean_nested_auc)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function axisTicks(d0: number, d1: number): number[] {
  const step = d1 - d0 > 0.1 ? 0.05 : 0.02;
  const out: number[] = [];
  for (let t = Math.ceil(d0 / step) * step; t <= d1 + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

function PerReceptorTable({ bench }: { bench: ModelBenchmark }) {
  const fams = bench.families;
  const [sort, setSort] = useState<string>("n");
  const rows = useMemo(() => {
    const r = [...bench.per_receptor];
    if (sort === "n") return r.sort((a, b) => b.n - a.n);
    if (sort === "receptor") return r.sort((a, b) => a.receptor.localeCompare(b.receptor));
    return r.sort((a, b) => (familyResult(b, sort)?.nested_auc ?? 0) - (familyResult(a, sort)?.nested_auc ?? 0));
  }, [bench, sort]);

  return (
    <table className="data">
      <thead>
        <tr>
          <th>
            <button onClick={() => setSort("receptor")}>Receptor{sort === "receptor" && " ↓"}</button>
          </th>
          <th className="num">
            <button onClick={() => setSort("n")}>Tested{sort === "n" && " ↓"}</button>
          </th>
          <th className="num">Agonists</th>
          {fams.map((f) => (
            <th className="num" key={f.family}>
              <button onClick={() => setSort(f.family)} title={f.label}>
                {short(f)}
                {sort === f.family && " ↓"}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const vals = fams.map((f) => familyResult(r, f.family)?.nested_auc ?? 0);
          const top = Math.max(...vals);
          return (
            <tr key={r.receptor}>
              <td>
                <a className="mono" href={`#/receptors/${r.receptor}`}>
                  {r.receptor}
                </a>
              </td>
              <td className="num">{r.n}</td>
              <td className="num">{r.positives}</td>
              {fams.map((f, i) => (
                <td className="num" key={f.family}>
                  {vals[i] === top ? <strong>{f3(vals[i])}</strong> : f3(vals[i])}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const SHORT: Record<string, string> = {
  shipped: "shipped",
  logreg: "LR L2",
  logreg_l1: "LR L1",
  svm_linear: "SVM lin",
  svm_rbf: "SVM rbf",
  rf: "RF",
  et: "ET",
  nb: "NB",
  knn: "kNN",
};

const short = (f: BenchmarkFamily) => SHORT[f.family] ?? f.family;

/** Legend marker, matching the plot's marks (fill + 2px surface ring). */
function dot(fill: string, ring: string) {
  return (
    <svg width={11} height={11} aria-hidden="true">
      <circle cx={5.5} cy={5.5} r={4} fill={fill} stroke={ring} strokeWidth={1.5} />
    </svg>
  );
}
