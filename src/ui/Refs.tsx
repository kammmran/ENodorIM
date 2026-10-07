import type { Provenance } from "../data/types";
import { useData } from "../data/load";

/** Short "Author year" citation linking to the DOI. */
export function Cite({ doi, children }: { doi: string; children?: React.ReactNode }) {
  const { refIndex } = useData();
  const r = refIndex.get(doi.toLowerCase());
  // Abstract collections have no authors in Crossref; name the venue instead.
  const label = r
    ? r.authors
      ? `${r.authors} ${r.year ?? ""}`.trim()
      : `${r.journal ?? "Source"} ${r.year ?? ""}`.trim()
    : doi;
  const abstract = r?.source_type === "conference abstract";
  return (
    <a
      href={`https://doi.org/${doi}`}
      target="_blank"
      rel="noreferrer"
      title={abstract ? `${r?.title} — conference abstract, not a full paper` : (r?.title ?? doi)}
    >
      {children ?? label}
      {abstract && !children && <span className="muted"> (abstract)</span>}
    </a>
  );
}

export function CiteList({ dois, max = 3 }: { dois: string[]; max?: number }) {
  const shown = dois.slice(0, max);
  return (
    <>
      {shown.map((d, i) => (
        <span key={d}>
          {i > 0 && "; "}
          <Cite doi={d} />
        </span>
      ))}
      {dois.length > max && <span className="muted"> +{dois.length - max}</span>}
    </>
  );
}

export function Prov({ kind }: { kind: Provenance | "illustrative" | "note" }) {
  return <span className={`prov prov-${kind}`}>{kind}</span>;
}
