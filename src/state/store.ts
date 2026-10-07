import { create } from "zustand";
import { DEFAULT_PROFILE, type PersonProfile } from "../model/modifiers";
import { TOTAL_DURATION } from "../model/timeline";
import type { Prediction } from "../data/predictService";

export interface DrawnMolecule {
  name: string;
  smiles: string;
  prediction: Prediction;
}

/** One component of a Phase 3 mixture: an odorant id and its relative share. */
export interface MixturePart {
  id: string;
  fraction: number;
}

export type Theme = "system" | "light" | "dark";

interface UIState {
  odorantId: string;
  logConc: number; // log10 of assay concentration (mol/L)
  profile: PersonProfile;
  time: number; // presentation seconds
  playing: boolean;
  speed: number;
  theme: Theme;
  /** The molecule drawn on the Draw screen, if any (Phase 2). */
  drawn: DrawnMolecule | null;
  /** Phase 3: the components of the current mixture. */
  mixture: MixturePart[];
  setOdorant: (id: string) => void;
  setDrawn: (d: DrawnMolecule | null) => void;
  setMixture: (m: MixturePart[]) => void;
  setLogConc: (v: number) => void;
  setProfile: (p: Partial<PersonProfile>) => void;
  setGenotype: (caseId: string, genotype: string) => void;
  setTime: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setSpeed: (v: number) => void;
  setTheme: (t: Theme) => void;
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "system") delete el.dataset.theme;
  else el.dataset.theme = t;
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export const useStore = create<UIState>((set) => ({
  odorantId: "androstenone",
  logConc: -4,
  profile: DEFAULT_PROFILE,
  time: 0,
  playing: false,
  speed: 1,
  theme: readTheme(),
  drawn: null,
  mixture: [
    { id: "r-carvone", fraction: 1 },
    { id: "guaiacol", fraction: 1 },
  ],
  setOdorant: (id) => set({ odorantId: id }),
  setDrawn: (drawn) => set({ drawn }),
  setMixture: (mixture) => set({ mixture }),
  setLogConc: (v) => set({ logConc: v }),
  setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
  setGenotype: (caseId, genotype) =>
    set((s) => ({ profile: { ...s.profile, genotypes: { ...s.profile.genotypes, [caseId]: genotype } } })),
  setTime: (t) => set({ time: Math.max(0, Math.min(TOTAL_DURATION, t)) }),
  setPlaying: (v) => set({ playing: v }),
  setSpeed: (v) => set({ speed: v }),
  setTheme: (t) => {
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      /* storage unavailable: theme still applies for this visit */
    }
    applyTheme(t);
    set({ theme: t });
  },
}));
