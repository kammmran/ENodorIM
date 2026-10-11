# Prompt for Claude Code: "From molecule to smell" — an interactive olfactory receptor simulator

Paste everything below into Claude Code in an empty project folder (or save it as `PROMPT.md` and say "read PROMPT.md and start with the plan").

---

## 1. What we are building

A website that shows, step by step and in detail, what happens when a person smells an odorant: the molecule reaches the nose, binds odorant receptors, the receptor neurons fire, the olfactory bulb integrates the signal, and the brain decodes it into a conscious smell.

**The centre of the project is the receptor step.** Every other stage exists to explain what the receptor activation pattern leads to. The site must be driven by real receptor–odorant data, not invented values.

It belongs to a research project on predicting the fragrance of chemical mixtures. That project describes olfactory perception in three stages, and the site follows the same three:

1. Olfactory GPCRs as the initiating event of the olfactory stimulus
2. Neuronal integration of the signal
3. Decoding of the signal and conscious perception

**Audience:** chemistry and cheminformatics researchers and students. They know molecules and GPCRs; they are not neuroscientists. Text in English.

**Phases**

- **Phase 1 (build now):** pick a test odorant from a list, watch the full simulation, inspect each receptor. Include the person selector (section 5).
- **Phase 2 (design for it now, build later):** the user draws any molecule and the site predicts which receptors it activates and how it may smell. Build Phase 1 so that Phase 2 only adds a new input and a prediction service; nothing is rewritten.
- **Phase 3 (later):** mixtures of two or more odorants.

## 2. How to work

- Start with a written plan and the data check in section 4. Show me the plan before writing application code.
- Do not invent scientific values. Every number, receptor–odorant pair and brain claim shown on the site needs a source in `references.json`. If you cannot verify something, leave it out or mark it as schematic.
- The facts in section 3 come from a literature review. Items marked **[verify]** are from general knowledge and were not checked against the paper; check them before they appear on the site.
- Ask me when a decision changes the science shown. Decide design and code details yourself.
- Build in stages and show me each stage running: (a) data pipeline, (b) receptor screen, (c) full timeline, (d) person selector, (e) polish.

## 3. Science brief

### 3.1 The pathway (one stage per scene)

| # | Stage | What to show | Notes |
|---|---|---|---|
| 0 | Sniff | Odorant molecules carried in air to the olfactory epithelium at the roof of the nasal cavity; they dissolve in mucus | Sniffing ~2–3 Hz at rest, faster when actively sniffing (rodent data) |
| 1 | Receptor binding | Odorant enters the binding pocket of an odorant receptor (class A GPCR) on the cilia of an olfactory sensory neuron (OSN) | Humans have ~400 intact OR genes **[verify]**. Each OSN expresses one OR type **[verify]** |
| 2 | Transduction | OR → G protein Gαolf → adenylyl cyclase III → cAMP rises → CNG channel opens (CNGA2, CNGA4, CNGB1b) → Na⁺ and Ca²⁺ enter → Ca²⁺ opens the ANO2 (TMEM16B) chloride channel → Cl⁻ leaves the cell and amplifies depolarisation | The Cl⁻ current carries up to ~90% of the receptor current. Data are from rodent and amphibian OSNs |
| 3 | Firing and reset | Action potentials travel along the OSN axon. Termination: PDE1C breaks down cAMP; NCKX4 removes Ca²⁺ (the rate-limiting step); Ca²⁺-calmodulin lowers CNG channel sensitivity | Response delay from ~30 ms; firing up to ~200 Hz |
| 4 | Olfactory bulb | Axons of OSNs with the same OR converge on glomeruli; mitral and tufted cells carry the signal on; inhibitory interneurons sharpen it | Humans: roughly 5,500 glomeruli per bulb **[verify: Maresh et al. 2008]**. Which glomerulus belongs to which human OR is not known — the spatial layout must be labelled schematic |
| 5 | Primary olfactory cortex | Bulb output goes directly (no thalamic relay first) to piriform cortex, anterior olfactory nucleus, olfactory tubercle, amygdala, entorhinal cortex | For subregion connectivity read Zhou et al. 2019 (eLife) before drawing connections |
| 6 | Perception | Orbitofrontal cortex (conscious identity, value), insula, hippocampus (memory), amygdala (emotion), hypothalamus | For unpleasant odors the bulb signals motor cortex within about 300 ms, before conscious report (Iravani et al. 2021) |

