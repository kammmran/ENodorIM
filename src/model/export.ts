// Getting results out of the tool.
//
// The receptor activation pattern is the object of interest for a
// cheminformatics group, so every view that computes one can hand it over as
// CSV (for a spreadsheet or pandas) or JSON (with the full provenance of each
// value). Nothing here touches the DOM beyond triggering the download.

import type { Provenance } from "../data/types";
import { formatConc } from "./activation";
import { EVIDENCE_LABEL, STATE_LABEL } from "./evidence";
import type { ReceptorActivation } from "./stimulus";

export interface ExportMeta {
  /** What was simulated: an odorant name, a drawn molecule, or a mixture. */
  stimulus: string;
  kind: "odorant" | "drawn molecule" | "mixture";
  provenance: Provenance;
  concentration: number;
  inchikey?: string | null;
  smiles?: string | null;
  components?: { name: string; fraction: number }[];
  genotypes?: Record<string, string>;
  dataBuilt: string;
  m2orFile: string;
  siteUrl: string;
}

const CSV_COLUMNS = [
  "receptor",
  "activation",
  "data_state",
  "evidence",
  "ec50_M",
  "response_threshold_M",
  "activation_kind",
  "provenance",
  "genotype",
] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per receptor, including those that were never tested. */
export function toCSV(acts: ReceptorActivation[], meta: ExportMeta): string {
  const header = [
    `# ${meta.stimulus} (${meta.kind}, ${meta.provenance})`,
    `# concentration: ${formatConc(meta.concentration)} (${meta.concentration.toExponential(3)} mol/L, assay concentration — not a nasal concentration)`,
    meta.inchikey ? `# InChIKey: ${meta.inchikey}` : null,
    meta.smiles ? `# SMILES: ${meta.smiles}` : null,
    meta.components?.length
      ? `# components: ${meta.components.map((c) => `${c.name} ${Math.round(c.fraction * 100)}%`).join("; ")}`
      : null,
    Object.keys(meta.genotypes ?? {}).length
      ? `# genotypes: ${Object.entries(meta.genotypes!).map(([k, v]) => `${k}=${v}`).join("; ")}`
      : null,
    `# receptor data: M2OR ${meta.m2orFile}, doi:10.1093/nar/gkad886; built ${meta.dataBuilt}`,
    `# produced by ${meta.siteUrl}`,
    `# activation is the modelled response 0-1; "not tested" receptors are listed with an empty activation`,
  ].filter(Boolean);

  const rows = acts.map((a) =>
    [
      a.receptor,
      a.state === "untested" ? "" : a.a.toFixed(4),
      STATE_LABEL[a.state],
      a.evidence ? EVIDENCE_LABEL[a.evidence] : "",
      a.ec50 !== undefined ? a.ec50.toExponential(4) : "",
      a.threshold !== undefined ? a.threshold.toExponential(4) : "",
      a.kind,
      a.provenance,
      a.genotype?.genotype ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [...header, CSV_COLUMNS.join(","), ...rows].join("\n") + "\n";
}

export function toJSON(acts: ReceptorActivation[], meta: ExportMeta): string {
  return JSON.stringify(
    {
      meta: {
        ...meta,
        concentration_unit: "mol/L",
        note: "Assay concentration from cell-based receptor experiments, not a concentration in air or nasal mucus.",
      },
      receptors: acts.map((a) => ({
        receptor: a.receptor,
        activation: a.state === "untested" ? null : Number(a.a.toFixed(4)),
        state: a.state,
        evidence: a.evidence,
        ec50_M: a.ec50 ?? null,
        threshold_M: a.threshold ?? null,
        kind: a.kind,
        provenance: a.provenance,
        genotype: a.genotype?.genotype ?? null,
      })),
    },
    null,
    1,
  );
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "export"
  );
}

/** Trigger a browser download of `text`. */
export function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a tick to start before the blob is reclaimed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
