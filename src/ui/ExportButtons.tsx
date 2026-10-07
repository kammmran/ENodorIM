import { useData } from "../data/load";
import { download, slug, toCSV, toJSON, type ExportMeta } from "../model/export";
import type { ReceptorActivation } from "../model/stimulus";

/**
 * Download the current receptor activation pattern. Offered wherever the site
 * computes one, so a result can be taken into a spreadsheet or a notebook
 * instead of being read off the screen.
 */
export function ExportButtons({
  acts,
  meta,
}: {
  acts: ReceptorActivation[];
  meta: Omit<ExportMeta, "dataBuilt" | "m2orFile" | "siteUrl">;
}) {
  const data = useData();
  const full: ExportMeta = {
    ...meta,
    dataBuilt: data.meta.built,
    m2orFile: data.meta.m2or_file,
    siteUrl: window.location.href,
  };
  const base = `${slug(meta.stimulus)}-receptors`;
  const tested = acts.filter((a) => a.state !== "untested").length;
  const responding = acts.filter((a) => a.a > 0).length;
  return (
    <div className="export-row">
      <span className="tiny muted">
        Export {acts.length} receptors ({tested} with data, {responding} responding):
      </span>
      <button className="btn btn-small" onClick={() => download(`${base}.csv`, toCSV(acts, full), "text/csv")}>
        CSV
      </button>
      <button className="btn btn-small" onClick={() => download(`${base}.json`, toJSON(acts, full), "application/json")}>
        JSON
      </button>
    </div>
  );
}
