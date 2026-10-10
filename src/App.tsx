import { useEffect, useState } from "react";
import { DataContext, loadData, type AppData } from "./data/load";
import { useRoute, type Route } from "./state/router";
import { DrawScreen } from "./screens/DrawScreen";
import { HowItWorks } from "./screens/HowItWorks";
import { BenchmarkScreen } from "./screens/BenchmarkScreen";
import { MixtureScreen } from "./screens/MixtureScreen";
import { OdorantExplorer } from "./screens/OdorantExplorer";
import { ReceptorExplorer } from "./screens/ReceptorExplorer";
import { SimulationScreen } from "./screens/SimulationScreen";
import { StartScreen } from "./screens/StartScreen";
import { ThemeToggle } from "./ui/Controls";
import { useApplyShareLink } from "./ui/ShareLink";

const NAV: { page: Route["page"]; href: string; label: string }[] = [
  { page: "start", href: "#/", label: "Start" },
  { page: "simulate", href: "#/simulate", label: "Simulation" },
  { page: "receptors", href: "#/receptors", label: "Receptors" },
  { page: "odorants", href: "#/odorants", label: "Odorants" },
  { page: "draw", href: "#/draw", label: "Draw a molecule" },
  { page: "mixtures", href: "#/mixtures", label: "Mixtures" },
  { page: "benchmark", href: "#/benchmark", label: "Benchmark" },
  { page: "how", href: "#/how", label: "How this works" },
];

function Page({ route }: { route: Route }) {
  // Inside the provider, so it can validate against the loaded data.
  useApplyShareLink();
  switch (route.page) {
    case "simulate":
      return <SimulationScreen />;
    case "receptors":
      return <ReceptorExplorer gene={route.gene} />;
    case "odorants":
      return <OdorantExplorer id={route.id} />;
    case "draw":
      return <DrawScreen />;
    case "mixtures":
      return <MixtureScreen />;
    case "benchmark":
      return <BenchmarkScreen />;
    case "how":
      return <HowItWorks />;
    default:
      return <StartScreen />;
  }
}

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  useEffect(() => {
    loadData().then(setData, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page]);
  return (
    <>
      <a className="sr-only" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="wordmark" href="#/">
          <strong>ENodorIM</strong>
          <span>olfactory receptor simulator</span>
        </a>
        <nav className="site-nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.page} href={n.href} aria-current={route.page === n.page ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <ThemeToggle />
      </header>
      <main id="main">
        {error && (
          <div className="panel">
            <h2>Data could not be loaded</h2>
            <p className="small">{error}. Run <span className="mono">npm run assets</span> (or the data pipeline) and reload.</p>
          </div>
        )}
        {!data && !error && <p className="muted">Loading receptor data…</p>}
        {data && (
          <DataContext.Provider value={data}>
            <Page route={route} />
          </DataContext.Provider>
        )}
      </main>

    </>
  );
}
