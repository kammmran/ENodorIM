import { useEffect, useMemo, useRef } from "react";
import { useData } from "../data/load";
import { useOdorant, useStimulus } from "../data/useOdorant";
import { MIXTURE_ID } from "../model/mixture";
import { formatConc } from "../model/activation";
import { EVIDENCE_LABEL } from "../model/evidence";
import type { PersonProfile } from "../model/modifiers";
import { simulate, type SimulationResult } from "../model/simulation";
import { STAGES, TOTAL_DURATION, locate, physiologicalTime, stageStart } from "../model/timeline";
import { PARAMS } from "../model/transduction";
import { BindingScene } from "../scenes/BindingScene";
import { BulbScene } from "../scenes/BulbScene";
import { CortexScene } from "../scenes/CortexScene";
import { FiringScene } from "../scenes/FiringScene";
import { PerceptionScene } from "../scenes/PerceptionScene";
import { SniffScene } from "../scenes/SniffScene";
import { TransductionScene } from "../scenes/TransductionScene";
import type { SceneProps } from "../scenes/common";
import { STAGE_TEXT } from "../scenes/content";
import { useStore } from "../state/store";
import { go } from "../state/router";
import { usePalette, useReducedMotion } from "../ui/colors";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, RestartIcon } from "../ui/Icons";
import { LinePlot, SpikeRaster } from "../ui/Plots";
import { PerceptPanel } from "../ui/Percept";
import { ReceptorGrid, GridLegend } from "../ui/ReceptorGrid";
import { Prov } from "../ui/Refs";
import { Molecule } from "../ui/Molecule";

export function useSimulation(odorantId: string, logConc: number, profile: PersonProfile): SimulationResult | null {
  const data = useData();
  const stimulus = useStimulus(odorantId);
  return useMemo(
    () => (stimulus ? simulate(stimulus, data.order, 10 ** logConc, profile, data.genotypeCases) : null),
    [data, stimulus, logConc, profile],
  );
}

export function usePlayback() {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = useStore.getState();
      const next = s.time + ((now - last) / 1000) * s.speed;
      last = now;
      if (next >= TOTAL_DURATION) {
        s.setTime(TOTAL_DURATION);
        s.setPlaying(false);
        return;
      }
      s.setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

export function useTimelineKeys() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(el.tagName) || el.isContentEditable) return;
      if (el.getAttribute("role") === "slider") return;
      const s = useStore.getState();
      const { index } = locate(s.time);
      if (e.key === " ") {
        e.preventDefault();
        if (s.time >= TOTAL_DURATION) s.setTime(0);
        s.setPlaying(!s.playing);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        s.setTime(e.shiftKey ? s.time + 1 : stageStart(Math.min(STAGES.length - 1, index + 1)));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const st = stageStart(index);
        s.setTime(e.shiftKey ? s.time - 1 : s.time - st > 0.5 ? st : stageStart(Math.max(0, index - 1)));
      } else if (e.key === "Home") s.setTime(0);
      else if (e.key === "End") s.setTime(TOTAL_DURATION);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

