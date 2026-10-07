// Legend for the barcode. The three data states from the brief stay the main
// legend; "results disagree" is shown as a sub-state of tested (D7), and the
// evidence tiers (D1) are a second row.

interface SwatchProps {
  style: React.CSSProperties;
  label: string;
  hint?: string;
}

function Swatch({ style, label, hint }: SwatchProps) {
  return (
    <span className="legend-item" title={hint}>
      <span className="legend-swatch" style={style} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function Legend({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="legend">
      <div className="legend-row">
        <Swatch style={{ background: "var(--agonist)" }} label={`Responds (${counts.agonist ?? 0})`} />
        <Swatch
          style={{ background: "var(--non-agonist)", opacity: 0.5 }}
          label={`Tested, no response (${counts.non_agonist ?? 0})`}
        />
        <Swatch
          style={{ background: "var(--inconclusive)", opacity: 0.75 }}
          label={`Tested, results disagree (${counts.inconclusive ?? 0})`}
          hint="The sources disagree for this pair; the receptor card gives the reason."
        />
        <Swatch style={{ background: "var(--untested)" }} label={`Not tested (${counts.untested ?? 0})`} />
      </div>
      <div className="legend-row small muted">
        <span>Evidence:</span>
        <Swatch style={{ background: "var(--agonist)" }} label="Dose–response EC50" />
        <Swatch style={{ background: "var(--agonist-soft)" }} label="Screening, confirmed" />
        <Swatch
          style={{ background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--agonist)" }}
          label="Single screening hit"
        />
      </div>
    </div>
  );
}
