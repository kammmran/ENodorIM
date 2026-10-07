import { useMemo } from "react";
import { DRAWN_ID, predictedOdorant, predictedStimulus } from "./predictService";
import { MIXTURE_ID, mixtureStimulus, normaliseFractions, type MixtureComponent } from "../model/mixture";
import { useData } from "./load";
import type { Odorant } from "./types";
import type { Stimulus } from "../model/stimulus";
import { useStore, type DrawnMolecule, type MixturePart } from "../state/store";

// A drawn molecule (Phase 2) behaves like any other odorant: these two hooks
// are the only places that need to know it came from a prediction.

function mixtureComponents(
  parts: MixturePart[],
  data: ReturnType<typeof useData>,
  drawn: DrawnMolecule | null,
): MixtureComponent[] {
  const out: MixtureComponent[] = [];
  for (const p of parts) {
    const s = p.id === DRAWN_ID ? (drawn ? predictedStimulus(drawn.prediction, drawn.name) : undefined) : data.stimuli.get(p.id);
    if (s) out.push({ stimulus: s, fraction: p.fraction });
  }
  return normaliseFractions(out);
}

export function useOdorant(id: string): Odorant | undefined {
  const data = useData();
  const drawn = useStore((s) => s.drawn);
  const mixture = useStore((s) => s.mixture);
  return useMemo(() => {
    if (id === DRAWN_ID) return drawn ? predictedOdorant(drawn.prediction, drawn.name) : undefined;
    if (id === MIXTURE_ID) {
      const parts = mixtureComponents(mixture, data, drawn);
      if (!parts.length) return undefined;
      return {
        id: MIXTURE_ID,
        name: parts.map((c) => c.stimulus.label).join(" + "),
        inchikey: "",
        m2or_inchikey: null,
        m2or_match: "none",
        m2or_name: null,
        stereo_alternatives_in_m2or: [],
        cid: null,
        smiles: null,
        formula: null,
        mw: null,
        iupac: null,
        descriptors: [],
        provenance: parts.some((c) => c.stimulus.provenance === "predicted") ? "predicted" : "measured",
      };
    }
    return data.odorantIndex.get(id);
  }, [id, drawn, mixture, data]);
}

export function useStimulus(id: string): Stimulus | undefined {
  const data = useData();
  const drawn = useStore((s) => s.drawn);
  const mixture = useStore((s) => s.mixture);
  return useMemo(() => {
    if (id === DRAWN_ID) return drawn ? predictedStimulus(drawn.prediction, drawn.name) : undefined;
    if (id === MIXTURE_ID) {
      const parts = mixtureComponents(mixture, data, drawn);
      return parts.length ? mixtureStimulus(parts, parts.map((c) => c.stimulus.label).join(" + ")) : undefined;
    }
    return data.stimuli.get(id);
  }, [id, drawn, mixture, data]);
}