export function StageRail() {
  const time = useStore((s) => s.time);
  const setTime = useStore((s) => s.setTime);
  const { index } = locate(time);
  return (
    <ol className="stage-rail" aria-label="Stages">
      {STAGES.map((st, i) => (
        <li key={st.id}>
          <button
            aria-current={i === index ? "step" : undefined}
            data-state={i < index ? "done" : undefined}
            onClick={() => setTime(stageStart(i) + 0.001)}
            title={st.label}
          >
            <span className="n">{i}</span>
            <span className="label">{st.rail}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function Scrubber() {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const { setTime, setPlaying, setSpeed } = useStore.getState();
  const track = useRef<HTMLDivElement>(null);
  const { index, stage } = locate(time);
  const pct = (t: number) => `${(t / TOTAL_DURATION) * 100}%`;
  const fromPointer = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    setTime(((clientX - r.left) / r.width) * TOTAL_DURATION);
  };
  return (
    <div className="scrubber">
      <button className="btn btn-icon" aria-label="Previous stage" onClick={() => setTime(stageStart(Math.max(0, time - stageStart(index) > 0.5 ? index : index - 1)))}>
        <PrevIcon />
      </button>
      <button
        className="btn btn-icon btn-primary"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => {
          if (time >= TOTAL_DURATION) setTime(0);
          setPlaying(!playing);
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button className="btn btn-icon" aria-label="Next stage" onClick={() => setTime(stageStart(Math.min(STAGES.length - 1, index + 1)))}>
        <NextIcon />
      </button>
      <div
        ref={track}
        className="track"
        role="slider"
        tabIndex={0}
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(TOTAL_DURATION)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${stage.label}, ${time.toFixed(1)} of ${TOTAL_DURATION} seconds`}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setPlaying(false);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            setTime(time + (e.shiftKey ? 5 : 1));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            setTime(time - (e.shiftKey ? 5 : 1));
          } else if (e.key === "Home") setTime(0);
          else if (e.key === "End") setTime(TOTAL_DURATION);
        }}
      >
        {STAGES.map((st, i) => (
          <div
            key={st.id}
            className={`seg-bar${i < index ? " done" : ""}`}
            style={{ left: `calc(${pct(stageStart(i))} + 1px)`, width: `calc(${pct(st.duration)} - 2px)` }}
          />
        ))}
        <div className="fill" style={{ left: 0, width: pct(time) }} />
        <div className="knob" style={{ left: pct(time) }} />
      </div>
      <span className="clock">
        {index}/{STAGES.length - 1} · {time.toFixed(1)} s
      </span>
      <label className="speed">
        <span className="sr-only">Speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {[0.5, 1, 2, 4].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-icon" aria-label="Restart" onClick={() => setTime(0)}>
        <RestartIcon />
      </button>
    </div>
  );
}

/** The scene for the current stage, its caption and details. */
export function StageView({ sim, odorantId, profile, compact = false }: { sim: SimulationResult; odorantId: string; profile: PersonProfile; compact?: boolean }) {
  const time = useStore((s) => s.time);
  const pal = usePalette();
  const reduced = useReducedMotion();
  const { stage, p } = locate(time);
  const odorant = useOdorant(odorantId)!;
  const props: SceneProps = { p, tau: physiologicalTime(time), sim, odorant, reduced, pal };
  const text = STAGE_TEXT[stage.id];
  const scene = (() => {
    switch (stage.id) {
      case "sniff":
        return <SniffScene {...props} />;
      case "binding":
        return <BindingScene {...props} />;
      case "transduction":
        return <TransductionScene {...props} />;
      case "firing":
        return <FiringScene {...props} />;
      case "bulb":
        return <BulbScene {...props} />;
      case "cortex":
        return <CortexScene {...props} />;
      case "perception":
        return <PerceptionScene {...props} />;
    }
  })();
  return (
    <section className="scene-frame" aria-label={`Stage: ${stage.label}`}>
      <div className="scene-head">
        <h2>{stage.label}</h2>
        <span className="tiny muted">{odorant.name} · {formatConc(sim.conc)}</span>
      </div>
      {stage.id === "perception" && !compact ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 12, alignItems: "start" }} className="perception-split">
          {scene}
          <div style={{ padding: "12px 14px 12px 0" }}>
            <PerceptPanel odorant={odorant} sim={sim} profile={profile} />
          </div>
        </div>
      ) : (
        scene
      )}
      <div className="caption">
        <p>{text.caption}</p>
        <p className="timescale">{text.timescale}</p>
        {!compact && (
          <details className="more">
            <summary>Details and sources</summary>
            <div className="body">{text.details}</div>
          </details>
        )}
      </div>
    </section>
  );
}

/** Persistent panel: odorant, barcode, top receptors and live OSN plots. */
export function SidePanel({ sim, odorantId }: { sim: SimulationResult; odorantId: string }) {
  const data = useData();
  const time = useStore((s) => s.time);
  const pal = usePalette();
  const odorant = useOdorant(odorantId)!;
  const tau = physiologicalTime(time);
  const lead = sim.lead;
  const values = useMemo(() => sim.acts.map((act) => ({ mode: "activation" as const, act })), [sim]);
  const tested = sim.acts.filter((x) => x.state !== "untested").length;
  const agonists = sim.acts.filter((x) => x.state === "agonist").length;
  const stimSpan: [number, number] = [100, 1100];
  return (
    <>
      <div className="panel">
        <div className="odorant-head">
          <div className="mol">
            <Molecule smiles={odorant.smiles} name={odorant.name} width={168} height={128} />
          </div>
          <div>
            <h2>{odorant.name}</h2>
            <div className="ids">{odorant.inchikey}</div>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              <a href={`#/odorants/${odorant.id}`}>All receptors tested →</a>
            </div>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-title">
          <h3>Receptor barcode</h3>
          <Prov kind={odorant.provenance} />
        </div>
        <p className="tiny muted" style={{ margin: "0 0 8px" }}>
          {odorant.id === MIXTURE_ID ? (
            <>
              {sim.active.length} respond at {formatConc(sim.conc)} total · effective potency per receptor from competitive
              binding of the components
            </>
          ) : odorant.provenance === "predicted" ? (
            <>
              {sim.active.length} predicted to respond at {formatConc(sim.conc)} · {agonists} predicted agonist
              {agonists === 1 ? "" : "s"} · nearest-neighbour baseline, no measured data for this molecule
            </>
          ) : (
            <>
              {sim.active.length} respond at {formatConc(sim.conc)} · {agonists} known agonist pairs · {tested} of{" "}
              {sim.acts.length} receptors tested · M2OR
            </>
          )}
        </p>
        <ReceptorGrid
          receptors={data.receptors}
          values={values}
          columns={33}
          cell={9}
          onSelect={(g) => go(`/receptors/${g}`)}
          label={`Receptor activation pattern for ${odorant.name}: ${sim.active.length} of ${sim.acts.length} receptors ${
            odorant.provenance === "predicted" ? "predicted to respond" : "respond"
          } at ${formatConc(sim.conc)}.`}
          showClassLabels
        />
        <div style={{ marginTop: 8 }}>
          <GridLegend compact />
        </div>
        <details className="more">
          <summary>Responding receptors ({sim.active.length})</summary>
          <ul className="active-list">
            {sim.active.slice(0, 40).map((x) => (
              <li key={x.receptor}>
                <button className="gene" onClick={() => go(`/receptors/${x.receptor}`)}>
                  {x.receptor}
                </button>
                <span className="meter" aria-hidden>
                  <span style={{ width: `${x.a * 100}%`, background: pal.ramp(x.a) }} />
                </span>
                <span className="tiny num" title={x.evidence ? EVIDENCE_LABEL[x.evidence] : ""}>
                  {x.a.toFixed(2)}
                  {x.kind === "qualitative" ? " q" : ""}
                  {x.ec50 ? ` · ${formatConc(x.ec50)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="tiny muted">a = activation (0–1). q = qualitative (screening only). Concentration = EC50.</p>
        </details>
      </div>
      <div className="panel">
        <div className="panel-title">
          <h3>One sensory neuron{lead ? ` (${lead.receptor})` : ""}</h3>
          <Prov kind="schematic" />
        </div>
        {lead ? (
          <div className="plots">
            <LinePlot t={lead.trace.t} series={[{ label: "cAMP", values: lead.trace.camp, color: pal.series1 }]} cursor={tau} tMax={1600} stim={stimSpan} title="cAMP (rel.)" />
            <LinePlot t={lead.trace.t} series={[{ label: "Ca²⁺", values: lead.trace.ca, color: pal.series2 }]} cursor={tau} tMax={1600} stim={stimSpan} title="Ca²⁺ in the cilium (rel.)" />
            <LinePlot
              t={lead.trace.t}
              series={[
                { label: "CNG", values: lead.trace.icng, color: pal.series2 },
                { label: "Cl⁻", values: lead.trace.icl, color: pal.series1 },
              ]}
              cursor={tau}
              tMax={1600}
              stim={stimSpan}
              title="Inward current (rel.)"
              yMax={PARAMS.gCl + 1}
            />
            <LinePlot t={lead.trace.t} series={[{ label: "Vm", values: lead.trace.vm, color: pal.ink }]} cursor={tau} tMax={1600} stim={stimSpan} title="Depolarisation (rel.)" yMax={1} />
            <SpikeRaster rows={[{ label: lead.receptor, spikes: lead.trace.spikes }]} cursor={tau} tMax={1600} stim={stimSpan} />
            <p className="tiny muted">Shaded: odorant present. Clock runs during the Neuron stages ({Math.round(tau)} ms).</p>
          </div>
        ) : (
          <p className="small muted">No receptor responds at this concentration. Raise the concentration to recruit receptors.</p>
        )}
      </div>
    </>
  );
}
