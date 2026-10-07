# Plan — "From molecule to smell"

Status 2026-10-07: **data check (brief §4) done; no application code written yet.** This plan covers what the data showed, the science decisions I need from you, and how I will build Phase 1 so that Phases 2 and 3 only add inputs.

---

## 1. Data check results

Pipeline: `python -m scripts.pipeline.build` (code in `scripts/pipeline/`, full output in `data/processed/summary.txt`, licences in `data/SOURCES.md`).

**M2OR access.** The website (m2or.chemsensim.fr) is behind a browser challenge that scripts cannot pass, and I did not try to get around it. I used the authors' own GitHub snapshot (`M2OR_20230428.csv`, Apache-2.0: 75,050 experiments, the release described in the NAR paper). If you want the newer website data, see decision D6.

**How pairs are built.** I reproduced the published M2OR Pair-table rules (Lalis et al. 2024):

- dose-response results take priority over screening;
- contradictory dose-response results → pair discarded;
- inconsistent screening, or responsive at a low concentration but not a higher one → pair discarded;
- data quality is labelled `ec50` > `secondaryScreening` > `primaryScreening`.

Pairs M2OR would discard are kept as **inconclusive**, with the reason, instead of disappearing.

**Receptor names.** M2OR uses several spellings for one gene (`hOR10AC`, `OR 10G9`, old symbols). Natural haplotypes are stored as separate sequences (`hOR7D4_R88W_T133M`) with an empty Mutation column, so "wild type" can't come from that column alone. Every name is mapped to an **HGNC symbol** (CC0; HGNC carries the HORDE IDs), and alleles are kept separately for the genotype selector.

| | |
|---|---|
| Human single-compound experiments → consensus pairs | 47,316 → 37,849 (27,503 reference allele, 10,346 variant alleles) |
| Reference-allele pairs | 1,306 agonist · 25,827 non-agonist · 370 inconclusive |
| Agonists by evidence | dose-response 545 · secondary screen 110 · primary screen 651 |
| HGNC protein-coding human OR genes | 417 (supports "~400 intact OR genes") |
| ORs tested (reference allele) / with ≥ 1 agonist | 422 / **235** |
| Pairs with a numeric EC50 | **513** reference allele (42 of them only as Mainland 2015 whole-log values), 791 incl. variants; 32 censored (EC50 > x) |
| Receptor universe for the barcode | 432 (417 protein-coding + 15 pseudogene/unmapped names that appear in M2OR) |
| Structures | AlphaFold model for 429/432; GPCRdb entry for 411 |
| Broad tuning | OR2W1 is #1 (134 agonists / 292 tested), OR1A1 is #3 (65 / 319) → brief's claim **confirmed** |
| References | 61, all DOIs resolved via Crossref; titles checked |
| Source-type caveat | Several EC50s (e.g. OR7D4–androstenone, OR5A1–β-ionone, OR51E2–propionate) include values citing doi:10.1093/chemse/bju073, which is the ECRO 2014 **conference-abstract collection**, not a full paper. Each value will show its source type |

### Seed odorants vs the brief's claims

