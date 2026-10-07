// Copies processed data and vendor bundles into public/ before dev/build.
// data/processed is the source of truth (written by scripts/pipeline).
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const copy = (from, to) => {
  if (!existsSync(join(root, from))) throw new Error(`missing ${from} — run the data pipeline or npm install`);
  mkdirSync(join(root, to, ".."), { recursive: true });
  cpSync(join(root, from), join(root, to), { recursive: true });
};

mkdirSync(join(root, "public/data"), { recursive: true });
// .json for the datasets, .bin for the Phase 2 fingerprint blob.
for (const f of readdirSync(join(root, "data/processed"))) {
  if (f.endsWith(".json") || f.endsWith(".bin")) copy(`data/processed/${f}`, `public/data/${f}`);
}
for (const f of ["molstar.js", "molstar.css"]) copy(`node_modules/molstar/build/viewer/${f}`, `public/vendor/molstar/${f}`);
for (const f of ["RDKit_minimal.js", "RDKit_minimal.wasm"]) copy(`node_modules/@rdkit/rdkit/dist/${f}`, `public/vendor/rdkit/${f}`);
// JSME is a GWT bundle: it loads its own .cache.js pieces by relative path,
// so the whole folder has to ship together.
copy("node_modules/jsme-editor", "public/vendor/jsme");
// GitHub Pages runs Jekyll by default, which ignores files starting with "_".
// An empty .nojekyll in the published root turns that off.
writeFileSync(join(root, "public/.nojekyll"), "");

console.log("assets copied → public/data, public/vendor");
