# attic/

Not part of the build (outside `tsconfig.json`'s `include`).

## ui-alternative/

Six components from an alternative implementation that appeared in `src/ui/`
during the first build session, alongside a different `src/data/load.ts`
(`loadDataset`/`Dataset`) and `src/state/store.ts` (`useApp`).

They were unreachable from `src/main.tsx` and referenced exports the restored
store does not have (`CONC_MIN`, `CONC_MAX`, `Dataset`), so `npm run build`
failed while they sat in `src/`. Nothing was deleted; they are kept here.

The equivalents in use are:

| attic file | in use |
|---|---|
| `Barcode.tsx`, `Legend.tsx` | `src/ui/ReceptorGrid.tsx` (`ReceptorGrid`, `GridLegend`) |
| `ConcSlider.tsx` | `src/ui/Controls.tsx` (`ConcentrationSlider`) |
| `DoseResponse.tsx` | `src/ui/Plots.tsx` (`DoseResponse`) |
| `ReceptorCard.tsx` | `src/screens/ReceptorExplorer.tsx` (`ReceptorCard`) |
| `EvidenceBadge.tsx` | `EVIDENCE_LABEL` used inline in grid tooltips and the receptor card |

Delete this folder once you have decided you do not want the alternative.
