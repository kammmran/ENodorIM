import { useEffect, useState } from "react";
import { depict, loadRDKit } from "./rdkit";

// 2D structure depiction with RDKit.js (WebAssembly, loaded on first use).

const cache = new Map<string, string>();

export function Molecule({ smiles, name, width = 160, height = 110 }: { smiles: string | null; name: string; width?: number; height?: number }) {
  const key = `${smiles}|${width}x${height}`;
  const [svg, setSvg] = useState<string | null>(() => cache.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!smiles) return;
    const hit = cache.get(key);
    if (hit) {
      setSvg(hit);
      setFailed(false);
      return;
    }
    let live = true;
    loadRDKit()
      .then((rd) => {
        const out = depict(rd, smiles, width, height);
        if (!live) return;
        if (out) {
          cache.set(key, out);
          setSvg(out);
          setFailed(false);
        } else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [key, smiles, width, height]);
  if (!smiles || failed) return <span className="tiny muted">structure unavailable</span>;
  return (
    <div
      role="img"
      aria-label={`2D structure of ${name}`}
      style={{ width: "100%", height: "100%" }}
      // RDKit output for a SMILES string; not user-supplied HTML.
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}
