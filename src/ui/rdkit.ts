// RDKit.js (WebAssembly) wrapper: depiction, validation and fingerprints.
// Loaded on demand — the module is several MB.

export interface RDKitMol {
  get_svg_with_highlights(opts: string): string;
  get_smiles(): string;
  get_inchi(): string;
  get_morgan_fp(details: string): string;
  is_valid(): boolean;
  delete(): void;
}

export interface RDKitModule {
  get_mol(smiles: string): RDKitMol | null;
  get_inchikey_for_inchi(inchi: string): string;
  version(): string;
}

declare global {
  interface Window {
    initRDKitModule?: (opts: { locateFile: () => string }) => Promise<RDKitModule>;
  }
}

let rdkit: Promise<RDKitModule> | null = null;

export function loadRDKit(): Promise<RDKitModule> {
  if (!rdkit) {
    const base = `${import.meta.env.BASE_URL}vendor/rdkit/`;
    rdkit = new Promise<RDKitModule>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${base}RDKit_minimal.js`;
      s.async = true;
      s.onload = () => {
        if (!window.initRDKitModule) return reject(new Error("RDKit failed to initialise"));
        window.initRDKitModule({ locateFile: () => `${base}RDKit_minimal.wasm` }).then(resolve, reject);
      };
      s.onerror = () => reject(new Error("RDKit could not be loaded"));
      document.head.appendChild(s);
    });
  }
  return rdkit;
}

/** Run `fn` with a parsed molecule, always freeing the WASM object. */
export function withMol<T>(rd: RDKitModule, smiles: string, fn: (m: RDKitMol) => T): T | null {
  let mol: RDKitMol | null = null;
  try {
    mol = rd.get_mol(smiles);
    if (!mol) return null;
    try {
      if (mol.is_valid && !mol.is_valid()) return null;
    } catch {
      /* older builds have no is_valid; a non-null mol is good enough */
    }
    return fn(mol);
  } catch {
    return null;
  } finally {
    mol?.delete();
  }
}

export interface ParsedMolecule {
  smiles: string;
  inchikey: string | null;
  /** Packed Morgan fingerprint, matching the index's settings. */
  fingerprint: Uint8Array;
}

/** Bit string from RDKit ("0101…") packed MSB-first, as numpy.packbits does. */
function packBits(bits: string): Uint8Array {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) if (bits.charCodeAt(i * 8 + b) === 49) byte |= 0x80 >> b;
    out[i] = byte;
  }
  return out;
}

export function parseMolecule(rd: RDKitModule, input: string, fpOptions: object): ParsedMolecule | null {
  return withMol(rd, input, (m) => {
    const bits = m.get_morgan_fp(JSON.stringify(fpOptions));
    let inchikey: string | null = null;
    try {
      inchikey = rd.get_inchikey_for_inchi(m.get_inchi()) || null;
    } catch {
      inchikey = null;
    }
    return { smiles: m.get_smiles(), inchikey, fingerprint: packBits(bits) };
  });
}

export function depict(rd: RDKitModule, smiles: string, width: number, height: number): string | null {
  return withMol(rd, smiles, (mol) => {
    const raw = mol.get_svg_with_highlights(
      JSON.stringify({ width, height, bondLineWidth: 1, addStereoAnnotation: false, clearBackground: false, padding: 0.06, minFontSize: 10 }),
    );
    // Monochrome, theme-aware: every RDKit colour becomes the current text colour.
    return raw
      .replace(/<\?xml[^>]*\?>/, "")
      .replace(/<!--[^>]*-->/g, "")
      .replace(/#[0-9A-Fa-f]{6}/g, "currentColor")
      .replace(/width='\d+px' height='\d+px'/, "width='100%' height='100%'");
  });
}
