import { useStore } from "../state/store";
import { ConcentrationSlider, OdorantSelect, PersonSelector } from "../ui/Controls";
import { Scrubber, SidePanel, StageRail, StageView, usePlayback, useSimulation, useTimelineKeys } from "./simulationParts";

export function SimulationScreen() {
  const odorantId = useStore((s) => s.odorantId);
  const logConc = useStore((s) => s.logConc);
  const profile = useStore((s) => s.profile);
  const setOdorant = useStore((s) => s.setOdorant);
  const sim = useSimulation(odorantId, logConc, profile);
  usePlayback();
  useTimelineKeys();
  if (!sim) {
    return (
      <div className="panel">
        <h2>Nothing to simulate yet</h2>
        <p className="small">
          This view was opened for a drawn molecule, but no prediction is loaded.{" "}
          <a href="#/draw">Draw a molecule</a> or pick one on the <a href="#/">start page</a>.
        </p>
      </div>
    );
  }
  return (
    <div className="sim-layout">
      <div className="sim-main">
        <p className="rotate-hint note">Turn the device to landscape for the simulation view.</p>
        <StageRail />
        <StageView sim={sim} odorantId={odorantId} profile={profile} />
        <Scrubber />
        <p className="kbd-hint">
          <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> previous/next stage · <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> ±1 s ·{" "}
          <kbd>Home</kbd>/<kbd>End</kbd>
        </p>
      </div>
      <aside className="side" aria-label="Receptor activation and live plots">
        <div className="panel">
          <OdorantSelect value={odorantId} onChange={setOdorant} id="sim-odorant" />
          <ConcentrationSlider />
          <details className="more">
            <summary>Who is smelling?</summary>
            <div className="body" style={{ color: "var(--ink)" }}>
              <PersonSelector odorantId={odorantId} />
            </div>
          </details>
        </div>
        <SidePanel sim={sim} odorantId={odorantId} />
      </aside>
    </div>
  );
}