**The key idea to make visible: combinatorial coding.** One odorant activates several receptors; one receptor responds to several odorants. The smell is the pattern across ~400 receptors, like a chord on a piano. The receptor activation pattern must stay visible as a persistent "barcode" through all later stages.

### 3.2 Receptor facts for the receptor screen

- **Experimental structures (show in 3D):**
  - Human OR51E2 with propionate, cryo-EM 3.1 Å, PDB **8F76** (Billesbølle et al., Nature 2023). The carboxylate of propionate pairs with Arg262 (TM6) and hydrogen-bonds Ser258 and Gln181 (ECL2); the pocket is small and closed off from the outside; activation moves the intracellular end of TM6 outward to open the G-protein site.
  - Consensus OR52 (OR52cs) with octanoic acid, cryo-EM 2.97 Å, PDB **8HTI** (Choi et al., Nat Commun 2023).
  - Engineered consensus ORs for class I and class II receptors (de March et al., Nature 2024) — find the PDB IDs.
  - For all other ORs use AlphaFold models and label them "predicted structure".
- **Genetic variation changes perception** (see section 5):
  - OR7D4 and androstenone: RT/RT carriers find it intense and unpleasant; RT/WM and WM/WM carriers find it weaker, less unpleasant, sometimes sweet/vanilla-like or odorless (Keller et al., Nature 2007).
  - OR10G4 and guaiacol: variants explain >15% of variation in perceived intensity and >10% in pleasantness (Mainland et al., Nat Neurosci 2014).
  - On average two people differ functionally at over 30% of their OR alleles (same paper).
- **Seed list of test odorants.** Check every pair against M2OR; keep only pairs that are in the data.
  - propionic acid → OR51E2
  - (R)-muscone → OR5AN1 (also OR1A1)
  - androstenone → OR7D4
  - guaiacol, vanillin, ethyl vanillin → OR10G4 (guaiacol is the high-affinity one)
  - β-ionone → OR5A1 **[verify]**
  - cis-3-hexen-1-ol → OR2J3 **[verify]**
  - bourgeonal → OR1D2 **[verify]**
  - isovaleric acid → OR11H7 **[verify]**
  - citronellol, carvone → OR1A1 **[verify]**
  - Also include 3–4 common fragrance materials with the most human-OR data in M2OR (choose from the data), so the combinatorial pattern is rich.
  - OR1A1 and OR2W1 are broadly tuned receptors **[verify]** — good for showing that one receptor answers many odorants.

### 3.3 Limits the site must state openly

- Receptor–odorant data come from cell-based assays (HEK293T/Hana3A cells with luciferase, cAMP or Ca²⁺ readouts). They show which receptors *can* respond, not exactly what happens in a living nose.
- Most human ORs have no known ligand. "No data" is not "does not respond". Show three states: responds, tested and does not respond, not tested.
- Transduction details and timings are mostly from rodents.
- The glomerular map and the brain activity levels are schematic.

## 4. Data sources (add these to the project)

Create `data/raw/` (downloads, git-ignored if the licence requires), `data/processed/` (compact JSON the site loads) and `scripts/` (Python pipeline). Before using any source, read its licence and citation terms and record them in `data/SOURCES.md`. If a download needs a manual step, stop and tell me exactly what to download.