| Odorant (InChIKey matched exactly) | ORs tested | Agonists (EC50 / 2° / 1°) | Brief's receptor | Verdict |
|---|---|---|---|---|
| propionic acid | 28 | 1 (1/0/0) | OR51E2 | ✅ EC50 ≈ 363 µM (median of 3 papers) |
| (R)-muscone | **1** | 1 | OR5AN1, OR1A1 | ✅ OR5AN1 (13 µM); OR1A1 only for **racemic** muscone (394 ORs tested: OR5AN1 20 µM, OR5A2 5.6 µM, OR1A1 2° screen) → D4 |
| androstenone | 371 | 54 (3/48/3) | OR7D4 | ✅ EC50 ≈ 10 µM. The 48 "2°" pairs are mostly one positive replicate at 100 µM (Mainland) plus a negative at 30 µM (Keller) → D1 |
| guaiacol | 283 | 5 (1/0/4) | OR10G4 | ⚠️ reference allele **not tested**; one haplotype positive in a primary screen. Mainland 2014 (the OR10G4 paper) is not in this snapshot → D3 |
| vanillin | 279 | 5 (1/0/4) | OR10G4 | ⚠️ reference allele inconclusive; two haplotypes respond (EC50 10 µM and 316 µM) |
| ethyl vanillin | 9 | 0 | OR10G4 | ❌ not in M2OR → D4 (drop) |
| β-ionone | 19 | 4 (1/1/2) | OR5A1 | ✅ EC50 1.3 µM |
| cis-3-hexen-1-ol | 387 | 4 (4/0/0) | OR2J3 | ⚠️ reference allele inconclusive (papers disagree); 8 haplotypes respond, EC50 3–100 µM (McRae 2012, Mainland 2015) — a good second genotype example → D3 |
| bourgeonal | 282 | 9 (0/1/8) | OR1D2 | ✅ secondary screen (incl. Spehr 2003) |
| isovaleric acid | 285 | 8 (5/1/2) | OR11H7 | ❌ OR11H7 is not in M2OR; the link comes from a genetic-association study (Menashe 2007), not an assay. Other agonists: OR11H4/OR11H6 (100 µM), OR51I2 (59 µM) |
| citronellol (racemic) | **1** | 1 | OR1A1 | ✅ for (S)-(−)-citronellol (11 ORs tested: OR1A1 92 µM, OR2W1 7.8 µM, OR2M7) and (R)-(+) (OR1A1 82 µM, OR1A2 81 µM) → D4 |
| (R)-(−)-carvone | 378 | 16 (10/0/6) | OR1A1 | ✅ EC50 30 µM |
| (S)-(+)-carvone | 378 | 4 (4/0/0) | OR1A1 | ✅ EC50 271 µM — ~9× weaker than (R): a clean enantiomer-discrimination example |
| **extras chosen from the data:** isoeugenol / geranyl acetate / (−)-menthol / phenylacetaldehyde | 273–282 | 62 / 40 / 38 / 38 (mostly 1° screen) | — | rich patterns; (−)-menthol also matches the consOR1–menthol structure 8UXY |

**Structures:** 8F76 (OR51E2 + propionate, 3.1 Å) and 8HTI (OR52cs + octanoic acid, 2.97 Å) confirmed. The de March et al. 2024 consensus ORs are **8UXV** (consOR51, class I, no ligand), **8UXY** (consOR1 + L-menthol), **8UY0** (consOR2 + (S)-carvone) and **8UYQ** (consOR4 + 2-methylthiazoline). The consensus receptors are engineered sequences, not human genes, and will be labelled as such.

**Odor descriptors:** Leffingwell (CC BY-NC) and Dravnieks match 12 of 17 odorants, by exact InChIKey. Matching only on the skeleton is allowed when the source gives no stereochemistry: an earlier draft wrongly gave (S)-carvone the "minty" profile of (R)-carvone, and I've fixed that. Keller & Vosshall 2016 (CC BY, with intensity and pleasantness) will be added and covers 11 of them. Still missing: androstenone (Keller 2007 genotype text will serve), bourgeonal and (S)-carvone → D5.

---

## 2. Decisions I need from you (they change the science shown)

My default is in **bold**; reply "defaults OK" or change any of them.

- **D1. Evidence levels in the barcode.** M2OR counts single-replicate screening hits as agonists, so androstenone shows 54 agonists, isoeugenol 62. **Show every M2OR agonist, but encode evidence visually:**
  - solid = dose-response EC50;
  - lighter = confirmed in screening (≥ 2 positive results);
  - outline only = a single positive screening result.

  In the simulation, agonists without an EC50 switch on at a fixed qualitative level, and only at or above the lowest concentration where a response was observed. *Alternative:* use only dose-response agonists in the simulation.
