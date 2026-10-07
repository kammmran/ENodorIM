import { useData } from "../data/load";
import { DRAWN_ID } from "../data/predictService";
import { formatConc } from "../model/activation";
import { activeModifiers, type AgeBand, type PersonProfile } from "../model/modifiers";
import { genotypeCasesFor } from "../model/stimulus";
import { useStore, type Theme } from "../state/store";
import { Cite, Prov } from "./Refs";

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ConcentrationSlider() {
  const logConc = useStore((s) => s.logConc);
  const setLogConc = useStore((s) => s.setLogConc);
  return (
    <div className="field">
      <label htmlFor="conc">Odorant concentration</label>
      <div className="range-row">
        <input
          id="conc"
          type="range"
          min={-8}
          max={-2}
          step={0.05}
          value={logConc}
          onChange={(e) => setLogConc(Number(e.target.value))}
          aria-valuetext={formatConc(10 ** logConc)}
        />
        <output htmlFor="conc">{formatConc(10 ** logConc)}</output>
      </div>
      <span className="hint">Log scale, 10 nM–10 mM. Assay concentration in cell-based tests, not the concentration in air or mucus.</span>
    </div>
  );
}

export function OdorantSelect({ value, onChange, id = "odorant", label = "Odorant" }: { value: string; onChange: (v: string) => void; id?: string; label?: string }) {
  const { odorants } = useData();
  const drawn = useStore((s) => s.drawn);
  const seeds = odorants.filter((o) => !["isoeugenol", "geranyl-acetate", "l-menthol", "phenylacetaldehyde"].includes(o.id));
  const extras = odorants.filter((o) => !seeds.includes(o));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {drawn && (
          <optgroup label="Drawn molecule (predicted)">
            <option value={DRAWN_ID}>{drawn.name || "Drawn molecule"}</option>
          </optgroup>
        )}
        <optgroup label="Test odorants">
          {seeds.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Fragrance materials with the most receptor data">
          {extras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

export function PersonSelector({ odorantId, showNotes = true }: { odorantId: string; showNotes?: boolean }) {
  const { genotypeCases } = useData();
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setGenotype = useStore((s) => s.setGenotype);
  const cases = genotypeCasesFor(odorantId, genotypeCases);
  const set = (p: Partial<PersonProfile>) => setProfile(p);
  return (
    <div>
      {cases.map((c) => {
        const current = profile.genotypes[c.id] ?? c.genotypes[0].id;
        return (
          <div className="field genotype-field" key={c.id}>
            <span className="label">
              Receptor genotype — <span className="mono">{c.receptor}</span>
            </span>
            <Seg
              label={`${c.receptor} genotype`}
              value={current}
              options={c.genotypes.map((g) => ({ value: g.id, label: g.id }))}
              onChange={(g) => setGenotype(c.id, g)}
            />
            <span className="hint">
              {Object.entries(c.alleles).map(([k, a]) => (
                <span key={k}>
                  <strong>{k}</strong>
                  {a.haplotype && <span className="mono"> {a.haplotype}</span>}: {a.note}{" "}
                </span>
              ))}
              Alleles measured in <Cite doi={c.doi} />. This changes the receptor response itself.
              {c.curation && <> {c.curation}</>}
            </span>
          </div>
        );
      })}
      <div className="field">
        <span className="label">Age band</span>
        <Seg<AgeBand>
          label="Age band"
          value={profile.age}
          options={[
            { value: "young", label: "Young adult" },
            { value: "older", label: "Older adult" },
          ]}
          onChange={(v) => set({ age: v })}
        />
      </div>
      {showNotes && <ModifierNotes profile={profile} />}
    </div>
  );
}

export function ModifierNotes({ profile }: { profile: PersonProfile }) {
  const mods = activeModifiers(profile).filter((m) => m.id !== "receptor-genotype");
  if (!mods.length) return <p className="small muted">No age effects selected. Receptor responses are the same for everyone with the same genotype.</p>;
  return (
    <details className="more" open>
      <summary>Evidence for the selected profile ({mods.length})</summary>
      <ul className="modifier-list body">
        {mods.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.level}.</strong> {m.finding}
            </div>
            <div className="tiny">
              <Prov kind={m.kind} /> {m.evidence} {m.doi && <Cite doi={m.doi} />}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const opts: { v: Theme; l: string }[] = [
    { v: "system", l: "Auto" },
    { v: "light", l: "Light" },
    { v: "dark", l: "Dark" },
  ];
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {opts.map((o) => (
        <button key={o.v} aria-pressed={theme === o.v} onClick={() => setTheme(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}
