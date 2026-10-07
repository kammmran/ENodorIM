import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../data/load";
import {
  DRAWN_ID,
  loadPredictBundle,
  predict,
  type PredictBundle,
  type Prediction,
} from "../data/predictService";
import { formatConc } from "../model/activation";
import { MIN_SUPPORT, SCORE_THRESHOLD } from "../model/predict";
import { RELIABLE_AUC } from "../model/learned";
import { go } from "../state/router";
import { useStore } from "../state/store";
import { usePalette } from "../ui/colors";
import { Molecule } from "../ui/Molecule";
import { ReceptorGrid, GridLegend } from "../ui/ReceptorGrid";
import { Cite, Prov } from "../ui/Refs";
import { ExportButtons } from "../ui/ExportButtons";
import { loadRDKit, parseMolecule } from "../ui/rdkit";
import { Sketcher } from "../ui/Sketcher";

const EXAMPLES: { name: string; smiles: string; why: string }[] = [
  { name: "Eugenol", smiles: "COc1cc(CC=C)ccc1O", why: "clove; close to guaiacol and isoeugenol" },
  { name: "Lilial", smiles: "CC(Cc1ccc(C(C)(C)C)cc1)C=O", why: "muguet aldehyde, like bourgeonal" },
  { name: "Linalool", smiles: "CC(C)=CCCC(C)(O)C=C", why: "terpene alcohol, lavender" },
  { name: "2-Phenylethanol", smiles: "OCCc1ccccc1", why: "rose" },
  { name: "Hexanal", smiles: "CCCCCC=O", why: "green, grassy aldehyde" },
];

type Status = { kind: "idle" } | { kind: "loading"; what: string } | { kind: "error"; message: string } | { kind: "ready" };

