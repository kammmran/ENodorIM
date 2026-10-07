// Schematic kinetic model of one olfactory sensory neuron (OSN).
//
// Drive a (receptor activation, 0–1) → Gαolf/ACIII activity G → cAMP →
// CNG channel opens (Na⁺, Ca²⁺ in) → Ca²⁺ opens ANO2 (Cl⁻ leaves, amplifying
// the current) → depolarisation → action potentials.
// Termination: PDE1C hydrolyses cAMP; NCKX4 extrudes Ca²⁺. Adaptation:
// Ca²⁺–calmodulin lowers the CNG channel's sensitivity to cAMP.
//
// The shapes follow Reisert & Zhao 2011 (J Gen Physiol 138:303): Cl⁻ current
// up to ~90% of the receptor current, response delays as short as ~30 ms,
// firing up to ~200 Hz at saturating concentrations — all from rodent OSNs.
// Parameter values are illustrative, not fitted. Labelled "schematic".

export interface TransductionParams {
  tauG: number; // ms — receptor → Gαolf → ACIII activation
  kSyn: number; // cAMP synthesis per ms per unit G
  kDeg: number; // PDE1C hydrolysis, per ms
  K0: number; // cAMP for half-open CNG (no adaptation)
  h: number; // CNG Hill coefficient
  alphaCaM: number; // Ca²⁺–CaM reduction of CNG cAMP sensitivity
  tauCaM: number; // ms — Ca²⁺–CaM build-up
  beta: number; // Ca²⁺ entry per unit CNG current, per ms
  tauCa: number; // ms — NCKX4 Ca²⁺ extrusion
  KCl: number; // Ca²⁺ for half-open ANO2
  gCl: number; // max Cl⁻ current relative to max CNG current (9 → Cl⁻ ≤ 90%)
  tauM: number; // ms — membrane
  R: number; // depolarisation per unit current
  vTh: number; // spike threshold (normalised depolarisation)
  vSat: number; // depolarisation at maximal firing
  fMax: number; // Hz
}

export const PARAMS: TransductionParams = {
  tauG: 25,
  kSyn: 0.02,
  kDeg: 0.01,
  K0: 0.5,
  h: 2,
  alphaCaM: 3,
  tauCaM: 250,
  beta: 0.01,
  tauCa: 100,
  KCl: 0.5,
  gCl: 9,
  tauM: 10,
  R: 0.1,
  vTh: 0.05,
  vSat: 0.9,
  fMax: 200,
};

export interface SimOptions {
  tMax?: number; // ms
  stimOn?: number; // ms
  stimOff?: number; // ms
  dt?: number; // ms (integration)
  sampleEvery?: number; // ms (output)
  params?: Partial<TransductionParams>;
}

export interface Trace {
  t: number[];
  g: number[];
  camp: number[];
  ca: number[];
  icng: number[];
  icl: number[];
  vm: number[];
  rate: number[];
  spikes: number[];
  stimOn: number;
  stimOff: number;
  tMax: number;
}

export const SIM_DEFAULTS = { tMax: 1600, stimOn: 100, stimOff: 1100, dt: 0.5, sampleEvery: 4 };

export function simulateOSN(a: number, opts: SimOptions = {}): Trace {
  const { tMax, stimOn, stimOff, dt, sampleEvery } = { ...SIM_DEFAULTS, ...opts };
  const P = { ...PARAMS, ...opts.params };
  const drive = Math.max(0, Math.min(1, a));
  let G = 0, C = 0, Ca = 0, M = 0, V = 0, phase = 0;
  const out: Trace = { t: [], g: [], camp: [], ca: [], icng: [], icl: [], vm: [], rate: [], spikes: [], stimOn, stimOff, tMax };
  const every = Math.max(1, Math.round(sampleEvery / dt));
  const steps = Math.round(tMax / dt);
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const s = t >= stimOn && t < stimOff ? drive : 0;
    const K = P.K0 * (1 + P.alphaCaM * M);
    const ch = Math.pow(C, P.h);
    const iCNG = ch / (ch + Math.pow(K, P.h));
    const ca2 = Ca * Ca;
    const iCl = P.gCl * (ca2 / (ca2 + P.KCl * P.KCl));
    const iTot = iCNG + iCl;
    const span = (V - P.vTh) / (P.vSat - P.vTh);
    const rate = P.fMax * Math.max(0, Math.min(1, span));
    if (i % every === 0) {
      out.t.push(t);
      out.g.push(G);
      out.camp.push(C);
      out.ca.push(Ca);
      out.icng.push(iCNG);
      out.icl.push(iCl);
      out.vm.push(V);
      out.rate.push(rate);
    }
    phase += (rate * dt) / 1000;
    if (phase >= 1) {
      out.spikes.push(t);
      phase -= 1;
    }
    G += (dt * (s - G)) / P.tauG;
    C += dt * (P.kSyn * G - P.kDeg * C);
    Ca += dt * (P.beta * iCNG - Ca / P.tauCa);
    M += (dt * (Ca - M)) / P.tauCaM;
    V += (dt * (-V + P.R * iTot)) / P.tauM;
  }
  return out;
}

/** Index of the sample at or before time t (ms). */
export function sampleIndex(trace: Trace, t: number): number {
  const step = trace.t.length > 1 ? trace.t[1] - trace.t[0] : 1;
  return Math.max(0, Math.min(trace.t.length - 1, Math.floor(t / step)));
}

export function peak(xs: number[]): number {
  let m = 0;
  for (const x of xs) if (x > m) m = x;
  return m;
}

/** Mean firing rate (Hz) while the stimulus is on — the OSN output fed to the bulb. */
export function meanRate(trace: Trace): number {
  const n = trace.spikes.filter((s) => s >= trace.stimOn && s < trace.stimOff).length;
  return n / ((trace.stimOff - trace.stimOn) / 1000);
}

const responseCache = new Map<number, { trace: Trace; rate: number }>();

/** Memoised OSN response for a drive level (rounded to 0.001). */
export function osnResponse(a: number): { trace: Trace; rate: number } {
  const key = Math.round(Math.max(0, Math.min(1, a)) * 1000);
  let hit = responseCache.get(key);
  if (!hit) {
    const trace = simulateOSN(key / 1000);
    hit = { trace, rate: meanRate(trace) };
    responseCache.set(key, hit);
  }
  return hit;
}