| Source | What it gives | Use |
|---|---|---|
| **M2OR** — m2or.chemsensim.fr (Lalis et al., Nucleic Acids Research 2024) | The main dataset. ~75,000 bioassay experiments, >51,000 distinct OR–molecule pairs across species. Three tables: Experiment, Pair (one consensus row per OR–molecule pair), BLAST. Fields: molecule name, PubChem CID, CAS, InChIKey, SMILES, mixture type, species, gene name, UniProt ID, mutation, sequence, responsive (0/1), parameter (EC50 / raw / normalised), value, unit, assay type, cell line, reference DOI | Filter to *Homo sapiens*, wild-type receptors. Use the Pair table for the activation pattern and the Experiment table for EC50 values and citations |
| **GPCRdb** — gpcrdb.org (2025 release added odorant receptors) | Receptor pages, generic residue numbering, structure models, REST API | Residue numbering (e.g. 6.59), sequence alignment, snake plots, links |
| **UniProt** | Sequences, gene names, annotations for every human OR | Receptor identity cards |
| **AlphaFold DB** | Predicted 3D structure for each human OR (by UniProt ID) | 3D viewer when no experimental structure exists |
| **RCSB PDB** | Experimental structures 8F76, 8HTI and the consensus OR structures | 3D viewer for the binding pocket |
| **HORDE** (Weizmann Institute) | Human OR gene catalogue: families, chromosomal location, pseudogenes | OR family tree and classification (class I / class II, families 1–56) |
| **CORD** — Chordata Olfactory Receptor Database (2024) | ~1.18 million ORs across 2,776 species, 23,690 odorants, 3,118 OR–odorant pairs | Cross-check pairs; optional |
| **ORDB / OdorDB (SenseLab)**, **ODORactor**, **OlfactionBase** | Older OR and odorant resources | Cross-check only; check they are still online |
| **Pyrfume data archive** — github.com/pyrfume/pyrfume-data (MIT licence) | Curated smell datasets. Perception: `goodscents`, `leffingwell`, `dravnieks_1985`, `keller_2016`. Receptor responses: `mainland_2015` and others tagged `receptorResponse` | Odor descriptors for each test odorant now; training data for Phase 2 |
| **PubChem** | Structures, identifiers, 3D conformers | Molecule cards |

Pipeline output (`data/processed/`):

- `receptors.json` — one entry per human OR: gene name, UniProt ID, class, family, sequence length, structure source (PDB ID or AlphaFold), number of tested molecules, number of agonists, known functional variants.
- `odorants.json` — the test odorants: name, SMILES, InChIKey, CID, odor descriptors with source.
- `pairs.json` — odorant × receptor: status (`agonist` / `non_agonist` / `untested`), EC50 if available, assay type, DOI.
- `references.json` — every source with DOI.

Print a summary when the pipeline runs: how many human ORs have at least one agonist, how many pairs have EC50 values, and for each seed odorant which receptors were found. Show me this summary before building the interface.

## 5. Person selector (genotype and age)

The simulation has a "who is smelling?" control. **Do not show two different brains.** The pathway and the receptors are the same for everyone; the only documented change at the receptor level is genotype. Everything else is a small shift with large overlap, shown as a modest change plus a note with the effect size and source.

| Level | Finding | Strength | Source |
|---|---|---|---|
| Receptors and transduction | Receptor genotype changes how strongly a receptor responds | Alleles measured in cell assays and linked to perception in the same paper | Keller et al., Nature 2007; McRae et al., Chem Senses 2012 |
| Ageing | In older adults, age was negatively correlated with activation in primary olfactory cortex, insula and hippocampus | fMRI, n = 37 | Oncotarget 2017 (find full citation) |

Controls:

- **Age band:** young adult / older adult.
- **Receptor genotype** (shown only when the chosen odorant has a known variant): for androstenone, OR7D4 RT/RT, RT/WM, WM/WM; for guaiacol, OR10G4 variants. This changes the receptor activation itself and the resulting percept — make it the most prominent control, because it is the best-supported and it is at the receptor level.