export function DrawScreen() {
  const data = useData();
  const pal = usePalette();
  const setOdorant = useStore((s) => s.setOdorant);
  const setDrawn = useStore((s) => s.setDrawn);
  const drawn = useStore((s) => s.drawn);

  const [input, setInput] = useState(drawn?.smiles ?? "");
  const [name, setName] = useState(drawn?.name ?? "Drawn molecule");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [prediction, setPrediction] = useState<Prediction | null>(drawn?.prediction ?? null);
  const [mode, setMode] = useState<"smiles" | "draw">("smiles");
  const bundleRef = useRef<PredictBundle | null>(null);

  const run = useCallback(async (smiles: string, label: string) => {
    const trimmed = smiles.trim();
    if (!trimmed) {
      setPrediction(null);
      setStatus({ kind: "idle" });
      return;
    }
    try {
      setStatus({ kind: "loading", what: bundleRef.current ? "Predicting" : "Loading the reference set (about 2 MB)" });
      const [rd, bundle] = await Promise.all([loadRDKit(), bundleRef.current ? Promise.resolve(bundleRef.current) : loadPredictBundle()]);
      bundleRef.current = bundle;
      const parsed = parseMolecule(rd, trimmed, bundle.index.fingerprint.js_options);
      if (!parsed) {
        setPrediction(null);
        setStatus({ kind: "error", message: "That is not a structure RDKit can read. Check the SMILES, or draw it instead." });
        return;
      }
      const p = predict(bundle, parsed.smiles, parsed.fingerprint, parsed.inchikey);
      setPrediction(p);
      setDrawn({ name: label, smiles: parsed.smiles, prediction: p });
      setStatus({ kind: "ready" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [setDrawn]);

  // Predict as the user types, once they pause.
  useEffect(() => {
    if (mode !== "smiles") return;
    const t = setTimeout(() => void run(input, name), 450);
    return () => clearTimeout(t);
  }, [input, name, mode, run]);

  const simulate = () => {
    setOdorant(DRAWN_ID);
    useStore.getState().setTime(0);
    go("/simulate");
  };

  const predicted = useMemo(
    () => (prediction ? prediction.receptors.filter((r) => r.score >= SCORE_THRESHOLD) : []),
    [prediction],
  );
  const gridValues = useMemo(() => {
    const byReceptor = new Map(prediction?.receptors.map((r) => [r.receptor, r]) ?? []);
    return data.receptors.map((rec) => {
      const p = byReceptor.get(rec.gene);
      if (!p || p.score < SCORE_THRESHOLD) {
        return {
          mode: "activation" as const,
          act: { receptor: rec.gene, a: 0, kind: "none" as const, state: p ? ("non_agonist" as const) : ("untested" as const), evidence: null, provenance: "predicted" as const },
        };
      }
      return {
        mode: "activation" as const,
        act: { receptor: rec.gene, a: p.score, kind: "quantitative" as const, state: "agonist" as const, evidence: "dose-response" as const, provenance: "predicted" as const },
      };
    });
  }, [prediction, data.receptors]);

  const ev = prediction ? bundleRef.current?.index.evaluation : undefined;

  return (
    <div>
      <h1>Draw a molecule</h1>
      <p className="muted" style={{ maxWidth: "80ch" }}>
        Sketch or paste any structure and the site predicts which human odorant receptors it may activate, and how it may
        smell, from the molecules that <em>have</em> been measured. Everything here is <Prov kind="predicted" /> — a
        transparent nearest-neighbour baseline, not a measurement. Each prediction lists the known molecules it came from,
        so you can judge it yourself.
      </p>

      <div className="explorer">
        <div style={{ minWidth: 0 }}>
          <div className="panel">
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <span className="label">Input</span>
                <div className="seg" role="group" aria-label="Input mode">
                  <button type="button" aria-pressed={mode === "smiles"} onClick={() => setMode("smiles")}>
                    Paste SMILES
                  </button>
                  <button type="button" aria-pressed={mode === "draw"} onClick={() => setMode("draw")}>
                    Draw
                  </button>
                </div>
              </div>
              <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label htmlFor="mol-name">Name (yours, for display)</label>
                <input id="mol-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>

            {mode === "smiles" ? (
              <div className="field">
                <label htmlFor="smiles">SMILES</label>
                <input
                  id="smiles"
                  type="text"
                  className="mono"
                  placeholder="COc1cc(CC=C)ccc1O"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <span className="hint">
                  Examples:{" "}
                  {EXAMPLES.map((x, i) => (
                    <span key={x.name}>
                      {i > 0 && " · "}
                      <button
                        className="linklike"
                        onClick={() => {
                          setInput(x.smiles);
                          setName(x.name);
                        }}
                        title={x.why}
                      >
                        {x.name}
                      </button>
                    </span>
                  ))}
                </span>
              </div>
            ) : (
              <Sketcher
                smiles={input}
                onChange={(smi) => {
                  setInput(smi);
                  void run(smi, name);
                }}
              />
            )}

            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 14, alignItems: "center", marginTop: 12 }}>
              <div style={{ height: 130 }}>
                {input.trim() ? <Molecule smiles={input} name={name} width={220} height={160} /> : <span className="tiny muted">No structure yet.</span>}
              </div>
              <div>
                {status.kind === "loading" && <p className="small muted">{status.what}…</p>}
                {status.kind === "error" && <p className="small" style={{ color: "var(--accent)" }}>{status.message}</p>}
                {prediction && status.kind === "ready" && (
                  <>
                    <p className="small" style={{ margin: 0 }}>
                      <strong>{predicted.length}</strong> receptor{predicted.length === 1 ? "" : "s"} predicted to respond ·{" "}
                      {prediction.receptorNeighbours.length} similar measured molecules used ·{" "}
                      {prediction.descriptors.length} odor words predicted
                    </p>
                    <p className="ids" style={{ marginTop: 4 }}>
                      {prediction.smiles}
                      {prediction.inchikey && <> · {prediction.inchikey}</>}
                    </p>
                    {prediction.knownAs && (
                      <p className="note accent small" style={{ marginTop: 8 }}>
                        This molecule is already in the measured set as <strong>{prediction.knownAs.name}</strong>. The
                        prediction below excludes its own measurements, so it is an honest out-of-sample test — compare it
                        with the real data on the{" "}
                        <a href="#/odorants">odorant explorer</a>.
                      </p>
                    )}
                    <div className="run-bar" style={{ marginTop: 10 }}>
                      <button className="btn btn-primary" onClick={simulate} disabled={!predicted.length}>
                        Run the simulation with this molecule
                      </button>
                    </div>
                    {!predicted.length && (
                      <p className="tiny muted" style={{ marginTop: 6 }}>
                        No receptor passed the evidence threshold, so there is nothing to simulate. That usually means no
                        measured molecule is similar enough — try a structure closer to a common fragrance material.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {prediction && (
            <>
              <div className="panel">
                <div className="panel-title">
                  <h2>Predicted receptor pattern</h2>
                  <Prov kind="predicted" />
                </div>
                <ReceptorGrid
                  receptors={data.receptors}
                  values={gridValues}
                  columns={36}
                  cell={14}
                  onSelect={(g) => go(`/receptors/${g}`)}
                  label={`Predicted receptor pattern: ${predicted.length} of ${data.receptors.length} receptors predicted to respond.`}
                />
                <ExportButtons
                  acts={gridValues.map((v) => v.act)}
                  meta={{
                    stimulus: name || "Drawn molecule",
                    kind: "drawn molecule",
                    provenance: "predicted",
                    concentration: 1e-4,
                    inchikey: prediction.inchikey,
                    smiles: prediction.smiles,
                  }}
                />
                <div style={{ marginTop: 8 }}>
                  <GridLegend compact />
                  <p className="tiny muted" style={{ marginTop: 6 }}>
                    Colour is the prediction score, not an activation measured at a concentration. "Tested, no response"
                    here means similar molecules were tested on that receptor and mostly did not respond.
                  </p>
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <h2>Receptors, ranked by the evidence</h2>
                  <span className="tiny muted">score = share of similar, tested molecules that respond</span>
                </div>
                <div className="table-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Receptor</th>
                        <th className="num" title="Similarity-weighted share of similar, tested molecules that respond">
                          Neighbours
                        </th>
                        <th className="num" title="Per-receptor logistic regression trained on M2OR">Model</th>
                        <th className="num" title="Cross-validated ROC-AUC of that receptor's model">Model AUC</th>
                        <th className="num">Predicted EC50</th>
                        <th>Based on</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prediction.receptors.slice(0, 25).map((r) => {
                        const l = prediction.learnedByReceptor.get(r.receptor);
                        return (
                        <tr key={r.receptor} style={r.score >= SCORE_THRESHOLD ? undefined : { opacity: 0.55 }}>
                          <td>
                            <a className="mono" href={`#/receptors/${r.receptor}`}>
                              {r.receptor}
                            </a>
                          </td>
                          <td className="num">
                            <span style={{ color: r.score >= SCORE_THRESHOLD ? pal.ink : pal.ink2 }}>{r.score.toFixed(2)}</span>
                          </td>
                          <td className="num">
                            {l ? (
                              <span style={{ color: l.reliable ? pal.ink : pal.ink2 }}>{l.probability.toFixed(2)}</span>
                            ) : (
                              <span className="muted">–</span>
                            )}
                          </td>
                          <td className="num tiny">
                            {l ? (
                              <span className={l.reliable ? "" : "muted"} title={l.reliable ? "usable" : "not reliable for this receptor"}>
                                {l.auc.toFixed(2)}
                                {!l.reliable && " ?"}
                              </span>
                            ) : (
                              <span className="muted">no model</span>
                            )}
                          </td>
                          <td className="num">{r.logEc50 !== null ? formatConc(10 ** r.logEc50) : "–"}</td>
                          <td className="tiny">
                            {r.for.slice(0, 3).map((f, i) => (
                              <span key={f.inchikey}>
                                {i > 0 && ", "}
                                {f.name} <span className="muted">({f.similarity.toFixed(2)})</span>
                              </span>
                            ))}
                            {r.against.length > 0 && (
                              <span className="muted">
                                {r.for.length ? " · " : ""}
                                {r.against.length} similar molecule{r.against.length === 1 ? "" : "s"} tested without a response
                              </span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Greyed rows fall below the neighbour score threshold of {SCORE_THRESHOLD}. A receptor is listed only when
                  similar molecules carrying at least {MIN_SUPPORT.toFixed(1)} summed similarity were actually tested on it.
                  “Model” is a logistic regression trained on that receptor's own measured molecules; its AUC is marked “?”
                  below {RELIABLE_AUC}, where it is no better than guessing and should be ignored.
                </p>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <h2>Nearest measured molecules</h2>
                  <span className="tiny muted">Tanimoto similarity on 2048-bit Morgan fingerprints (chirality included)</span>
                </div>
                <div className="odorant-grid">
                  {prediction.receptorNeighbours.slice(0, 8).map((n) => (
                    <div key={n.molecule.inchikey} className="odorant-card" style={{ cursor: "default", minHeight: 170 }}>
                      <div className="mol" style={{ height: 76 }}>
                        <Molecule smiles={n.molecule.smiles} name={n.molecule.name} width={160} height={100} />
                      </div>
                      <h3 style={{ fontSize: "0.8125rem" }}>{n.molecule.name}</h3>
                      <div className="data">
                        {n.similarity.toFixed(2)} similar · {n.molecule.agonists?.length ?? 0}/{n.molecule.n_tested} respond
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <aside>
          {prediction && (
            <div className="panel">
              <div className="panel-title">
                <h2>Predicted smell</h2>
                <Prov kind="predicted" />
              </div>
              {prediction.descriptors.length ? (
                <>
                  <div className="bars">
                    {prediction.descriptors.map((d) => (
                      <div className="row" key={d.label}>
                        <span>{d.label}</span>
                        <span className="bar">
                          <span style={{ width: `${Math.min(100, d.weight * 100)}%` }} />
                        </span>
                        <span className="num">{Math.round(d.weight * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  <p className="source-line" style={{ marginTop: 8 }}>
                    Similarity-weighted share of the {prediction.descriptorNeighbours.length} most similar molecules in the
                    Leffingwell set carrying each word. Source data CC BY-NC.
                  </p>
                  <details className="more">
                    <summary>Molecules behind these words</summary>
                    <ul className="small body">
                      {prediction.descriptorNeighbours.slice(0, 8).map((n) => (
                        <li key={n.molecule.inchikey}>
                          <strong>{n.molecule.name}</strong> <span className="muted">({n.similarity.toFixed(2)})</span> —{" "}
                          {(n.molecule.labels ?? []).join(", ")}
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              ) : (
                <p className="small muted">No molecule in the descriptor set is similar enough to suggest odor words.</p>
              )}
            </div>
          )}

          <div className="panel">
            <h2>How good is this?</h2>
            {ev ? (
              <>
                <p className="small">
                  Measured by holding out each of the {ev.molecules_scored} reference molecules that have enough ground
                  truth, predicting it from the others, and scoring only the receptors it was really tested on:
                </p>
                <dl className="kv">
                  <dt>Top prediction correct</dt>
                  <dd>
                    <strong>{Math.round(ev.top1_accuracy * 100)}%</strong> of molecules (n = {ev.top1_n})
                  </dd>
                  <dt>Precision</dt>
                  <dd>{ev.precision.toFixed(2)} — about half of predicted receptors are right</dd>
                  <dt>Recall</dt>
                  <dd>{ev.recall.toFixed(2)} — it finds a small share of the receptors really there</dd>
                </dl>
                <p className="tiny muted">
                  Read the ranking, not the absolute set: the top of the list is usually meaningful, and low recall is
                  expected because the reference molecules were each tested on only a handful of receptors (median{" "}
                  {4}), while the screens that define "truth" tested hundreds.
                </p>
              </>
            ) : (
              <p className="small muted">Enter a molecule to load the reference set and its evaluation.</p>
            )}
            {bundleRef.current?.model && (
              <>
                <hr />
                <h3>Two methods, compared</h3>
                <p className="small">
                  The site ships both a similarity baseline and a learned model, cross-validated on the{" "}
                  <strong>same folds</strong> for {bundleRef.current.model.evaluation.receptors} receptors with enough data:
                </p>
                <dl className="kv">
                  <dt>Learned model</dt>
                  <dd>mean ROC-AUC {bundleRef.current.model.evaluation.mean_model_auc.toFixed(3)}</dd>
                  <dt>Nearest neighbours</dt>
                  <dd>mean ROC-AUC {bundleRef.current.model.evaluation.mean_knn_auc.toFixed(3)}</dd>
                  <dt>Model better on</dt>
                  <dd>
                    {bundleRef.current.model.evaluation.model_better} of {bundleRef.current.model.evaluation.receptors} receptors
                  </dd>
                </dl>
                <p className="tiny muted">
                  The learned model is only marginally ahead on average, and several model families (random forest, SVM,
                  stronger and weaker regularisation) all landed within 0.01 AUC of each other. On this dataset the limit is
                  the data, not the algorithm. What does vary is the receptor: models range from near-perfect to no better
                  than chance, so each prediction carries its own AUC.
                </p>
              </>
            )}
            <hr />
            <h3>Method</h3>
            <p className="small">
              Morgan fingerprints (radius 2, 2048 bits, chirality included) compared by Tanimoto similarity against{" "}
              654 measured molecules from M2OR (<Cite doi="10.1093/nar/gkad886" />) and
              3,522 molecules with expert odor labels. A receptor's score is the similarity-weighted share of similar
              molecules that respond, among those actually tested on it.
            </p>
            <p className="small muted">
              The planned next step is a learned model — a graph neural network with a protein language model (
              <a href="https://openreview.net/forum?id=q9VherQJd8_" target="_blank" rel="noreferrer">
                Hladiš et al. 2023
              </a>) for receptors, and OpenPOM for odor
              descriptors — which would replace this baseline behind the same interface.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
