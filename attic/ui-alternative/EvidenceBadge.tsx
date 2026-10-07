import type { EvidenceTier } from "../model/evidence";
import { EVIDENCE_LABEL } from "../model/evidence";

export function EvidenceBadge({ tier }: { tier: EvidenceTier | null }) {
  if (!tier) return null;
  return <span className={`badge badge-${tier.replace("–", "-")}`}>{EVIDENCE_LABEL[tier]}</span>;
}

export function Doi({ doi }: { doi: string }) {
  return (
    <a className="mono tiny" href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer">
      {doi}
    </a>
  );
}
