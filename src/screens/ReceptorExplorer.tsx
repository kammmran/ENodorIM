import { useMemo, useState } from "react";
import { useData } from "../data/load";
import type { Receptor } from "../data/types";
import { formatConc, pairActivation } from "../model/activation";
import { EVIDENCE_LABEL, QUALITY_LABEL, STATE_LABEL, dataState, evidenceTier } from "../model/evidence";
import { go } from "../state/router";
import { useStore } from "../state/store";
import { usePalette } from "../ui/colors";
import { ConcentrationSlider, OdorantSelect, Seg } from "../ui/Controls";
import { ReceptorGrid, GridLegend, type CellValue } from "../ui/ReceptorGrid";
import { Cite, CiteList, Prov } from "../ui/Refs";
import { StructureViewer, residueName } from "../ui/StructureViewer";
import { useSimulation } from "./simulationParts";

const CONSENSUS_FOR = (r: Receptor): string[] => {
  if (r.family === 51 || r.family === 52 || r.family === 56) return r.family === 52 ? ["8HTI", "8UXV"] : ["8UXV"];
  if (r.family === 1) return ["8UXY"];
  if (r.family === 2) return ["8UY0"];
  if (r.family === 4) return ["8UYQ"];
  return [];
};

export function ReceptorExplorer({ gene }: { gene?: string }) {
  const data = useData();
  const odorantId = useStore((s) => s.odorantId);
  const setOdorant = useStore((s) => s.setOdorant);
  const logConc = useStore((s) => s.logConc);
  const profile = useStore((s) => s.profile);
  const [mode, setMode] = useState<"odorant" | "coverage">("odorant");
  const [query, setQuery] = useState("");
  const sim = useSimulation(odorantId, logConc, profile);
  const values: CellValue[] = useMemo(
    () =>
      mode === "coverage"
        ? data.receptors.map((r) => ({ mode: "coverage" as const, nAgonists: r.n_agonists, nTested: r.n_tested }))
        : (sim?.acts ?? []).map((act) => ({ mode: "activation" as const, act })),
    [mode, sim, data.receptors],
  );
  const q = query.trim().toUpperCase();
  const matches = q ? data.receptors.filter((r) => r.gene.includes(q)).map((r) => r.gene) : [];
  const selected = gene && data.receptorIndex.has(gene) ? gene : null;
  const counts = useMemo(() => {
    const c = { agonist: 0, non_agonist: 0, inconclusive: 0, untested: 0 };
    sim?.acts.forEach((x) => c[x.state]++);
    return c;
  }, [sim]);
  return (
    <div className="explorer">
      <div style={{ minWidth: 0 }}>
        <h1>Receptor explorer</h1>
        <p className="muted" style={{ maxWidth: "75ch" }}>
          All {data.receptors.length} human odorant receptor names in the data, ordered by class and family (HGNC/HORDE nomenclature). Pick an
          odorant to see which receptors respond, which were tested without a response, and which were never tested — no data is not the
          same as no response.
        </p>
        <div className="toolbar">
          <div className="field">
            <span className="label">Colour by</span>
            <Seg
              label="Colour by"
              value={mode}
              options={[
                { value: "odorant", label: "Response to an odorant" },
                { value: "coverage", label: "Known agonists (all molecules)" },
              ]}
              onChange={setMode}
            />
          </div>
          {mode === "odorant" && <OdorantSelect value={odorantId} onChange={setOdorant} id="rx-odorant" />}
          <div className="field">
            <label htmlFor="rx-search">Find a receptor</label>
            <input
              id="rx-search"
              type="search"
              placeholder="e.g. OR51E2"
              value={query}
              list="rx-genes"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) go(`/receptors/${matches.includes(q) ? q : matches[0]}`);
              }}
            />
            <datalist id="rx-genes">
              {data.receptors.map((r) => (
                <option key={r.gene} value={r.gene} />
              ))}
            </datalist>
          </div>
        </div>
        {mode === "odorant" && (
          <div style={{ maxWidth: 520 }}>
            <ConcentrationSlider />
          </div>
        )}
        <div className="panel">
          <ReceptorGrid
            receptors={data.receptors}
            values={values}
            columns={36}
            cell={14}
            selected={selected}
            highlight={new Set(matches)}
            onSelect={(g) => go(`/receptors/${g}`)}
            label={
              mode === "coverage"
                ? "Human odorant receptors coloured by number of known agonists in M2OR."
                : `Human odorant receptors coloured by response to ${data.odorantIndex.get(odorantId)?.name}: ${counts.agonist} respond, ${counts.non_agonist} tested without response, ${counts.inconclusive} disagree, ${counts.untested} not tested.`
            }
          />
          <div style={{ marginTop: 10 }}>
            {mode === "odorant" ? (
              <>
                <GridLegend />
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  {counts.agonist} respond · {counts.non_agonist} tested, no response · {counts.inconclusive} results disagree · {counts.untested} not tested
                </p>
              </>
            ) : (
              <p className="tiny muted">Darker = more known agonists (reference allele, any molecule). Outline = tested, no agonist found. Dot = no data.</p>
            )}
          </div>
        </div>
      </div>
      <aside>{selected ? <ReceptorCard gene={selected} /> : <ReceptorHint />}</aside>
    </div>
  );
}

