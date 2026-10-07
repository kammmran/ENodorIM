import type { DravnieksDescriptors, KellerDescriptors, LeffingwellDescriptors, Odorant } from "../data/types";
import { useData } from "../data/load";
import { appraisalFactor, detectionThresholdFactor, type PersonProfile } from "../model/modifiers";
import type { SimulationResult } from "../model/simulation";
import { genotypeCasesFor } from "../model/stimulus";
import { Cite, Prov } from "./Refs";

// What people reported smelling (from perception datasets), never computed
// from the animation; plus the schematic model outputs and genotype notes.

const KELLER_DOI = "10.1186/s12868-016-0287-2";

export function PerceptPanel({ odorant, sim, profile }: { odorant: Odorant; sim: SimulationResult; profile: PersonProfile }) {
  const { genotypeCases } = useData();
  const leff = odorant.descriptors.find((d): d is LeffingwellDescriptors => d.source === "leffingwell");
  const drav = odorant.descriptors.find((d): d is DravnieksDescriptors => d.source === "dravnieks_1985");
  const keller = odorant.descriptors.find((d): d is KellerDescriptors => d.source === "keller_2016");
  const cases = genotypeCasesFor(odorant.id, genotypeCases);
  const unpleasant = keller?.pleasantness != null && keller.pleasantness < 40;
  const thr = detectionThresholdFactor(profile);
  const appr = appraisalFactor(profile);
  return (
    <div className="percept">
      <div>
        <div className="eyebrow">What people report</div>
        {leff ? (
          <>
            <div className="words" style={{ marginTop: 6 }}>
              {leff.labels.map((w) => (
                <span key={w} className="word">
                  {w}
                </span>
              ))}
            </div>
            <div className="source-line">
              {leff.match === "predicted" ? (
                <>
                  <Prov kind="predicted" /> Similarity-weighted words from the most similar molecules with expert labels
                  (Leffingwell PMP 2001 via Pyrfume, CC BY-NC) — not a measurement of this molecule
                </>
              ) : (
                <>
                  <Prov kind="measured" /> Expert labels, Leffingwell PMP 2001 via Pyrfume (CC BY-NC)
                  {leff.match !== "exact" && " · source gives no stereochemistry"}
                </>
              )}
            </div>
          </>
        ) : null}
      </div>
      {keller && (
        <div>
          <div className="bars">
            {[
              ["Intensity", keller.intensity],
              ["Pleasantness", keller.pleasantness],
            ].map(([k, v]) => (
              <div className="row" key={k as string}>
                <span>{k}</span>
                <span className="bar">
                  <span style={{ width: `${v ?? 0}%`, background: "var(--ink-2)" }} />
                </span>
                <span className="num">{v === null ? "–" : (v as number).toFixed(0)}/100</span>
              </div>
            ))}
            {Object.entries(keller.descriptors)
              .slice(0, 5)
              .map(([k, v]) => (
                <div className="row" key={k}>
                  <span>{k}</span>
                  <span className="bar">
                    <span style={{ width: `${v.share * 100}%` }} />
                  </span>
                  <span className="num">{Math.round(v.share * 100)}%</span>
                </div>
              ))}
          </div>
          <div className="source-line">
            <Prov kind="measured" /> Mean ratings of {keller.n_panelists} panelists who smelled it (dilution {keller.dilution}); bars below: share of
            panelists who used each word. <Cite doi={KELLER_DOI} />
          </div>
        </div>
      )}
      {drav && (
        <div>
          <div className="bars">
            {Object.entries(drav.applicability)
              .slice(0, 5)
              .map(([k, v]) => (
                <div className="row" key={k}>
                  <span>{k.toLowerCase()}</span>
                  <span className="bar">
                    <span style={{ width: `${Math.min(100, v)}%`, background: "var(--series-2)" }} />
                  </span>
                  <span className="num">{v.toFixed(0)}%</span>
                </div>
              ))}
          </div>
          <div className="source-line">
            <Prov kind="measured" /> Percent applicability, Dravnieks <em>Atlas of Odor Character Profiles</em> (1985), via Pyrfume
          </div>
        </div>
      )}
      {!leff && !keller && !drav && <p className="small muted">No openly licensed descriptor data for this odorant.</p>}
      {cases.map((c) => {
        const g = profile.genotypes[c.id] ?? c.genotypes[0].id;
        const per = c.genotypes.find((x) => x.id === g)?.perception;
        return (
          <div key={c.id} className="note accent">
            <strong className="mono">{c.receptor}</strong> genotype <strong>{g}</strong>. {per && <>{per} </>}
            {c.perception} <Cite doi={c.doi} />
            {c.curation && (
              <div className="tiny" style={{ marginTop: 4 }}>
                {c.curation}
              </div>
            )}
            {c.conflict && (
              <div className="tiny" style={{ marginTop: 4 }}>
                Conflicting data: {c.conflict.text} <Cite doi={c.conflict.doi} />
              </div>
            )}
          </div>
        );
      })}
      <div>
        <div className="eyebrow">Model outputs</div>
        <div className="bars" style={{ marginTop: 6 }}>
          <div className="row">
            <span>Detection</span>
            <span className="bar" aria-hidden>
              <span style={{ width: `${Math.min(100, (sim.drive / (sim.threshold * 4)) * 100)}%`, background: "var(--act-2)" }} />
              <span style={{ position: "absolute", left: "25%", top: -3, bottom: -3, width: 2, background: "var(--ink)" }} />
            </span>
            <span className="num">{sim.detected ? "above" : "below"}</span>
          </div>
          <div className="row">
            <span>Late appraisal</span>
            <span className="bar" aria-hidden>
              <span style={{ width: `${sim.appraisal * 100}%`, background: "var(--act-2)" }} />
            </span>
            <span className="num">{sim.appraisal.toFixed(2)}</span>
          </div>
        </div>
        <div className="source-line">
          <Prov kind="schematic" /> Total neuron drive {sim.drive.toFixed(2)} vs threshold {sim.threshold.toFixed(3)} (tick)
          {thr !== 1 && <> · threshold ×{thr.toFixed(2)} for this profile (illustrative)</>}
          {appr !== 1 && <> · appraisal ×{appr.toFixed(2)} (illustrative)</>}
        </div>
      </div>
      {unpleasant && (
        <p className="small muted">
          Rated unpleasant on average (pleasantness {keller!.pleasantness!.toFixed(0)}/100). For unpleasant odors a motor-cortex response appears
          300–400 ms after odor onset, before a fast avoidance movement (<Cite doi="10.1073/pnas.2101209118" />).
        </p>
      )}
    </div>
  );
}
