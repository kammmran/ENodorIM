import { useMemo, useState } from "react";
import { useData } from "../data/load";
import type { PairRecord } from "../data/types";
import { formatConc } from "../model/activation";
import { EVIDENCE_LABEL, STATE_LABEL, evidenceTier } from "../model/evidence";
import { go } from "../state/router";
import { useStore } from "../state/store";
import { ConcentrationSlider, OdorantSelect } from "../ui/Controls";
import { Molecule } from "../ui/Molecule";
import { PerceptPanel } from "../ui/Percept";
import { DoseResponse } from "../ui/Plots";
import { CiteList, Prov } from "../ui/Refs";
import { useSimulation } from "./simulationParts";

type SortKey = "status" | "ec50" | "receptor";
const STATUS_RANK: Record<string, number> = { agonist: 0, inconclusive: 1, non_agonist: 2 };

export function OdorantExplorer({ id }: { id?: string }) {
  const data = useData();
  const storeId = useStore((s) => s.odorantId);
  const setOdorant = useStore((s) => s.setOdorant);
  const logConc = useStore((s) => s.logConc);
  const profile = useStore((s) => s.profile);
  const odorantId = id && data.odorantIndex.has(id) ? id : storeId;
  const odorant = data.odorantIndex.get(odorantId)!;
  const pairs = data.pairs.get(odorantId)?.pairs ?? [];
  const sim = useSimulation(odorantId, logConc, profile);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("status");
  const curves = pairs.filter((p) => p.status === "agonist" && p.log_ec50 !== undefined).map((p) => ({ receptor: p.receptor, ec50: 10 ** p.log_ec50! }));
  const rows = useMemo(() => {
    const r = [...pairs];
    const ec = (p: PairRecord) => p.log_ec50 ?? p.log_ec50_gt ?? 99;
    if (sort === "status") r.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || ec(a) - ec(b) || a.receptor.localeCompare(b.receptor));
    if (sort === "ec50") r.sort((a, b) => ec(a) - ec(b));
    if (sort === "receptor") r.sort((a, b) => a.receptor.localeCompare(b.receptor, undefined, { numeric: true }));
    return r;
  }, [pairs, sort]);
  const n = (s: string) => pairs.filter((p) => p.status === s).length;
  const tiers = pairs.filter((p) => p.status === "agonist").map(evidenceTier);
  return (
    <div>
      <h1>Odorant explorer</h1>
      <div className="toolbar">
        <OdorantSelect
          value={odorantId}
          onChange={(v) => {
            setOdorant(v);
            go(`/odorants/${v}`);
          }}
          id="ox-odorant"
        />
        <div style={{ minWidth: 300 }}>
          <ConcentrationSlider />
        </div>
      </div>
      <div className="explorer">
        <div style={{ minWidth: 0 }}>
          <div className="panel">
            <div className="odorant-head" style={{ gridTemplateColumns: "160px 1fr" }}>
              <div className="mol" style={{ width: 160, height: 120 }}>
                <Molecule smiles={odorant.smiles} name={odorant.name} width={200} height={150} />
              </div>
              <div>
                <h2 style={{ fontSize: "1.25rem" }}>{odorant.name}</h2>
                <dl className="kv">
                  <dt>InChIKey</dt>
                  <dd className="mono tiny">{odorant.inchikey}</dd>
                  <dt>SMILES</dt>
                  <dd className="mono tiny">{odorant.smiles}</dd>
                  <dt>PubChem</dt>
                  <dd>
                    {odorant.cid ? (
                      <a href={`https://pubchem.ncbi.nlm.nih.gov/compound/${odorant.cid}`} target="_blank" rel="noreferrer">
                        CID {odorant.cid}
                      </a>
                    ) : (
                      "–"
                    )}{" "}
                    · {odorant.formula} · {odorant.mw?.toFixed(2)} g/mol
                  </dd>
                </dl>
                {odorant.stereo_alternatives_in_m2or.length > 0 && (
                  <p className="tiny muted" style={{ marginTop: 6 }}>
                    Other stereo forms in M2OR (kept separate): {odorant.stereo_alternatives_in_m2or.map((a) => `${a.name} (${a.n_tested} ORs tested)`).join("; ")}.
                  </p>
                )}
              </div>
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              Tested on <strong>{pairs.length - n("inconclusive")}</strong> receptors: <strong>{n("agonist")}</strong> respond (
              {tiers.filter((t) => t === "dose-response").length} dose–response, {tiers.filter((t) => t === "confirmed").length} confirmed screening,{" "}
              {tiers.filter((t) => t === "single").length} single screening hits), {n("non_agonist")} do not, {n("inconclusive")} disagree.{" "}
              {data.receptors.length - pairs.length} receptors were never tested.
            </p>
          </div>
          <div className="panel">
            <div className="panel-title">
              <h2>Dose–response</h2>
              <Prov kind="measured" />
            </div>
            {curves.length ? (
              <>
                <DoseResponse curves={curves} conc={10 ** logConc} selected={selected} onSelect={setSelected} />
                <p className="tiny muted">
                  {curves.length} receptor{curves.length === 1 ? "" : "s"} with a measured EC50, drawn with a Hill coefficient of 1. Click a curve or a table row to
                  highlight it. Receptors known only from screening have no curve.
                </p>
              </>
            ) : (
              <p className="small muted">No receptor has a measured EC50 for this odorant; responses come from screening only.</p>
            )}
          </div>
          <div className="panel">
            <div className="panel-title">
              <h2>All receptors tested ({pairs.length})</h2>
              <span className="tiny muted">table view of the barcode</span>
            </div>
            <div className="table-scroll" style={{ maxHeight: 520 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>
                      <button onClick={() => setSort("receptor")}>Receptor{sort === "receptor" && " ↓"}</button>
                    </th>
                    <th>
                      <button onClick={() => setSort("status")}>Result{sort === "status" && " ↓"}</button>
                    </th>
                    <th>Evidence</th>
                    <th className="num">
                      <button onClick={() => setSort("ec50")}>EC50{sort === "ec50" && " ↓"}</button>
                    </th>
                    <th className="num">a now</th>
                    <th>Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const act = sim?.acts.find((x) => x.receptor === p.receptor);
                    const tier = evidenceTier(p);
                    return (
                      <tr key={p.receptor} style={p.receptor === selected ? { background: "var(--accent-wash)" } : undefined} onClick={() => setSelected(p.receptor)}>
                        <td>
                          <a className="mono" href={`#/receptors/${p.receptor}`}>
                            {p.receptor}
                          </a>
                        </td>
                        <td>{STATE_LABEL[p.status]}</td>
                        <td className="tiny">{tier ? EVIDENCE_LABEL[tier] : p.reason ?? "–"}</td>
                        <td className="num">
                          {p.log_ec50 !== undefined ? formatConc(10 ** p.log_ec50) : p.log_ec50_gt !== undefined ? `> ${formatConc(10 ** p.log_ec50_gt)}` : "–"}
                          {p.ec50_below_assay_range && (
                            <abbr title="Fitted below the concentration range these cell assays test — an extrapolation of the curve fit, not a measured potency.">
                              {" "}?
                            </abbr>
                          )}
                        </td>
                        <td className="num">{act && act.a > 0 ? act.a.toFixed(2) : "–"}</td>
                        <td className="tiny">
                          <CiteList dois={p.dois} max={2} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <aside className="panel">
          <h2>Percept</h2>
          {sim && <PerceptPanel odorant={odorant} sim={sim} profile={profile} />}
        </aside>
      </div>
    </div>
  );
}
