import { useEffect, useRef, useState } from "react";
import { useData } from "../data/load";
import { decodeShare, shareUrl, type ShareState } from "../state/shareLink";
import { useStore } from "../state/store";

/**
 * Applies the state carried by an incoming share link.
 *
 * It runs on load *and* on later hash changes, because navigating to a shared
 * link from inside the site only changes the hash — the document is not
 * reloaded, so a once-only guard would silently ignore the link. The query
 * string that was last applied is remembered, so the same link is not
 * re-applied on unrelated route changes and never overrides a control the user
 * has since touched.
 *
 * Only values that exist in the current data are applied: a link naming an
 * odorant or genotype this build does not have leaves the defaults in place
 * rather than emptying the view.
 */
export function useApplyShareLink(): void {
  const data = useData();
  const lastQuery = useRef<string | null>(null);

  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash;
      const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      if (!query || query === lastQuery.current) return;
      lastQuery.current = query;
      applyShareState(decodeShare(hash), data);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [data]);
}

function applyShareState(s: ReturnType<typeof decodeShare>, data: ReturnType<typeof useData>): void {
  const store = useStore.getState();

  if (s.odorantId && data.odorantIndex.has(s.odorantId)) store.setOdorant(s.odorantId);
  if (s.logConc !== undefined) store.setLogConc(s.logConc);

  for (const [caseId, genotype] of Object.entries(s.genotypes ?? {})) {
    const gc = data.genotypeCases.find((c) => c.id === caseId);
    if (gc?.genotypes.some((g) => g.id === genotype)) store.setGenotype(caseId, genotype);
  }

  const parts = (s.mixture ?? []).filter((p) => data.odorantIndex.has(p.id));
  if (parts.length) store.setMixture(parts);
}

/** Copies a link that reproduces the current view. */
export function ShareButton({ path, state, label = "Copy link to this view" }: { path: string; state: ShareState; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = shareUrl(path, state);
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // Clipboard access can be refused; put the link in the address bar so it
      // can still be copied by hand.
      window.location.hash = url.split("#")[1];
    }
  };
  return (
    <button className="btn btn-small" onClick={copy} aria-live="polite">
      {done ? "Link copied" : label}
    </button>
  );
}
