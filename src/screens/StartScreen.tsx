import type { KellerDescriptors, LeffingwellDescriptors, Odorant } from "../data/types";
import { useData } from "../data/load";
import { go } from "../state/router";
import { useStore } from "../state/store";
import { useReducedMotion } from "../ui/colors";
import { ConcentrationSlider, PersonSelector } from "../ui/Controls";
import { Molecule } from "../ui/Molecule";

function words(o: Odorant): string {
  const leff = o.descriptors.find((d): d is LeffingwellDescriptors => d.source === "leffingwell");
  if (leff) return leff.labels.slice(0, 4).join(", ");
  const keller = o.descriptors.find((d): d is KellerDescriptors => d.source === "keller_2016");
  if (keller) return Object.keys(keller.descriptors).slice(0, 3).join(", ");
  return "no open descriptor data";
}

export function StartScreen() {
  const data = useData();
  const odorantId = useStore((s) => s.odorantId);
  const setOdorant = useStore((s) => s.setOdorant);
  const reduced = useReducedMotion();
  const run = () => {
    useStore.getState().setTime(0);
    useStore.getState().setPlaying(!reduced);
    go("/simulate");
  };
  return (
    <div className="start-grid">
      <div>
        <section className="intro">
          <p className="eyebrow">Interactive olfactory receptor simulator</p>
          <h1>ENodorIM</h1>
          <p>
            Follow an odorant from the air in the nose to a conscious smell. The centre of the simulation is the receptor step: which of
            the ~400 human odorant receptors respond, measured in cell-based experiments (M2OR database). Every later stage shows what that
            receptor pattern leads to.
          </p>
          <ol className="three-stages">
            <li>
              <strong>1 · Olfactory GPCRs</strong>
              The receptor activation pattern initiates the olfactory stimulus.
            </li>
            <li>
              <strong>2 · Neuronal integration</strong>
              Sensory neurons and the olfactory bulb integrate the signal.
            </li>
            <li>
              <strong>3 · Decoding and perception</strong>
              Cortex decodes the pattern into a conscious smell.
            </li>
          </ol>
        </section>
        <section aria-labelledby="pick">
          <h2 id="pick">Choose an odorant</h2>
          <div className="odorant-grid">
            {data.odorants.map((o) => {
              const pr = data.pairs.get(o.id);
              const tested = pr?.pairs.filter((p) => p.status !== "inconclusive").length ?? 0;
              const ag = pr?.pairs.filter((p) => p.status === "agonist").length ?? 0;
              return (
                <button key={o.id} className="odorant-card" aria-pressed={o.id === odorantId} onClick={() => setOdorant(o.id)}>
                  <div className="mol">
                    <Molecule smiles={o.smiles} name={o.name} width={168} height={110} />
                  </div>
                  <h3>{o.name}</h3>
                  <div className="words">{words(o)}</div>
                  <div className="data">
                    {tested} ORs tested · {ag} respond{ag === 1 ? "s" : ""}
                  </div>
                </button>
              );
            })}
            <button className="odorant-card" onClick={() => go("/draw")}>
              <div className="mol">
                <svg width="64" height="48" viewBox="0 0 64 48" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M12 30 L22 24 L32 30 L42 24 L52 30" />
                  <path d="M22 24 L22 12" />
                  <path d="M42 24 L42 12 M39 12 L45 12" />
                </svg>
              </div>
              <h3>Draw a molecule</h3>
              <div className="words">Sketch any structure and predict which receptors it activates.</div>
              <div className="data">predicted · nearest neighbours</div>
            </button>
          </div>
        </section>
      </div>
      <aside className="panel" aria-label="Who is smelling?">
        <h2>Who is smelling?</h2>
        <p className="small muted">
          Genotype changes the receptor itself; age adds only a small documented shift later on.
        </p>
        <PersonSelector odorantId={odorantId} />
        <hr />
        <ConcentrationSlider />
        <div className="run-bar">
          <button className="btn btn-primary" onClick={run}>
            Run simulation
          </button>
          <a className="btn" href={`#/receptors`}>
            Explore receptors
          </a>
        </div>
      </aside>
    </div>
  );
}
