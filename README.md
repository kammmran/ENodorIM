# From molecule to smell

Project site - [Link](https://kammmran.github.io/ENodorIM/#/) </br>

An interactive simulator of human olfaction: an odorant reaches the nose, binds odorant receptors, the sensory neurons fire, the olfactory bulb integrates the signal, and the cortex decodes it into a conscious smell.

The centre of the project is the **receptor step**. Which of the ~400 human odorant receptors respond is taken from measured cell-assay data (M2OR); every later stage shows what that activation pattern leads to, and every value on screen is labelled `measured`, `predicted` or `schematic`.

Part of a research project on predicting the fragrance of chemical mixtures — DIFACQUIM group, School of Chemistry, UNAM. The original brief is in [PROMPT.md](PROMPT.md); the data check and decisions behind the build are in [PLAN.md](PLAN.md).

## Quick start

```bash
npm install          # app dependencies
npm run dev          # http://localhost:5173
```

`npm run dev` copies `data/processed/*.json` and the Mol*/RDKit bundles into `public/` first, so the committed data is enough to run the site. Rebuilding the data needs Python (below).

```bash
npm run build        # type-check + production build into dist/
npm test             # model unit tests (Vitest)
npm run typecheck
```

The build is a static site with a relative base, so `dist/` can be served from any folder or sub-path.

## Publishing

The build is a self-contained static site with a relative base, so it can be served from any folder or sub-path — no server,
no database, no API keys.

```bash
npm run build      # → dist/ (about 21 MB; the 3D viewer, chemistry toolkit and
                   #   sketcher are the bulk of it and load only on demand)
```

**GitHub Pages** (free, and the natural home for an academic project). `.github/workflows/deploy.yml` builds and publishes on
every push to `main`; CI needs only Node, because `data/processed/` is committed. After pushing the repo, open
*Settings → Pages* and set the source to **GitHub Actions**. The site then lives at
`https://<user>.github.io/<repo>/`.

Any other static host works too — drop the `dist/` folder on Netlify, Cloudflare Pages or Surge, or run `npx serve dist`
locally. Cloudflare Pages is worth knowing about if traffic ever grows, since its bandwidth is unmetered.

> **Licence note.** The Leffingwell descriptor set is CC BY-NC, so a published copy of this site must stay non-commercial.
> Academic and research use is fine, with the attribution the site already shows. See [data/SOURCES.md](data/SOURCES.md).

## Rebuilding the data

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m scripts.pipeline.build            # uses cached downloads
.venv/bin/python -m scripts.pipeline.build --refresh  # re-download sources
```

The pipeline downloads into `data/raw/` (git-ignored, cached), writes `data/processed/*.json`, and prints a summary — also saved to `data/processed/summary.txt` — covering pair counts, receptor coverage, every seed odorant with the receptors found, the genotype cases, and the reference list.

Licences and citation terms for every source are in [data/SOURCES.md](data/SOURCES.md).

**One manual step.** The M2OR website (m2or.chemsensim.fr) is behind a browser check that scripts cannot pass, so the pipeline uses the authors' GitHub snapshot (`M2OR_20230428.csv`, Apache-2.0). To use the current database instead, export the Experiments table as CSV from the website in a browser and drop it in `data/raw/m2or/`; the pipeline prefers it automatically and reports any differences in the summary.

## How the data is built

| Step | What happens |
|---|---|
| `sources.py` | Cached downloads: M2OR, HGNC, UniProt, GPCRdb, AlphaFold DB, RCSB PDB, PubChem, Pyrfume, Crossref |
| `m2or.py` | Human single-compound experiments → one consensus result per receptor–odorant pair, using M2OR's published Pair-table rules. Contradictory pairs are kept as `inconclusive` with the reason instead of being dropped. Flags EC50 values fitted below the range these assays test |
| `receptors.py` | Maps M2OR's several spellings per gene (`hOR10AC`, `OR 10G9`, old symbols) to HGNC symbols via symbol → alias → UniProt → sequence; adds class/family, structures |
| `odorants.py` | Test odorants by InChIKey (PubChem), plus odor descriptors from Leffingwell, Dravnieks and Keller & Vosshall — matched on exact stereochemistry |
| `genotypes.py` | Receptor genotype cases, comparing alleles measured in one paper so the genotype effect is not mixed with between-lab differences |
| `structures.py` | Ligand contacts measured from the deposited PDB coordinates, with GPCRdb generic residue numbers |
| `references.py` | Citation metadata for every DOI (Crossref, DataCite fallback) |

Output in `data/processed/`: `receptors.json`, `odorants.json`, `pairs.json`, `genotypes.json`, `references.json`, `summary.txt`.

## Project layout

```
scripts/pipeline/   Python data pipeline (pandas, RDKit, gemmi)
data/raw/           downloads (git-ignored)
data/processed/     JSON the site loads (committed)
src/model/          pure TypeScript simulation, no React — unit-tested
src/scenes/         SVG scenes, one per stage
src/ui/             reusable components (barcode, plots, molecules, 3D, controls)
src/screens/        Start, Simulation, Receptor explorer, Odorant explorer, Draw a molecule, Mixtures, How this works
attic/              superseded files kept out of the build (see attic/README.md)
```

`src/model/` never imports from the interface, so the simulation can be tested and reused on its own:

- `activation.ts` — Hill function, qualitative levels for screening-only agonists
- `transduction.ts` — kinetic model of one sensory neuron (cAMP, Ca²⁺, Cl⁻, Vm, spikes)
- `bulb.ts` — glomerular layout and lateral inhibition
- `simulation.ts` — one complete run
- `modifiers.ts` — every person-selector multiplier, each with its source and a comment
- `stimulus.ts` — the seam Phase 2 and 3 plug into

## The simulation model

Documented in full on the site's **How this works** page, with sources.

- **Receptor activation** (`measured`): `a = C / (EC50 + C)` where an EC50 was measured; agonists known only from screening get a fixed qualitative level above the lowest concentration that gave a response. Mark size in the barcode encodes the evidence (dose–response · confirmed screen · single screening hit).
- **Sensory neuron, bulb, cortex** (`schematic`): qualitatively correct shapes from rodent and amphibian recordings, with illustrative parameter values.
- **Person selector**: only receptor genotype changes receptor activation, from allele data measured in one paper. Age applies a small documented shift *after* the receptor stage, shown with its source.

## Phases

- **Phase 1**: pick a test odorant, watch the full simulation, inspect each receptor.
- **Phase 2 (built)**: draw or paste any molecule and get a predicted receptor pattern and predicted odor words, with the
  measured molecules behind each prediction shown as evidence. It feeds the same `Stimulus` the measured odorants use, so the
  whole simulation runs on a drawn molecule unchanged, labelled `predicted` throughout.
- **Phase 3 (built)**: mixtures of two or more odorants (including a drawn one), combined into the same `Stimulus`.

### The prediction baseline

Morgan fingerprints (radius 2, 2048 bits, **chirality included** — the measured data show enantiomers activating receptors
differently, so the predictor must not treat them as one molecule) compared by Tanimoto similarity against 654 measured
molecules from M2OR and 3,522 molecules with expert odor labels. A receptor's score is the similarity-weighted share of
similar molecules that respond, among those actually tested on it; untested receptors stay unknown rather than predicted
negative.

Hold-one-out over the reference set (`predict_index.json` carries the numbers, and the pipeline prints them):

| | |
|---|---|
| Top-ranked receptor is a true agonist | ~61% of molecules (n = 138) |
| Precision / recall at score ≥ 0.5 | 0.48 / 0.13 |

Read the ranking, not the absolute set. Recall is low because each reference molecule was tested on only a handful of
receptors while the screens defining "truth" tested hundreds. Python and the browser produce bit-identical fingerprints, so
the index is precomputed and only the query molecule is fingerprinted at run time.

### The learned model

`scripts/pipeline/train_model.py` fits a per-receptor L2 logistic regression on fingerprint bits for the 31 receptors with at
least 8 measured molecules on each side, and cross-validates it against the similarity baseline **on identical folds**:

| | learned | neighbours |
|---|---|---|
| mean ROC-AUC | **0.691** | 0.677 |
| mean average precision | **0.422** | 0.380 |
| better on | 22 of 31 receptors | 9 |

Random forests, extra trees, SVMs and other regularisation strengths all came within 0.01 AUC, so the data is the limit, not
the algorithm — the comparison is shipped rather than hidden. Per-receptor AUC varies enormously (OR5AN1 0.98, several at
chance), so every prediction carries its receptor's own AUC and the simulation uses the learned score only above AUC 0.70.
The model exports to a 43 KB matrix and runs in the browser as a dot product.

### Mixtures

Components compete for one binding site per receptor:

```
a = Σ(Cᵢ/EC50ᵢ) / (1 + Σ(Cᵢ/EC50ᵢ))     with Cᵢ = fᵢ·C
  = C / (EC50_mix + C),  EC50_mix = 1 / Σ(fᵢ/EC50ᵢ)
```

So a mixture collapses to one effective EC50 per receptor — an ordinary Hill curve — and becomes a single `Stimulus` the
whole simulation runs unchanged. The model only lets receptors respond *more* as components are added: real suppression and
masking are **not** modelled, and the site says so prominently.

## Limits the site states openly

Receptor data come from cell-based assays and show which receptors *can* respond, not what happens in a living nose. Most human receptors have no known ligand — "not tested" and "does not respond" are shown as different states. Assay concentrations are not nasal concentrations. Transduction timings are mostly rodent. The glomerular map and brain activity levels are schematic.