function ReceptorHint() {
  return (
    <div className="panel">
      <h2>Select a receptor</h2>
      <p className="small muted">Click a cell, or try one of these:</p>
      <ul className="small">
        <li>
          <a href="#/receptors/OR51E2">OR51E2</a> — experimental structure with propionate (PDB 8F76)
        </li>
        <li>
          <a href="#/receptors/OR7D4">OR7D4</a> — androstenone; genotype changes perception
        </li>
        <li>
          <a href="#/receptors/OR2W1">OR2W1</a> and <a href="#/receptors/OR1A1">OR1A1</a> — broadly tuned
        </li>
        <li>
          <a href="#/receptors/OR2J3">OR2J3</a> — cis-3-hexen-1-ol; haplotypes differ
        </li>
      </ul>
    </div>
  );
}

function ReceptorCard({ gene }: { gene: string }) {
  const data = useData();
  const pal = usePalette();
  const odorantId = useStore((s) => s.odorantId);
  const logConc = useStore((s) => s.logConc);
  const r = data.receptorIndex.get(gene)!;
  const odorant = data.odorantIndex.get(odorantId)!;
  const pair = data.pairs.get(odorantId)?.pairs.find((p) => p.receptor === gene);
  const variantPairs = data.pairs.get(odorantId)?.variant_pairs.filter((p) => p.receptor === gene) ?? [];
  const pdb = r.structure?.source === "pdb" ? data.structures.find((s) => s.pdb === r.structure!.id) : undefined;
  const consensus = CONSENSUS_FOR(r)
    .map((id) => data.structures.find((s) => s.pdb === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const cases = data.genotypeCases.filter((c) => c.receptor === gene);
  const caseHere = cases.find((c) => c.odorant === odorantId);
  const [showAll, setShowAll] = useState(false);
  const agonists = showAll ? r.agonists : r.agonists.slice(0, 15);
  const act = pair ? pairActivation(pair, 10 ** logConc) : null;
  const colors = { receptor: pal.ramp(0.7), other: pal.axis, ligand: pal.accent, residue: pal.ink2, bg: pal.surface };
  return (
    <div className="panel">
      <div className="panel-title">
        <h2 className="mono">{r.gene}</h2>
        <span className="tiny muted">
          Class {r.cls ?? "–"} · family {r.family ?? "–"} · subfamily {r.subfamily ?? "–"}
        </span>
      </div>
      <dl className="kv">
        <dt>Gene</dt>
        <dd>
          {r.locus_type === "gene with protein product" ? "protein-coding" : r.locus_type ?? "not in HGNC OR list"}
          {r.location && ` · ${r.location}`}
        </dd>
        <dt>UniProt</dt>
        <dd>{r.uniprot ? <a href={`https://www.uniprot.org/uniprotkb/${r.uniprot}/entry`} target="_blank" rel="noreferrer" className="mono">{r.uniprot}</a> : "–"}{r.length && ` · ${r.length} aa`}</dd>
        <dt>Data</dt>
        <dd>
          {r.n_tested} molecules tested · {r.n_agonists} agonists{r.n_inconclusive ? ` · ${r.n_inconclusive} inconclusive` : ""} (reference allele)
        </dd>
        {r.m2or_names.length > 1 && (
          <>
            <dt>Names in M2OR</dt>
            <dd className="mono tiny">{r.m2or_names.join(", ")}</dd>
          </>
        )}
      </dl>
      <div className="links" style={{ marginTop: 8 }}>
        <a href="https://m2or.chemsensim.fr/" target="_blank" rel="noreferrer">M2OR</a>
        {r.gpcrdb && <a href={`https://gpcrdb.org/protein/${r.gpcrdb}/`} target="_blank" rel="noreferrer">GPCRdb</a>}
        {r.uniprot && <a href={`https://www.uniprot.org/uniprotkb/${r.uniprot}/entry`} target="_blank" rel="noreferrer">UniProt</a>}
        {r.hgnc_id && <a href={`https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${r.hgnc_id}`} target="_blank" rel="noreferrer">HGNC</a>}
        {r.uniprot && <a href={`https://alphafold.ebi.ac.uk/entry/${r.uniprot}`} target="_blank" rel="noreferrer">AlphaFold DB</a>}
      </div>

      <div className="card-section">
        <h3>
          With {odorant.name} <Prov kind="measured" />
        </h3>
        {pair ? (
          <div className="small">
            <div className="state-chip">
              <strong>{STATE_LABEL[dataState(pair)]}</strong>
              <span className="tag">
                {pair.status === "agonist" && evidenceTier(pair) ? EVIDENCE_LABEL[evidenceTier(pair)!] : QUALITY_LABEL[pair.quality]}
              </span>
            </div>
            {pair.reason && <p className="muted">M2OR would discard this pair: {pair.reason}.</p>}
            {act && act.kind !== "none" && (
              <p>
                Activation at {formatConc(10 ** logConc)}: <strong>{act.a.toFixed(2)}</strong>
                {act.kind === "qualitative" && " (qualitative)"}
              </p>
            )}
            {pair.ec50_values?.length ? (
              <ul>
                {pair.ec50_values.map((v, i) => (
                  <li key={i}>
                    EC50 {formatConc(10 ** v.log_ec50)}
                    {v.rounded && " (whole-log value, ±0.5 log)"}
                    {v.log_ec50 < -9 && " — fitted below the concentration range these assays test; treat with caution"} —{" "}
                    <Cite doi={v.doi} />
                  </li>
                ))}
                {pair.ec50_values.length > 1 && <li className="muted">Median used: {formatConc(10 ** pair.log_ec50!)}</li>}
              </ul>
            ) : null}
            {pair.log_ec50_gt !== undefined && <p>EC50 above {formatConc(10 ** pair.log_ec50_gt)} (highest concentration tested).</p>}
            {pair.min_resp_um !== undefined && pair.log_ec50 === undefined && <p>Lowest concentration with a response: {formatConc(pair.min_resp_um * 1e-6)}.</p>}
            <p className="tiny muted">
              {pair.n_experiments} experiment{pair.n_experiments === 1 ? "" : "s"} ({pair.n_positive} positive) · {pair.assays.join("; ")} · <CiteList dois={pair.dois} max={4} />
            </p>
          </div>
        ) : (
          <p className="small muted">Not tested with {odorant.name} in M2OR. No data is not the same as no response.</p>
        )}
        {caseHere && (
          <div className="small" style={{ marginTop: pair ? 10 : 6 }}>
            <div className="state-chip">
              <strong>Alleles measured for {odorant.name}</strong>
              {caseHere.curation && <span className="tag">curated from the paper</span>}
            </div>
            <table className="data" style={{ marginTop: 4 }}>
              <thead>
                <tr>
                  <th>Allele</th>
                  <th>Result</th>
                  <th className="num">EC50</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(caseHere.alleles).map(([label, a]) => (
                  <tr key={label}>
                    <td>
                      {label}
                      {a.haplotype && <div className="mono tiny muted">{a.haplotype}</div>}
                    </td>
                    <td>{a.status === "agonist" ? "Responds" : a.status === "non_agonist" ? "No response" : "Not tested"}</td>
                    <td className="num">{a.log_ec50 !== null ? formatConc(10 ** a.log_ec50) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted">
              {caseHere.curation ?? "Alleles compared within one paper."} <Cite doi={caseHere.doi} />
            </p>
          </div>
        )}
        {variantPairs.length > 0 && (
          <details className="more">
            <summary>Variant alleles tested with {odorant.name} ({variantPairs.length})</summary>
            <table className="data body">
              <thead>
                <tr>
                  <th>Allele</th>
                  <th>Result</th>
                  <th className="num">EC50</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {variantPairs.map((v) => (
                  <tr key={v.allele}>
                    <td className="mono tiny">{v.allele}</td>
                    <td>{STATE_LABEL[dataState(v)]}</td>
                    <td className="num">{v.log_ec50 !== undefined ? formatConc(10 ** v.log_ec50) : v.log_ec50_gt !== undefined ? `> ${formatConc(10 ** v.log_ec50_gt)}` : "–"}</td>
                    <td className="tiny">
                      <CiteList dois={v.dois} max={1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="card-section">
        <h3>
          Structure {pdb ? <Prov kind="measured" /> : r.structure ? <Prov kind="predicted" /> : null}
        </h3>
        {pdb && (
          <>
            <StructureViewer
              spec={{
                kind: "pdb",
                url: `${new URL(import.meta.env.BASE_URL, window.location.href).href}structures/${pdb.pdb}.cif`,
                receptorChain: "A",
                otherChains: ["B", "C", "D", "E"],
                ligandComp: pdb.ligand_id ?? "",
                contacts: pdb.contacts ?? [],
              }}
              label={`Cryo-EM structure ${pdb.pdb} of ${pdb.receptor} with ${pdb.ligand}`}
              colors={colors}
            />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Experimental structure <a href={`https://www.rcsb.org/structure/${pdb.pdb}`} target="_blank" rel="noreferrer">{pdb.pdb}</a>, {pdb.method}{" "}
              {pdb.resolution} Å, with {pdb.ligand} in the pocket and the G protein (grey). <Cite doi={pdb.doi} />
            </p>
            {pdb.contacts && (
              <table className="data">
                <thead>
                  <tr>
                    <th>Residue</th>
                    <th>GPCRdb no.</th>
                    <th>Segment</th>
                    <th className="num">Distance</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {pdb.contacts.map((c) => (
                    <tr key={`${c.chain}${c.number}`}>
                      <td className="mono">{residueName(c)}</td>
                      <td className="mono tiny">{c.generic_number ?? "–"}</td>
                      <td>{c.segment ?? "–"}</td>
                      <td className="num">{c.distance.toFixed(2)} Å</td>
                      <td className="tiny">{c.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {pdb.contacts_note && <p className="tiny muted">{pdb.contacts_note} Generic numbers from GPCRdb.</p>}
          </>
        )}
        {!pdb && r.structure?.source === "alphafold" && (
          <>
            <StructureViewer spec={{ kind: "model", url: r.structure.cif }} label={`AlphaFold predicted structure of ${r.gene}`} colors={colors} />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              <strong>Predicted structure</strong>, not experimental: AlphaFold DB {r.structure.id} (model v{r.structure.version}), mean pLDDT{" "}
              {r.structure.plddt?.toFixed(1)}. <Cite doi="10.1093/nar/gkad1011" />
            </p>
          </>
        )}
        {!r.structure && <p className="small muted">No structure available for this name.</p>}
        {consensus.length > 0 && (
          <p className="tiny muted">
            Related experimental structures of engineered consensus receptors (not human genes):{" "}
            {consensus.map((s, i) => (
              <span key={s.pdb}>
                {i > 0 && ", "}
                <a href={`https://www.rcsb.org/structure/${s.pdb}`} target="_blank" rel="noreferrer">
                  {s.pdb}
                </a>{" "}
                ({s.receptor}
                {s.ligand ? ` + ${s.ligand}` : ""})
              </span>
            ))}
            . <Cite doi={consensus[0].doi} />
          </p>
        )}
      </div>

      <div className="card-section">
        <h3>
          Known agonists ({r.n_agonists}) <Prov kind="measured" />
        </h3>
        {r.agonists.length ? (
          <>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Molecule</th>
                    <th className="num">EC50</th>
                    <th>Evidence</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {agonists.map((a) => (
                    <tr key={a.inchikey}>
                      <td>{a.name}</td>
                      <td className="num">
                        {a.log_ec50 !== null ? formatConc(10 ** a.log_ec50) : "–"}
                        {a.below_assay_range && (
                          <abbr title="Fitted below the concentration range these cell assays test — an extrapolation of the curve fit, not a measured potency.">
                            {" "}?
                          </abbr>
                        )}
                      </td>
                      <td className="tiny">{QUALITY_LABEL[a.quality]}</td>
                      <td className="tiny">
                        <CiteList dois={a.dois} max={1} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.agonists.length > 15 && (
              <button className="btn" style={{ marginTop: 6 }} onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show all ${r.agonists.length}`}
              </button>
            )}
          </>
        ) : (
          <p className="small muted">No agonist known{r.n_tested ? ` among ${r.n_tested} molecules tested` : " (never tested)"}.</p>
        )}
      </div>

      <div className="card-section">
        <h3>Variants</h3>
        {cases.map((c) => (
          <div key={c.id} className="note accent small" style={{ marginBottom: 8 }}>
            {c.perception} <Cite doi={c.doi} />
          </div>
        ))}
        {r.functional_variants.length ? (
          <>
            <p className="small">
              {r.functional_variants.length} of {r.alleles_tested.length} tested alleles respond differently from the reference allele to at least
              one molecule:
            </p>
            <ul className="small">
              {r.functional_variants.slice(0, 8).map((v) => (
                <li key={v.allele}>
                  <span className="mono tiny">{v.allele}</span> —{" "}
                  {v.differs_for
                    .slice(0, 3)
                    .map((d) => `${d.name}: ${d.variant === "agonist" ? "responds" : "no response"} (reference: ${d.ref === "agonist" ? "responds" : "no response"})`)
                    .join("; ")}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="small muted">{r.alleles_tested.length ? `${r.alleles_tested.length} variant alleles tested; none differ in response status.` : "No variant alleles tested in M2OR."}</p>
        )}
      </div>
    </div>
  );
}
