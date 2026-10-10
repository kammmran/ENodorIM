// Lazy loader for the model benchmark (scripts/pipeline/benchmark_models.py).
//
// Only the benchmark page needs it, and it carries per-receptor results for
// every family, so it is fetched on demand rather than with the core data.

import type { ModelBenchmark } from "./types";

let cached: Promise<ModelBenchmark> | null = null;

export function loadBenchmark(): Promise<ModelBenchmark> {
  if (!cached) {
    const url = new URL("data/model_benchmark.json", document.baseURI).href;
    cached = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`model_benchmark.json (${r.status})`);
      return r.json() as Promise<ModelBenchmark>;
    });
    cached.catch(() => {
      cached = null; // let a later visit retry
    });
  }
  return cached;
}

/** The shipped configuration is the reference every other family is compared to. */
export const SHIPPED = "shipped";

export function familyResult(r: ModelBenchmark["per_receptor"][number], family: string) {
  return r.results.find((x) => x.family === family);
}
