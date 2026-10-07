// Receptor detail: this receptor's response to the current odorant, its EC50
// values with assays and DOIs, its other agonists, its functional variants, and
// outbound links to M2OR, GPCRdb and UniProt.
//
// The 3D structure is not rendered yet — Mol* is stage (b)'s remaining piece.
// Until then the card states which structure *would* be shown and links it, so
// nothing on screen implies more than the data supports.

import type { Dataset } from "../data/load";
import type { Receptor } from "../data/types";
import type { Stimulus } from "../model/stimulus";
import { formatConc, pairActivation } from "../model/activation";
import { QUALITY_LABEL, STATE_LABEL } from "../model/evidence";
import { DoseResponse } from "./DoseResponse";
import { Doi, EvidenceBadge } from "./EvidenceBadge";

interface Props {
  receptor: Receptor;
  stimulus: Stimulus;
  conc: number;
  dataset: Dataset;
  onClose: () => void;
}

export function ReceptorCard({ receptor, stimulus, conc, dataset, onClose }: Props) {
  const response = stimulus.responses.get(receptor.gene);
  const activation = response ? pairActivation(response.pair, conc) : null;
  const structure = receptor.structure;
  const experimental = dataset.structures.find((s) => s.receptor === receptor.gene);

  return (
    <aside className="card" aria-label={`${receptor.gene} details`}>
      <header className="card-head">
        <div>
          <h2>{receptor.gene}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {receptor.cls ? `Class ${receptor.cls}` : "class unknown"}
            {receptor.family ? ` · family ${receptor.family}` : ""}
            {receptor.subfamily ? receptor.subfamily.replace(String(receptor.family), "") : ""}
            {receptor.location ? ` · ${receptor.location}` : ""}
          </p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>

      <section>
        <h3>With {stimulus.label}</h3>
        {!response && (
          <p className="small muted">
            Not tested. No experiment in this M2OR snapshot pairs {receptor.gene} with {stimulus.label}.
          </p>
        )}
        {response && (
          <>
            <p className="state-line">
              <strong>{STATE_LABEL[response.state]}</strong>
              <EvidenceBadge tier={response.evidence} />
            </p>
            {response.pair.reason && <p className="small warn-text">{response.pair.reason}</p>}
            <p className="small muted">
              {response.pair.n_positive}/{response.pair.n_experiments} positive ·{" "}
              {QUALITY_LABEL[response.pair.quality] ?? response.pair.quality}
              {response.pair.assays.length > 0 && ` · ${response.pair.assays.join(", ")}`}
            </p>

            {activation && (
              <p className="small">
                Activation at {formatConc(conc)}: <span className="mono">{activation.a.toFixed(2)}</span>{" "}
                <span className="muted">({activation.kind})</span>
                {activation.ec50 && (
                  <>
                    {" · EC50 "}
                    <span className="mono">{formatConc(activation.ec50)}</span>
                  </>
                )}
              </p>
            )}

            <DoseResponse pair={response.pair} conc={conc} />

            {response.pair.ec50_values && response.pair.ec50_values.length > 0 && (
              <table className="tbl small">
                <thead>
                  <tr>
                    <th>EC50</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {response.pair.ec50_values.map((v, i) => (
                    <tr key={i}>
                      <td className="mono">
                        {formatConc(Math.pow(10, v.log_ec50))}
                        {v.rounded && <span className="faint" title="whole-log value"> ±0.5 log</span>}
                      </td>
                      <td>
                        <Doi doi={v.doi} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {(!response.pair.ec50_values || response.pair.ec50_values.length === 0) &&
              response.pair.dois.length > 0 && (
                <ul className="list small">
                  {response.pair.dois.map((d) => (
                    <li key={d}>
                      <Doi doi={d} />
                    </li>
                  ))}
                </ul>
              )}
          </>
        )}
      </section>

      <section>
        <h3>Structure</h3>
        {experimental ? (
          <p className="small">
            {experimental.pdb} — {experimental.method}
            {experimental.resolution ? `, ${experimental.resolution} Å` : ""}
            {experimental.ligand ? `, with ${experimental.ligand}` : ""} ·{" "}
            <Doi doi={experimental.doi} />
          </p>
        ) : structure?.source === "alphafold" ? (
          <p className="small">
            <strong>Predicted</strong> — AlphaFold {structure.id}, pLDDT {structure.plddt}.{" "}
            <a href={structure.cif} target="_blank" rel="noreferrer">
              model file
            </a>
          </p>
        ) : (
          <p className="small muted">No structure in this dataset.</p>
        )}
        <p className="tiny faint">3D viewer not wired up yet (Mol* is the remaining stage-(b) piece).</p>
      </section>

      {receptor.agonists.length > 0 && (
        <section>
          <h3>Other agonists ({receptor.agonists.length})</h3>
          <ul className="list small">
            {receptor.agonists.slice(0, 12).map((a) => (
              <li key={a.inchikey}>
                {a.name}
                <span className="muted">
                  {" — "}
                  {a.log_ec50 !== null ? formatConc(Math.pow(10, a.log_ec50)) : QUALITY_LABEL[a.quality] ?? a.quality}
                </span>
              </li>
            ))}
          </ul>
          {receptor.agonists.length > 12 && (
            <p className="tiny faint">+ {receptor.agonists.length - 12} more</p>
          )}
        </section>
      )}

      {receptor.functional_variants.length > 0 && (
        <section>
          <h3>Functional variants</h3>
          <ul className="list small">
            {receptor.functional_variants.map((v) => (
              <li key={v.allele}>
                <span className="mono">{v.allele}</span>
                <span className="muted">
                  {" — differs for "}
                  {v.differs_for.map((d) => d.name).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Links</h3>
        <ul className="list small">
          {receptor.m2or_names.length > 0 && (
            <li>
              <a href="https://m2or.chemsensim.fr/" target="_blank" rel="noreferrer">
                M2OR
              </a>
              <span className="muted"> as {receptor.m2or_names.join(", ")}</span>
            </li>
          )}
          {receptor.gpcrdb && (
            <li>
              <a href={`https://gpcrdb.org/protein/${receptor.gpcrdb}/`} target="_blank" rel="noreferrer">
                GPCRdb
              </a>
            </li>
          )}
          {receptor.uniprot && (
            <li>
              <a href={`https://www.uniprot.org/uniprotkb/${receptor.uniprot}`} target="_blank" rel="noreferrer">
                UniProt {receptor.uniprot}
              </a>
            </li>
          )}
          {receptor.hgnc_id && (
            <li>
              <a
                href={`https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${receptor.hgnc_id}`}
                target="_blank"
                rel="noreferrer"
              >
                HGNC {receptor.hgnc_id}
              </a>
            </li>
          )}
        </ul>
      </section>
    </aside>
  );
}