- **D2. OR7D4 WM allele (R88W + T133M).** The sources conflict. Keller 2007: no response up to 30 µM. Mainland 2015: EC50 ≈ 10 µM (whole-log). M2OR discards the pair. **Model WM from Keller 2007**, the paper that links genotype to perception, and show the conflict in the details. Heterozygotes (RT/WM): **half of OR7D4 neurons express each allele (monoallelic expression)**, which I'll source before it is used.
- **D3. Second genotype example.** For guaiacol/OR10G4, the reference allele isn't in this M2OR snapshot. **(a) Add OR2J3 × cis-3-hexen-1-ol from M2OR now** (8 haplotypes with EC50s, plus McRae 2012 perception data), **and (b) curate the OR10G4 haplotype × guaiacol data from Mainland 2014 into a separate, cited "curated (not in M2OR)" layer, if its supplement gives numbers.** *Alternative:* OR2J3 only.
- **D4. Seed list.**
  - **Racemic muscone instead of (R)-muscone**, showing (R)'s EC50 in the details.
  - **(S)-(−)-citronellol instead of racemic citronellol.**
  - **Drop ethyl vanillin.**
  - **Keep isovaleric acid without the OR11H7 claim.**
  - **Keep both carvone enantiomers.**
  - **Add the 4 extras above.**
- **D5. Goodscents descriptors.** These are a web scrape with no licence. **Don't use them.** Bourgeonal and (S)-carvone would then show "no open descriptor data".
- **D6. M2OR version.** **Use the GitHub snapshot for now.** If you want the current database: open m2or.chemsensim.fr in a browser, export the full Experiments table as CSV, and drop it in `data/raw/m2or/`. The pipeline prefers that file automatically, and the summary will report any differences.
- **D7. Inconclusive pairs.** **Show them as a sub-state of "tested" ("tested — results disagree"), with the reason**, rather than as "not tested". The three states from the brief stay the main legend.

---

## 3. Architecture

```
scripts/pipeline/      Python: fetch (cached) → M2OR consensus → receptors/odorants/pairs/references JSON
data/raw/              downloads (git-ignored)      data/processed/   JSON the site loads (committed)
src/
  model/               pure TS, no React — unit-tested with Vitest
    activation.ts      Hill (n = 1), qualitative switch for screening-only agonists, concentration sweep
    stimulus.ts        Stimulus = { identity, activation profile, percept, provenance }  ← Phase 2/3 seam
    transduction.ts    small ODE: Gαolf→ACIII→cAMP→CNG→Ca²⁺→ANO2 Cl⁻→Vm→spikes, PDE1C/NCKX4/CaM adaptation
    bulb.ts            one glomerulus per OR (schematic layout), lateral inhibition
    timeline.ts        stage schedule (sniff → … → perception), scrubber time → per-stage state
    modifiers.ts       every person-selector multiplier with source, value, comment, "illustrative" flag
  data/                typed loaders for data/processed/*.json
  state/               Zustand store (odorant, concentration, person profile(s), time, playback)
  ui/                  design tokens, components (Barcode, StageRail, Scrubber, MoleculeCard, EvidenceBadge…)
  screens/             Start, Simulation, ReceptorExplorer, OdorantExplorer, Compare, HowItWorks
```

**Phase 2/3 seam.** The simulation only consumes a `Stimulus`:

- an activation profile `(receptor, concentration) → { a, provenance: measured | predicted | schematic, quality, sources }`;
- a percept, which is a list of descriptors with sources.

Phase 1 builds `Stimulus` from `pairs.json`. Phase 2 adds a `PredictionService` (Ketcher → SMILES → RDKit.js validation → Tanimoto nearest neighbours over M2OR, later OpenPOM via FastAPI) that returns the same type. Phase 3 adds a `combine(stimuli[])` that also returns a `Stimulus`. Every odorant is keyed by InChIKey and carries its SMILES.