Add a "compare" mode that plays two profiles side by side with a shared timeline.

## 6. The simulation model

Keep it simple, transparent and documented on a "How this works" page.

- **Receptor activation** for odorant *i* and receptor *j* at concentration *C*: if an EC50 exists, `a = Cⁿ / (EC50ⁿ + Cⁿ)` with n = 1 unless the source gives a Hill coefficient; if only a yes/no screening result exists, use a fixed "responds" level and mark it as qualitative. A concentration slider (log scale) lets the user see receptors recruit as concentration rises. State that assay concentrations are not nasal concentrations.
- **Transduction scene:** a small kinetic animation (cAMP, Ca²⁺, Cl⁻ current, membrane potential, spikes) scaled by `a`. Qualitatively correct shapes, including adaptation during a sustained stimulus. Labelled as a schematic model.
- **Bulb:** one glomerulus per receptor type in a schematic layout; glomerular input = receptor activation; add lateral inhibition so the pattern sharpens. Labelled schematic.
- **Cortex and perception:** a region diagram that lights up in sequence along the timeline. The percept panel shows the odor descriptors of the odorant from the perception datasets (not computed from the brain animation).
- **Person selector:** applies documented multipliers (e.g. genotype changes `a` for that receptor; age band lowers the late cortical response slightly). Keep every multiplier in one file, `model/modifiers.ts`, each with its source and a comment explaining the value. Where the literature gives direction but no number, use a small illustrative value and label it "illustrative".

## 7. Screens

1. **Start:** short explanation, odorant picker (cards with 2D structure, name, odor words), person selector, "Run".
2. **Simulation:** one continuous view with a timeline scrubber (play, pause, step, speed). Left: the scene for the current stage. Right: a persistent panel with the receptor activation barcode and live plots. A stage rail shows where you are (Nose → Receptor → Neuron → Bulb → Cortex → Perception). Each stage has a short plain-language caption and an expandable "details" section with molecules, numbers and sources.
3. **Receptor explorer** (the most developed screen): grid or family tree of the ~400 human ORs, coloured by the three data states for the chosen odorant. Click a receptor: identity card, 3D structure with the binding pocket (Mol\* viewer; experimental structure when available, otherwise AlphaFold, clearly labelled), list of known agonists with EC50 and assay, known variants and their perceptual effect, links to M2OR, GPCRdb and UniProt.
4. **Odorant explorer:** the reverse view — for an odorant, all receptors tested, dose–response curves where EC50 exists.
5. **Compare:** two odorants or two person profiles side by side.
6. **How this works / Sources:** the model, its limits (section 3.3), and the full reference list.

Prepare a disabled "Draw a molecule" entry on the Start screen for Phase 2.

## 8. Phase 2 design (do not build yet, but keep the door open)

- Input: a molecule sketcher — Ketcher (`ketcher-react` + `ketcher-standalone`, Apache 2.0) — returning SMILES. RDKit.js (WebAssembly) for validation, canonical SMILES, 2D depiction and fingerprints in the browser.
- Receptor prediction: start with a transparent baseline — nearest neighbours by Tanimoto similarity over M2OR molecules, showing the similar known molecules as evidence. Later evaluate a learned model (e.g. Hladiš et al., ICLR 2023: graph neural network + protein language model for OR–molecule matching).
- Smell prediction: OpenPOM (open-source replication of the Principal Odor Map of Lee et al., Science 2023; trained on ~5,000 GoodScents/Leffingwell molecules; reported AUROC ≈ 0.89), served from a small Python API (FastAPI).
- So in Phase 1: every odorant in the app is identified by SMILES/InChIKey; the simulation takes an "activation vector over receptors + descriptor list" as input and does not care whether it came from data or from a prediction; every value carries a `provenance` field (`measured` / `predicted` / `schematic`) that the interface displays.

