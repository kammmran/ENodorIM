import { useMemo, useState } from "react";
import { useData } from "../data/load";
import { DRAWN_ID, predictedStimulus } from "../data/predictService";
import { formatConc } from "../model/activation";
import {
  MIXTURE_ID,
  blendDescriptors,
  combineReceptors,
  componentDrive,
  mixtureStimulus,
  normaliseFractions,
  type MixtureComponent,
  type MixtureReceptor,
} from "../model/mixture";
import { simulate } from "../model/simulation";
import { go } from "../state/router";
import { useStore } from "../state/store";
import { catColor, tintRamp, usePalette } from "../ui/colors";
import { ConcentrationSlider } from "../ui/Controls";
import { Molecule } from "../ui/Molecule";
import { ReceptorGrid, GridLegend } from "../ui/ReceptorGrid";
import { Prov } from "../ui/Refs";
import { ExportButtons } from "../ui/ExportButtons";
import { ShareButton } from "../ui/ShareLink";

export function MixtureScreen() {
  const data = useData();
  const pal = usePalette();
  const logConc = useStore((s) => s.logConc);
  const profile = useStore((s) => s.profile);
  const parts = useStore((s) => s.mixture);
  const setMixture = useStore((s) => s.setMixture);
  const setOdorant = useStore((s) => s.setOdorant);
  const drawn = useStore((s) => s.drawn);
  const conc = 10 ** logConc;

  const components: MixtureComponent[] = useMemo(() => {
    const out: MixtureComponent[] = [];
    for (const p of parts) {
      const s = p.id === DRAWN_ID ? (drawn ? predictedStimulus(drawn.prediction, drawn.name) : undefined) : data.stimuli.get(p.id);
      if (s) out.push({ stimulus: s, fraction: p.fraction });
    }
    return out;
  }, [parts, data, drawn]);

  const normalised = useMemo(() => normaliseFractions(components), [components]);
  const combined = useMemo(() => combineReceptors(components), [components]);
  const stimulus = useMemo(() => (components.length ? mixtureStimulus(components) : null), [components]);
  const sim = useMemo(
    () => (stimulus ? simulate(stimulus, data.order, conc, profile, data.genotypeCases) : null),
    [stimulus, data, conc, profile],
  );
  const drives = useMemo(() => componentDrive(components, conc), [components, conc]);
  const descriptors = useMemo(() => blendDescriptors(components, drives), [components, drives]);

  // One hue per component, assigned in the order the components were added and
  // never cycled: the colour follows the component, so removing one does not
  // repaint the others. Past the last categorical slot a component stays
  // neutral grey rather than borrowing a colour that already means something.
  const colors = useMemo(() => {
    const byId = new Map<string, string>();
    const byLabel = new Map<string, string>();
    normalised.forEach((c, i) => {
      const color = catColor(pal, i);
      byId.set(c.stimulus.id, color);
      byLabel.set(c.stimulus.label, color);
    });
    return { byId, byLabel };
  }, [normalised, pal]);

  // Each component's hue as a sequential ramp, so a barcode can show both which
  // component drives a receptor and how strongly.
  const ramps = useMemo(() => {
    const m = new Map<string, (a: number) => string>();
    for (const [label, color] of colors.byLabel) m.set(label, tintRamp(pal, color));
    return m;
  }, [colors, pal]);

  // Contributions are sorted by share, so the first one is the main driver.
  const dominant = useMemo(() => {
    const m = new Map<string, MixtureReceptor>();
    for (const r of combined) m.set(r.receptor, r);
    return m;
  }, [combined]);

  const [colourBy, setColourBy] = useState<"activation" | "component">("activation");
  const patternValues = useMemo(() => {
    if (!sim) return [];
    return sim.acts.map((act) => {
      if (colourBy === "activation") return { mode: "activation" as const, act };
      const top = dominant.get(act.receptor)?.contributions[0];
      return {
        mode: "activation" as const,
        act,
        ramp: top ? ramps.get(top.component) : undefined,
        note: top ? `Driven mainly by ${top.component} (${Math.round(top.share * 100)}% of the drive here)` : undefined,
      };
    });
  }, [sim, colourBy, dominant, ramps]);

  const singles = useMemo(
    () =>
      components.map((c) => ({
        label: c.stimulus.label,
        sim: simulate(c.stimulus, data.order, conc, profile, data.genotypeCases),
      })),
    [components, data, conc, profile],
  );

  const choices = [
    ...data.odorants.map((o) => ({ id: o.id, name: o.name })),
    ...(drawn ? [{ id: DRAWN_ID, name: `${drawn.name} (drawn, predicted)` }] : []),
  ];
  const unused = choices.filter((c) => !parts.some((p) => p.id === c.id));

  const add = (id: string) => setMixture([...parts, { id, fraction: 1 }]);
  const remove = (id: string) => setMixture(parts.filter((p) => p.id !== id));
  const setFraction = (id: string, fraction: number) =>
    setMixture(parts.map((p) => (p.id === id ? { ...p, fraction } : p)));

  const runSimulation = () => {
    setOdorant(MIXTURE_ID);
    useStore.getState().setTime(0);
    go("/simulate");
  };

  // Receptors that only respond because several components contribute.
  const cooperative = combined.filter((r) => r.contributions.length > 1);

  return (
    <div>
      <h1>Mixtures</h1>
      <p className="muted" style={{ maxWidth: "80ch" }}>
        Two or more odorants at once. Components compete for the same binding site on each receptor, so the mixture has an{" "}
        <em>effective</em> potency per receptor — a fraction-weighted harmonic mean of the components' EC50 values. That makes
        a mixture expressible as one stimulus, which the whole simulation then runs unchanged.
      </p>
      <div className="note accent" style={{ maxWidth: "80ch" }}>
        <strong>What this model cannot do.</strong> It only lets receptors respond <em>more</em> as components are added. Real
        mixtures show suppression and masking, where one odorant lowers the response to another — through antagonism at the
        receptor and through processing further along. None of that is modelled here, so treat a mixture result as the
        competitive-binding upper bound, not a prediction of perception. <Prov kind="schematic" />
      </div>

      <div className="explorer" style={{ marginTop: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div className="panel">
            <div className="panel-title">
              <h2>Components ({parts.length})</h2>
              {unused.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && add(e.target.value)}
                  aria-label="Add a component"
                >
                  <option value="">Add a component…</option>
                  {unused.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {parts.length === 0 && <p className="small muted">Add two or more odorants to build a mixture.</p>}
            {normalised.map((c, i) => {
              const part = parts[i];
              const od = part.id === DRAWN_ID ? null : data.odorantIndex.get(part.id);
              return (
                <div
                  key={part.id}
                  style={{ display: "grid", gridTemplateColumns: "3px 60px 1fr 200px 32px", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${pal.line}` }}
                >
                  <span
                    aria-hidden
                    style={{ alignSelf: "stretch", background: colors.byId.get(c.stimulus.id) ?? pal.muted, borderRadius: 2 }}
                  />
                  <div style={{ height: 50 }}>
                    <Molecule smiles={od?.smiles ?? drawn?.smiles ?? null} name={c.stimulus.label} width={120} height={80} />
                  </div>
                  <div>
                    <strong>{c.stimulus.label}</strong>
                    <div className="tiny muted">
                      {[...c.stimulus.responses.values()].filter((r) => r.pair.status === "agonist").length} receptors respond ·{" "}
                      {Math.round(c.fraction * 100)}% of the mixture · {formatConc(c.fraction * conc)}
                      {c.stimulus.provenance === "predicted" && " · predicted"}
                    </div>
                  </div>
                  <div className="range-row">
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={part.fraction}
                      onChange={(e) => setFraction(part.id, Number(e.target.value))}
                      aria-label={`Share of ${c.stimulus.label}`}
                    />
                    <output>{Math.round(c.fraction * 100)}%</output>
                  </div>
                  <button className="btn btn-icon" onClick={() => remove(part.id)} aria-label={`Remove ${c.stimulus.label}`}>
                    ×
                  </button>
                </div>
              );
            })}
            <div style={{ maxWidth: 420, marginTop: 12 }}>
              <ConcentrationSlider />
            </div>
            {sim && (
              <div className="run-bar">
                <button className="btn btn-primary" onClick={runSimulation} disabled={!sim.active.length}>
                  Run the simulation with this mixture
                </button>
                <span className="tiny muted">
                  {sim.active.length} receptors respond at {formatConc(conc)} total
                </span>
              </div>
            )}
          </div>

          {sim && stimulus && (
            <>
              <div className="panel">
                <div className="panel-title">
                  <h2>Mixture pattern</h2>
                  <Prov kind={stimulus.provenance} />
                </div>
                <div className="seg" style={{ marginBottom: 10 }} role="group" aria-label="Colour the barcode by">
                  <button aria-pressed={colourBy === "activation"} onClick={() => setColourBy("activation")}>
                    Colour by activation
                  </button>
                  <button aria-pressed={colourBy === "component"} onClick={() => setColourBy("component")}>
                    Colour by component
                  </button>
                </div>
                <ReceptorGrid
                  receptors={data.receptors}
                  values={patternValues}
                  columns={36}
                  cell={14}
                  onSelect={(g) => go(`/receptors/${g}`)}
                  label={
                    colourBy === "component"
                      ? `Mixture receptor pattern, each receptor in the colour of the component that drives it most: ${sim.active.length} receptors respond at ${formatConc(conc)} total concentration.`
                      : `Mixture receptor pattern: ${sim.active.length} receptors respond at ${formatConc(conc)} total concentration.`
                  }
                />
                <div style={{ marginTop: 8 }}>
                  {colourBy === "component" ? (
                    <>
                      <ComponentLegend components={normalised} colors={colors.byId} />
                      <p className="tiny muted" style={{ marginTop: 6 }}>
                        Each receptor takes the colour of the component supplying most of its drive; the shade still reads as
                        activation, pale to saturated. A receptor driven by two components therefore shows only its main one —
                        the table below gives the full split.
                      </p>
                    </>
                  ) : (
                    <GridLegend compact />
                  )}
                </div>
                <ExportButtons
                  acts={sim.acts}
                  meta={{
                    stimulus: normalised.map((c) => c.stimulus.label).join(" + "),
                    kind: "mixture",
                    provenance: stimulus.provenance,
                    concentration: conc,
                    components: normalised.map((c) => ({ name: c.stimulus.label, fraction: c.fraction })),
                    genotypes: profile.genotypes,
                  }}
                />
                <div className="export-row">
                  <ShareButton path="/mixtures" state={{ logConc, mixture: parts, genotypes: profile.genotypes }} />
                </div>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <h2>Where the components meet</h2>
                  <span className="tiny muted">{cooperative.length} receptors driven by more than one component</span>
                </div>
                {cooperative.length ? (
                  <div className="table-scroll">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Receptor</th>
                          <th className="num">Mixture EC50</th>
                          <th className="num">Best single</th>
                          <th>Who drives it</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cooperative.slice(0, 20).map((r) => (
                          <tr key={r.receptor}>
                            <td>
                              <a className="mono" href={`#/receptors/${r.receptor}`}>
                                {r.receptor}
                              </a>
                            </td>
                            <td className="num">
                              {r.ec50 !== null ? formatConc(r.ec50) : "–"}
                              {r.qualitative && <abbr title="Rests partly on screening-only data"> ?</abbr>}
                            </td>
                            <td className="num">{r.bestSingleEc50 !== null ? formatConc(r.bestSingleEc50) : "–"}</td>
                            <td className="tiny">
                              <span className="share-bar" aria-hidden>
                                {r.contributions.map((c) => (
                                  <span
                                    key={c.component}
                                    style={{ width: `${c.share * 100}%`, background: colors.byLabel.get(c.component) ?? pal.muted }}
                                  />
                                ))}
                              </span>
                              {r.contributions.map((c, i) => (
                                <span key={c.component} style={{ whiteSpace: "nowrap" }}>
                                  {i > 0 && " · "}
                                  <Swatch color={colors.byLabel.get(c.component) ?? pal.muted} />
                                  {c.component} <span className="muted">{Math.round(c.share * 100)}%</span>
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small muted">
                    No receptor is activated by more than one component, so at this ratio the mixture is just the union of its
                    parts.
                  </p>
                )}
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  “Mixture EC50” is the total concentration at which the mixture half-activates that receptor. It is never more
                  potent than the best single component, because at a fixed total concentration adding a weaker partner dilutes
                  the stronger one.
                </p>
              </div>

              <div className="panel">
                <div className="panel-title">
                  <h2>Each component alone</h2>
                  <span className="tiny muted">same total concentration, for comparison</span>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {singles.map((single) => (
                    <div key={single.label}>
                      <div className="plot-title">
                        <span>
                          <Swatch color={colors.byLabel.get(single.label) ?? pal.muted} />
                          {single.label}
                        </span>
                        <strong>{single.sim.active.length} respond</strong>
                      </div>
                      <ReceptorGrid
                        receptors={data.receptors}
                        values={single.sim.acts.map((act) => ({
                          mode: "activation" as const,
                          act,
                          ramp: ramps.get(single.label),
                        }))}
                        columns={44}
                        cell={8}
                        label={`${single.label} alone: ${single.sim.active.length} receptors respond`}
                        showClassLabels={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <aside>
          {descriptors.length > 0 && (
            <div className="panel">
              <div className="panel-title">
                <h2>Blended words</h2>
                <Prov kind="schematic" />
              </div>
              <div className="bars">
                {descriptors.map((d) => (
                  <div className="row" key={d.label}>
                    <span>{d.label}</span>
                    <span className="bar stack" title={`from ${d.from.join(", ")}`}>
                      {d.parts.map((part) => (
                        <span
                          key={part.component}
                          style={{
                            width: `${Math.min(100, part.weight * 100)}%`,
                            background: colors.byLabel.get(part.component) ?? pal.muted,
                          }}
                        />
                      ))}
                    </span>
                    <span className="num">{Math.round(d.weight * 100)}%</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <ComponentLegend components={normalised} colors={colors.byId} />
              </div>
              <p className="source-line" style={{ marginTop: 8 }}>
                Each component's reported words, weighted by how much receptor drive it contributes. This is a blend for
                display: a real mixture is not the sum of its parts, and new qualities can appear that none of the components
                has.
              </p>
            </div>
          )}
          <div className="panel">
            <h2>The model</h2>
            <p className="small">
              At one receptor, components compete for the same site:
            </p>
            <p className="mono small" style={{ background: "var(--surface-2)", padding: "8px 10px", borderRadius: "var(--radius)" }}>
              a = Σ(C<sub>i</sub>/EC50<sub>i</sub>) / (1 + Σ(C<sub>i</sub>/EC50<sub>i</sub>))
            </p>
            <p className="small">
              With C<sub>i</sub> = f<sub>i</sub>·C this is an ordinary Hill curve with EC50<sub>mix</sub> = 1 / Σ(f<sub>i</sub>
              /EC50<sub>i</sub>), so the mixture becomes a single stimulus and every later stage runs unchanged.
            </p>
            <p className="small muted">
              Assumes equal efficacy and one shared site per receptor, and no antagonism. Components known only from screening
              enter with a weak stand-in potency and mark the result “?”.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A component's colour chip. Always rendered beside the component's name, so
    identity is never carried by colour alone. */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 2,
        background: color,
        marginRight: 5,
        verticalAlign: "baseline",
      }}
    />
  );
}

function ComponentLegend({ components, colors }: { components: MixtureComponent[]; colors: Map<string, string> }) {
  const pal = usePalette();
  return (
    <div className="legend-row" role="list" aria-label="Mixture components">
      {components.map((c) => (
        <span role="listitem" key={c.stimulus.id}>
          <Swatch color={colors.get(c.stimulus.id) ?? pal.muted} />
          {c.stimulus.label}
        </span>
      ))}
    </div>
  );
}
