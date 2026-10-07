import { useMemo, useState } from "react";
import { useData } from "../data/load";
import { formatConc } from "../model/activation";
import { DEFAULT_PROFILE } from "../model/modifiers";
import { go } from "../state/router";
import { useStore } from "../state/store";
import { ConcentrationSlider, OdorantSelect, PersonSelector, Seg } from "../ui/Controls";
import { Molecule } from "../ui/Molecule";
import { PerceptPanel } from "../ui/Percept";
import { ReceptorGrid, GridLegend } from "../ui/ReceptorGrid";
import { Scrubber, StageRail, StageView, usePlayback, useSimulation, useTimelineKeys } from "./simulationParts";

export function CompareScreen() {
  const [mode, setMode] = useState<"odorants" | "people">("people");
  return (
    <div>
      <h1>Compare</h1>
      <div className="toolbar">
        <Seg
          label="Compare"
          value={mode}
          options={[
            { value: "people", label: "Two people, one odorant" },
            { value: "odorants", label: "Two odorants" },
          ]}
          onChange={setMode}
        />
      </div>
      {mode === "people" ? <ComparePeople /> : <CompareOdorants />}
    </div>
  );
}

function ComparePeople() {
  const data = useData();
  const odorantId = useStore((s) => s.odorantId);
  const setOdorant = useStore((s) => s.setOdorant);
  const logConc = useStore((s) => s.logConc);
  const profileA = useStore((s) => s.profile);
  const profileB = useStore((s) => s.profileB);
  const simA = useSimulation(odorantId, logConc, profileA);
  const simB = useSimulation(odorantId, logConc, profileB);
  usePlayback();
  useTimelineKeys();
  const diff = useMemo(
    () =>
      simA.acts
        .map((x, i) => ({ r: x.receptor, a: x.a, b: simB.acts[i].a }))
        .filter((d) => Math.abs(d.a - d.b) > 1e-6),
    [simA, simB],
  );
  const odorant = data.odorantIndex.get(odorantId)!;
  return (
    <>
      <div className="toolbar">
        <OdorantSelect value={odorantId} onChange={setOdorant} id="cmp-odorant" />
        <div style={{ minWidth: 300 }}>
          <ConcentrationSlider />
        </div>
      </div>
      <p className="small muted" style={{ maxWidth: "80ch" }}>
        Both people smell {odorant.name} at {formatConc(10 ** logConc)} on a shared timeline.{" "}
        {diff.length
          ? `Receptor responses differ for ${diff.map((d) => `${d.r} (${d.a.toFixed(2)} vs ${d.b.toFixed(2)})`).join(", ")}.`
          : "Receptor responses are identical: sex, cycle phase and age do not change the receptor step."}
      </p>
      <StageRail />
      <div className="compare-grid">
        {(["A", "B"] as const).map((w) => {
          const sim = w === "A" ? simA : simB;
          const profile = w === "A" ? profileA : profileB;
          return (
            <div key={w} style={{ minWidth: 0 }}>
              <div className="panel" style={{ marginBottom: 12 }}>
                <h2>Person {w}</h2>
                <PersonSelector which={w} odorantId={odorantId} />
              </div>
              <StageView sim={sim} odorantId={odorantId} profile={profile} compact />
              <div className="panel" style={{ marginTop: 12 }}>
                <ReceptorGrid
                  receptors={data.receptors}
                  values={sim.acts.map((act) => ({ mode: "activation" as const, act }))}
                  columns={33}
                  cell={9}
                  onSelect={(g) => go(`/receptors/${g}`)}
                  label={`Person ${w}: ${sim.active.length} receptors respond`}
                />
              </div>
              <div className="panel" style={{ marginTop: 12 }}>
                <PerceptPanel odorant={odorant} sim={sim} profile={profile} />
              </div>
            </div>
          );
        })}
      </div>
      <Scrubber />
      <p className="tiny muted" style={{ marginTop: 8 }}>
        Default comparison: person A has the reference genotype, person B the variant (if the odorant has one).{" "}
        <button className="btn" onClick={() => useStore.setState({ profile: DEFAULT_PROFILE })}>
          Reset person A
        </button>
      </p>
    </>
  );
}

function CompareOdorants() {
  const data = useData();
  const a = useStore((s) => s.odorantId);
  const b = useStore((s) => s.compareOdorantId);
  const setA = useStore((s) => s.setOdorant);
  const setB = useStore((s) => s.setCompareOdorant);
  const logConc = useStore((s) => s.logConc);
  const profile = useStore((s) => s.profile);
  const simA = useSimulation(a, logConc, profile);
  const simB = useSimulation(b, logConc, profile);
  const both = simA.acts.filter((x, i) => x.a > 0 && simB.acts[i].a > 0).map((x) => x.receptor);
  const onlyA = simA.active.filter((x) => !both.includes(x.receptor)).map((x) => x.receptor);
  const onlyB = simB.active.filter((x) => !both.includes(x.receptor)).map((x) => x.receptor);
  const testedBoth = simA.acts.filter((x, i) => x.state !== "untested" && simB.acts[i].state !== "untested").length;
  return (
    <>
      <div className="toolbar">
        <OdorantSelect value={a} onChange={setA} id="cmp-a" label="Odorant A" />
        <OdorantSelect value={b} onChange={setB} id="cmp-b" label="Odorant B" />
        <div style={{ minWidth: 300 }}>
          <ConcentrationSlider />
        </div>
      </div>
      <div className="panel overlap" style={{ marginBottom: 12 }}>
        <strong>{both.length}</strong> receptors respond to both · <strong>{onlyA.length}</strong> only to A · <strong>{onlyB.length}</strong> only to B ·{" "}
        {testedBoth} receptors were tested with both (a receptor missing from one list may simply not have been tested).
        {both.length > 0 && (
          <div className="small" style={{ marginTop: 6 }}>
            Shared: <span className="mono">{both.join(", ")}</span>
          </div>
        )}
      </div>
      <div className="compare-grid">
        {[
          { id: a, sim: simA },
          { id: b, sim: simB },
        ].map(({ id, sim }, k) => {
          const o = data.odorantIndex.get(id)!;
          return (
            <div key={k} className="panel" style={{ minWidth: 0 }}>
              <div className="odorant-head">
                <div className="mol">
                  <Molecule smiles={o.smiles} name={o.name} width={168} height={128} />
                </div>
                <div>
                  <h2>{o.name}</h2>
                  <div className="tiny muted">
                    {sim.active.length} respond at {formatConc(sim.conc)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <ReceptorGrid
                  receptors={data.receptors}
                  values={sim.acts.map((act) => ({ mode: "activation" as const, act }))}
                  columns={33}
                  cell={11}
                  highlight={new Set(both)}
                  onSelect={(g) => go(`/receptors/${g}`)}
                  label={`${o.name}: ${sim.active.length} receptors respond`}
                />
              </div>
              <hr />
              <PerceptPanel odorant={o} sim={sim} profile={profile} />
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        <GridLegend />
        <p className="tiny muted">Outlined cells: receptors responding to both odorants.</p>
      </div>
    </>
  );
}
