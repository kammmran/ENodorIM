// Shareable links.
//
// The interesting state of a view — which odorant, at what concentration, with
// which genotype, or which mixture — goes into the hash as a query string, so a
// researcher can paste an exact view into an email or a paper. Reading it back
// is deliberately forgiving: an unknown odorant or a nonsense number is ignored
// rather than throwing, because these links get retyped and truncated.

import type { MixturePart } from "./store";

export interface ShareState {
  odorantId?: string;
  logConc?: number;
  genotypes?: Record<string, string>;
  mixture?: MixturePart[];
}

/** The query part of a hash route, e.g. "#/simulate?o=guaiacol&c=-5". */
export function encodeShare(s: ShareState): string {
  const q = new URLSearchParams();
  if (s.odorantId) q.set("o", s.odorantId);
  if (s.logConc !== undefined) q.set("c", s.logConc.toFixed(2));
  for (const [caseId, genotype] of Object.entries(s.genotypes ?? {})) q.append("g", `${caseId}:${genotype}`);
  for (const p of s.mixture ?? []) q.append("m", `${p.id}:${p.fraction}`);
  return q.toString();
}

export function decodeShare(hash: string): ShareState {
  const i = hash.indexOf("?");
  if (i < 0) return {};
  const q = new URLSearchParams(hash.slice(i + 1));
  const out: ShareState = {};

  const o = q.get("o");
  if (o) out.odorantId = o;

  const c = Number(q.get("c"));
  // Only accept concentrations inside the slider's own range.
  if (Number.isFinite(c) && c >= -8 && c <= -2) out.logConc = c;

  const genotypes: Record<string, string> = {};
  for (const g of q.getAll("g")) {
    const at = g.lastIndexOf(":");
    if (at > 0) genotypes[g.slice(0, at)] = g.slice(at + 1);
  }
  if (Object.keys(genotypes).length) out.genotypes = genotypes;

  const mixture: MixturePart[] = [];
  for (const m of q.getAll("m")) {
    const at = m.lastIndexOf(":");
    if (at <= 0) continue;
    const fraction = Number(m.slice(at + 1));
    if (Number.isFinite(fraction) && fraction >= 0) mixture.push({ id: m.slice(0, at), fraction });
  }
  if (mixture.length) out.mixture = mixture;

  return out;
}

/** Absolute URL for the current page plus this state. */
export function shareUrl(path: string, s: ShareState): string {
  const q = encodeShare(s);
  const base = window.location.href.split("#")[0];
  return `${base}#${path}${q ? `?${q}` : ""}`;
}
