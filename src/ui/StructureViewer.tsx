import { useEffect, useRef, useState } from "react";
import type { StructureContact } from "../data/types";

// Mol* viewer (prebuilt bundle, loaded on first use). Scenes are described
// declaratively with MolViewSpec (MVS) so the ligand can be focused.

interface MolstarViewer {
  loadMvsData(data: string, format: "mvsj"): Promise<void>;
  plugin: { dispose(): void };
}
declare global {
  interface Window {
    molstar?: { Viewer: { create(el: HTMLElement, opts: Record<string, unknown>): Promise<MolstarViewer> } };
  }
}

let molstar: Promise<NonNullable<Window["molstar"]>> | null = null;

function loadMolstar() {
  if (!molstar) {
    const base = `${import.meta.env.BASE_URL}vendor/molstar/`;
    molstar = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${base}molstar.css`;
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = `${base}molstar.js`;
      s.async = true;
      s.onload = () => (window.molstar ? resolve(window.molstar) : reject(new Error("Mol* failed to load")));
      s.onerror = () => reject(new Error("Mol* could not be loaded"));
      document.head.appendChild(s);
    });
  }
  return molstar;
}

/** MolViewSpec accepts hex only; CSS custom properties often resolve to rgb(). */
function toHex(css: string): string {
  const t = css.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();
  const m = t.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map((v) => {
      const n = v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v);
      return Math.max(0, Math.min(255, Math.round(n)));
    });
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  // Last resort: let the browser normalise it.
  const el = document.createElement("span");
  el.style.color = t;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  return computed === t ? "#808080" : toHex(computed);
}

const THREE: Record<string, string> = {
  ALA: "Ala", ARG: "Arg", ASN: "Asn", ASP: "Asp", CYS: "Cys", GLN: "Gln", GLU: "Glu", GLY: "Gly", HIS: "His", ILE: "Ile",
  LEU: "Leu", LYS: "Lys", MET: "Met", PHE: "Phe", PRO: "Pro", SER: "Ser", THR: "Thr", TRP: "Trp", TYR: "Tyr", VAL: "Val",
};
export const residueName = (c: StructureContact) => `${THREE[c.residue] ?? c.residue}${c.number}`;

export type StructureSpec =
  | { kind: "pdb"; url: string; receptorChain: string; otherChains: string[]; ligandComp: string; contacts: StructureContact[] }
  | { kind: "model"; url: string };

function mvs(spec: StructureSpec, raw: { receptor: string; other: string; ligand: string; residue: string; bg: string }) {
  const colors = {
    receptor: toHex(raw.receptor),
    other: toHex(raw.other),
    ligand: toHex(raw.ligand),
    residue: toHex(raw.residue),
    bg: toHex(raw.bg),
  };
  const rep = (type: string, color: string) => ({
    kind: "representation",
    params: { type },
    children: [{ kind: "color", params: { color } }],
  });
  const structureChildren: unknown[] = [];
  if (spec.kind === "pdb") {
    // Label only the closest polar contacts; the full list is in the table beside the viewer.
    // Labels have no size control in MolViewSpec and are drawn large, so only the
    // two closest polar contacts are labelled; the rest are in the table beside the viewer.
    const labelled = spec.contacts.filter((c) => c.chain === spec.receptorChain && c.kind !== "packing").slice(0, 2);
    const sidechains = spec.contacts.filter((c) => c.chain === spec.receptorChain).slice(0, 6);
    structureChildren.push(
      {
        kind: "component",
        params: { selector: spec.otherChains.map((c) => ({ label_asym_id: c })) },
        children: [rep("cartoon", colors.other)],
      },
      { kind: "component", params: { selector: { label_asym_id: spec.receptorChain } }, children: [rep("cartoon", colors.receptor)] },
      ...sidechains.map((c) => ({
        kind: "component",
        params: { selector: { auth_asym_id: c.chain, auth_seq_id: c.number } },
        children: [
          rep("ball_and_stick", colors.residue),
          ...(labelled.includes(c)
            ? [{ kind: "label", params: { text: residueName(c) } }]
            : []),
        ],
      })),
      {
        kind: "component",
        params: { selector: { label_comp_id: spec.ligandComp } },
        children: [
          rep("ball_and_stick", colors.ligand),
          // Pull the camera back so the pocket is seen inside the receptor, not filling the frame.
          // An explicit radius keeps the whole receptor in frame around the pocket.
          { kind: "focus", params: { radius: 13, direction: [0, -0.25, -1], up: [0, 1, 0] } },
        ],
      },
    );
  } else {
    structureChildren.push({ kind: "component", params: { selector: "polymer" }, children: [rep("cartoon", colors.receptor)] });
  }
  return {
    metadata: { version: "1" },
    root: {
      kind: "root",
      children: [
        { kind: "canvas", params: { background_color: colors.bg } },
        {
          kind: "download",
          params: { url: spec.url },
          children: [{ kind: "parse", params: { format: "mmcif" }, children: [{ kind: "structure", params: { type: "model" }, children: structureChildren }] }],
        },
      ],
    },
  };
}

export function StructureViewer({ spec, label, colors }: { spec: StructureSpec; label: string; colors: Parameters<typeof mvs>[1] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [active, setActive] = useState(false);
  const specKey = JSON.stringify(spec) + JSON.stringify(colors);

  useEffect(() => {
    if (!active || !ref.current) return;
    let viewer: MolstarViewer | null = null;
    let disposed = false;
    setStatus("loading");
    loadMolstar()
      .then(async (ms) => {
        if (disposed || !ref.current) return;
        viewer = await ms.Viewer.create(ref.current, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowRemoteState: false,
          layoutShowSequence: false,
          layoutShowLog: false,
          layoutShowLeftPanel: false,
          collapseLeftPanel: true,
          viewportShowExpand: true,
          viewportShowSelectionMode: false,
          viewportShowAnimation: false,
          viewportShowTrajectoryControls: false,
          viewportShowScreenshotControls: false,
          viewportShowSettings: false,
          viewportShowReset: false,
          pdbProvider: "rcsb",
        });
        if (disposed) return viewer.plugin.dispose();
        await viewer.loadMvsData(JSON.stringify(mvs(spec, colors)), "mvsj");
        if (!disposed) setStatus("ready");
      })
      .catch(() => !disposed && setStatus("error"));
    return () => {
      disposed = true;
      viewer?.plugin.dispose();
      if (ref.current) ref.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, active]);

  // Reset when the structure changes; the viewer loads only on request (it is heavy).
  useEffect(() => setActive(false), [spec.url]);

  return (
    <div className="structure-box" aria-label={label}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      {status !== "ready" && (
        <div className="placeholder">
          {status === "idle" && (
            <button className="btn" onClick={() => setActive(true)}>
              Open 3D structure
            </button>
          )}
          {status === "loading" && <span>Loading Mol* and the structure…</span>}
          {status === "error" && <span>The 3D viewer could not load this structure. Check the network connection.</span>}
        </div>
      )}
    </div>
  );
}