**Stack.**

- Vite + React + TypeScript; Zustand.
- D3 for scales and plots, drawn in SVG; Canvas only for the particle-level transduction scene.
- Mol\*, lazy-loaded on the receptor screen. The experimental mmCIFs are bundled; AlphaFold models load on demand.
- RDKit.js (WASM, lazy-loaded) for 2D depictions; Phase 2 needs it anyway.
- Fonts: IBM Plex Sans + IBM Plex Mono, self-hosted.

---

## 4. Simulation model (documented on "How this works")

- **Receptor activation.**
  - With an EC50: `a = C/(EC50 + C)`. EC50 = median log EC50 across papers; all values are listed with their DOIs; Mainland 2015 values are flagged "±0.5 log".
  - Screening-only agonists: a fixed level above the lowest responsive concentration, marked *qualitative*.
  - Censored EC50 (> x): a low qualitative level above x.
  - Log concentration slider (10 nM–10 mM), labelled "assay concentration, not nasal concentration".
- **Transduction.** A five-variable ODE driven by `a`, giving qualitatively correct shapes: latency, rise, the Cl⁻ amplification share, and adaptation under a sustained stimulus. Parameters are illustrative, shapes follow Reisert & Zhao 2011; labelled *schematic, rodent/amphibian data*.
- **Bulb.** Glomerular input = OSN rate per OR type; lateral inhibition (subtractive surround) sharpens the pattern. Layout is schematic: the human OR → glomerulus map is unknown, and the site says so.
- **Cortex and perception.** Regions light in sequence along the timeline (connections drawn after reading Zhou et al. 2019). The percept panel shows dataset descriptors, never values computed from the animation.
- **Person selector.** Genotype changes `a` through the allele's own data (D2/D3). Age shifts only the late cortical response, by a small amount with an evidence note.

---

## 5. Items to verify before they appear on screen

Each is checked against the paper, not memory:

- One OR per OSN (monoallelic expression) — source needed.
- ~5,500 glomeruli per bulb (Maresh 2008).
- OR51E2 contacts R262 (TM6), S258, Q181 (ECL2) and the TM6 movement (Billesbølle 2023).
- 300 ms bulb → motor cortex for unpleasant odors (Iravani 2021).
- Dalton 2002 details.
- Cl⁻ share up to ~90%, ~30 ms latency, up to ~200 Hz.
- Sniff 2–3 Hz (rodent).
- Effect sizes for Sorokowski 2019, Martinec Nováková 2014 and Martinez 2017.

Anything I cannot confirm is left out or labelled schematic.

---

## 6. Stages (I'll show each running)

1. **(a) Data pipeline: finish.**
   - Apply your decisions; add Keller 2016 descriptors and pleasantness; add the curated genotype layer.
   - Bundle the 8F76/8HTI/consensus mmCIFs.
   - pytest for the M2OR consensus rules.
   - Re-print the summary.
2. **(b) Receptor screen.**
   - App scaffold, design tokens (light/dark), data loaders.
   - **Receptor explorer:** family-ordered grid of 432 ORs in the three data states (plus evidence encoding) for the chosen odorant; receptor card with 3D (8F76 with propionate in the pocket; AlphaFold otherwise, labelled "predicted"); agonists with EC50, assay and DOI; variants; links to M2OR, GPCRdb, UniProt.
   - Odorant explorer with dose-response curves.
3. **(c) Full timeline.**
   - `src/model` with Vitest.
   - Stage rail, scrubber (play / pause / step / speed, keyboard), the seven scenes.
   - Persistent barcode and live plots.
4. **(d) Person selector** and compare mode (shared timeline).
5. **(e) Polish.**
   - "How this works / Sources", reduced motion, contrast, tablet layout, phone-landscape prompt.
   - The disabled "Draw a molecule" entry.
   - Project `README.md`: the current README holds this brief, so I'll move it to `PROMPT.md` first.