## 9. Design direction

Modern, calm and easy to use. It should look like a carefully made scientific tool or a good museum interactive, not like a generic AI-generated landing page.

Do:

- Light theme by default, with a proper dark theme. Off-white background, near-black text, one accent colour, plus one colour scale for activation. Colour carries meaning only.
- A clear type system: one sans-serif for interface and text, a monospace for identifiers (OR51E2, EC50 values, SMILES). Avoid the default system look.
- Flat, precise illustration: thin-line diagrams of the nose, neuron, bulb and brain in SVG; molecules drawn as real 2D structures.
- Motion that explains: molecules drift and bind, ions flow, spikes travel. Slow enough to follow, always pausable. Respect `prefers-reduced-motion`.
- Layout that works on a laptop and a tablet; the simulation view may ask for landscape on phones.
- Keyboard control of the timeline, readable contrast, text alternatives for each stage.

Do not use: purple/blue gradients, glassmorphism, glowing neon brains, particle backgrounds, 3D for decoration, emoji as icons, big rounded cards with drop shadows everywhere, centred hero sections with marketing slogans, or stock "AI" imagery.

## 10. Technical setup

- Vite + React + TypeScript. State with Zustand (or similar). Static site, no backend in Phase 1; processed JSON loaded at start.
- SVG + D3 for diagrams and plots; Canvas for the particle-level transduction scene if SVG is too slow. Mol\* for 3D structures. RDKit.js for molecule depiction.
- Python (pandas, RDKit) for `scripts/` data processing.
- Simulation logic in pure TypeScript modules under `src/model/`, separated from the interface, with unit tests (Vitest): Hill function, modifiers, pattern for each seed odorant.
- A `README.md` explaining how to rebuild the data and run the site.

## 11. Done means

- The data summary matches M2OR for every seed odorant, and every pair on screen links to its DOI.
- Choosing an odorant plays all stages end to end; the receptor barcode stays consistent across stages.
- The receptor explorer shows the three data states and opens the 8F76 structure with propionate in the pocket.
- Changing OR7D4 genotype visibly changes the androstenone simulation and percept; changing the age band produces only the small documented shift, with its evidence note.
- Every displayed value shows whether it is measured, predicted or schematic.
- Tests pass; the site builds and runs with `npm run dev`.

## 12. Key references

- Billesbølle et al. 2023, Nature 615:742 — OR51E2–propionate structure (PDB 8F76). doi:10.1038/s41586-023-05798-y
- Choi et al. 2023, Nat Commun 14:8105 — OR52 family structures (PDB 8HTI). doi:10.1038/s41467-023-43983-9
- de March et al. 2024, Nature — engineered consensus odorant receptors
- Lalis et al. 2024, Nucleic Acids Research — M2OR database
- GPCRdb in 2025, Nucleic Acids Research — odorant receptors added
- Reisert & Zhao 2011, J Gen Physiol 138:303 — response kinetics of olfactory receptor neurons
- Keller et al. 2007, Nature — OR7D4 and androstenone. doi:10.1038/nature06162
- Mainland et al. 2014, Nat Neurosci — functional variation in human ORs. doi:10.1038/nn.3598
- Trimmer et al. 2019, PNAS — genetic variation across the human OR repertoire alters odor perception
- Maresh et al. 2008, PLoS ONE — glomerular organisation of the human olfactory bulb
- Zhou et al. 2019, eLife — functional pathways of the human olfactory system. doi:10.7554/eLife.47177
- Iravani et al. 2021, PNAS — human olfactory bulb oscillations, valence and avoidance
- Keller et al. 2017, Science — predicting human olfactory perception from chemical features
- Lee et al. 2023, Science — principal odor map; OpenPOM: github.com/BioMachineLearning/openpom
- Hladiš et al. 2023, ICLR — matching receptor to odorant with protein language and graph neural networks