// The persistent barcode: one cell per human OR, family-ordered.
//
// Fill encodes the data state; for agonists the evidence tier is encoded on top
// of it (D1): solid = dose-response EC50, lighter = confirmed in screening,
// outline only = a single positive screening result.

import { useMemo } from "react";
import type { Receptor } from "../data/types";
import type { Stimulus } from "../model/stimulus";
import { pairActivation } from "../model/activation";
import type { EvidenceTier, DataState } from "../model/evidence";

export interface BarcodeCell {
  gene: string;
  state: DataState;
  evidence: EvidenceTier | null;
  /** 0..1 at the current concentration; 0 for anything that is not an agonist. */
  a: number;
}

export function barcodeCells(receptors: Receptor[], stimulus: Stimulus, conc: number): BarcodeCell[] {
  return receptors.map((r) => {
    const response = stimulus.responses.get(r.gene);
    if (!response) return { gene: r.gene, state: "untested" as DataState, evidence: null, a: 0 };
    return {
      gene: r.gene,
      state: response.state,
      evidence: response.evidence,
      a: pairActivation(response.pair, conc).a,
    };
  });
}

function cellStyle(cell: BarcodeCell): React.CSSProperties {
  if (cell.state === "agonist") {
    // Activation drives opacity so the slider visibly changes the pattern.
    const lit = 0.18 + 0.82 * cell.a;
    if (cell.evidence === "single") {
      return { background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--agonist)", opacity: lit };
    }
    const color = cell.evidence === "confirmed" ? "var(--agonist-soft)" : "var(--agonist)";
    return { background: color, opacity: lit };
  }
  if (cell.state === "inconclusive") return { background: "var(--inconclusive)", opacity: 0.75 };
  if (cell.state === "non_agonist") return { background: "var(--non-agonist)", opacity: 0.5 };
  return { background: "var(--untested)" };
}

interface Props {
  receptors: Receptor[];
  stimulus: Stimulus;
  conc: number;
  selected: string | null;
  onSelect: (gene: string) => void;
}

export function Barcode({ receptors, stimulus, conc, selected, onSelect }: Props) {
  const cells = useMemo(() => barcodeCells(receptors, stimulus, conc), [receptors, stimulus, conc]);

  return (
    <div className="barcode" role="list" aria-label="Human odorant receptors, family-ordered">
      {cells.map((cell) => (
        <button
          key={cell.gene}
          role="listitem"
          type="button"
          className={`barcode-cell${selected === cell.gene ? " is-selected" : ""}`}
          style={cellStyle(cell)}
          onClick={() => onSelect(cell.gene)}
          title={`${cell.gene} — ${cell.state}${cell.evidence ? ` (${cell.evidence})` : ""}`}
          aria-label={`${cell.gene}, ${cell.state}`}
          aria-pressed={selected === cell.gene}
        />
      ))}
    </div>
  );
}
