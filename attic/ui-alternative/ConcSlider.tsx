// Log concentration slider. The label states plainly that this is the assay
// concentration, not a nasal concentration.

import { formatConc } from "../model/activation";
import { CONC_MAX, CONC_MIN } from "../state/store";

const lo = Math.log10(CONC_MIN);
const hi = Math.log10(CONC_MAX);

export function ConcSlider({ conc, onChange }: { conc: number; onChange: (molar: number) => void }) {
  return (
    <label className="conc">
      <span className="conc-head">
        <span>Concentration</span>
        <output className="mono">{formatConc(conc)}</output>
      </span>
      <input
        type="range"
        min={lo}
        max={hi}
        step={0.05}
        value={Math.log10(conc)}
        onChange={(e) => onChange(Math.pow(10, Number(e.target.value)))}
        aria-label="Assay concentration, logarithmic"
      />
      <span className="tiny faint">assay concentration, not nasal concentration</span>
    </label>
  );
}
