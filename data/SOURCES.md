# Data sources

Licences and citation terms, checked on 2026-10-07. `data/raw/` is not committed; `python -m scripts.pipeline.build` re-downloads everything except the manual items marked below.

| Source | What we use | Licence / terms | Cite | Status |
|---|---|---|---|---|
| **M2OR** (GitHub snapshot `M2OR_20230428.csv`, github.com/chemosim-lab/M2OR) | All human OR–molecule experiments; aggregated to pairs with the published Pair-table rules | Apache-2.0 (repository LICENSE) | Lalis et al., *Nucleic Acids Res* 2024, doi:10.1093/nar/gkad886 | Used |
| M2OR website (m2or.chemsensim.fr) | Newer, maintained version | Same authors | as above | **Manual step**: the site is behind a browser check, so scripts cannot download it. To use the current data, export the Experiments table as CSV in a browser and save it in `data/raw/m2or/`; the pipeline then prefers it over the snapshot |
| **HGNC** complete set (genenames.org) | Approved OR gene symbols, previous/alias symbols, locus type, HORDE IDs, UniProt IDs | CC0 | Seal et al., *Nucleic Acids Res* 2023, doi:10.1093/nar/gkac888 | Used (naming authority) |
| **UniProt** REST | Reviewed human ORs (keyword Olfaction, GPCR family 1): accession, length, sequence | CC BY 4.0 | UniProt Consortium, *Nucleic Acids Res* 2025, doi:10.1093/nar/gkae1010 | Used |
| **GPCRdb** REST (`/services/receptorlist/`) | Entry names and classes (O1/O2) for human ORs; residue numbering later | Data and code freely available on GitHub (protwis) | Herrera et al., *Nucleic Acids Res* 2025, doi:10.1093/nar/gkae1065 | Used |
| **AlphaFold DB** API | Predicted model per UniProt accession (entry, version, global pLDDT, mmCIF URL) | CC BY 4.0 | Varadi et al., *Nucleic Acids Res* 2024, doi:10.1093/nar/gkad1011 | Used |
| **RCSB PDB** | 8F76, 8HTI, 8UXV, 8UXY, 8UY0, 8UYQ metadata and coordinates | CC0 (wwPDB) | Primary citation of each entry | Used |
| **PubChem** PUG REST | Names → CID, InChIKey, SMILES, formula for test odorants | Public domain (NCBI); contributor terms may apply to some records | Current PubChem NAR database paper (DOI to be resolved in stage a) | Used |
| **Crossref / DataCite** | Citation metadata for every DOI shown | Metadata CC0 | — | Used |
| **Pyrfume data** (github.com/pyrfume/pyrfume-data) | Repository | MIT | As requested in the pyrfume-data README (DOI to be resolved in stage a) | Used as container |
| ↳ `leffingwell` | Odor labels | **CC BY-NC 4.0** (leffingwell_readme.pdf): research, non-commercial use, attribution | Sanchez-Lengeling et al. 2019; Leffingwell PMP 2001 | Used. **Phase 2 ships the whole set** (3,522 molecules with labels + fingerprints) in `predict_index.json`, as the reference set for descriptor prediction. CC BY-NC permits this for non-commercial research with attribution, which the site gives on every predicted descriptor; a commercial deployment would need to drop it |
| ↳ `dravnieks_1985` | Applicability profiles (% of 146 descriptors) | Atlas © ASTM (DS61); digitised data shared for academic use | Dravnieks, *Atlas of Odor Character Profiles*, 1985, doi:10.1520/DS61-EB | Used (top descriptors only, with attribution) |
| ↳ `keller_2016` | 20 semantic descriptors, intensity, pleasantness | Article and supplement CC BY 4.0 | Keller & Vosshall, *BMC Neurosci* 2016, doi:10.1186/s12868-016-0287-2 | To add in stage (a) |
| ↳ `goodscents` | Odor descriptors | **No licence**: web scrape of The Good Scents Company; Pyrfume makes no copyright claim | — | **Not used** unless approved |
| ↳ `mainland_2015` | Raw OR screen and dose-response | Sci Data article CC BY | Mainland et al., *Sci Data* 2015, doi:10.1038/sdata.2015.2 | Already inside M2OR |
| **HORDE** (genome.weizmann.ac.il/horde) | OR classification | Online; HGNC carries HORDE IDs | — | Linked via HGNC |
| CORD (cordb.net) | Cross-check of pairs | — | — | Offline on 2026-10-07 |
| ORDB (SenseLab) | Cross-check | — | — | Offline on 2026-10-07 |
| OlfactionBase | Cross-check | — | — | HTTP 500 on 2026-10-07 |
| ODORactor | Cross-check | — | — | Online; not used yet |

## Browser libraries that ship with the site

| Library | Used for | Licence | Size |
|---|---|---|---|
| **RDKit.js** (@rdkit/rdkit) | 2D depiction, SMILES validation, Morgan fingerprints of the drawn molecule | BSD-3-Clause | ~7 MB WASM, lazy-loaded |
| **Mol\*** (molstar) | 3D receptor structures | MIT | ~5 MB, lazy-loaded on the receptor card |
| **JSME** (jsme-editor) | Molecule drawing canvas | Free for academic and commercial use (Peter Ertl, Bruno Bienfait) | ~2.6 MB, lazy-loaded on the Draw screen |

The brief named Ketcher for the sketcher; it ships about 33 MB of browser assets
(21 MB JS + 12 MB WASM) against JSME's 2.6 MB, so JSME was used instead. The
editor is isolated in `src/ui/Sketcher.tsx`, so swapping it touches one file.
