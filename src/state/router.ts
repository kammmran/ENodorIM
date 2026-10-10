import { useSyncExternalStore } from "react";

// Hash routes keep the static build working from any folder.
export type Route =
  | { page: "start" }
  | { page: "simulate" }
  | { page: "receptors"; gene?: string }
  | { page: "odorants"; id?: string }
  | { page: "draw" }
  | { page: "mixtures" }
  | { page: "benchmark" }
  | { page: "how" };

export function parseRoute(hash: string): Route {
  // Shareable links append a query string (see shareLink.ts); it is not part
  // of the path.
  const path = hash.split("?")[0];
  const parts = path.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case "simulate":
      return { page: "simulate" };
    case "receptors":
      return { page: "receptors", gene: parts[1] };
    case "odorants":
      return { page: "odorants", id: parts[1] };
    case "draw":
      return { page: "draw" };
    case "mixtures":
      return { page: "mixtures" };
    case "benchmark":
      return { page: "benchmark" };
    case "how":
      return { page: "how" };
    default:
      return { page: "start" };
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return parseRoute(hash);
}

export function go(path: string) {
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

export const href = (path: string) => `#${path}`;
