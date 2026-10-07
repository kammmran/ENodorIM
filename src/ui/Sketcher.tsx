import { useEffect, useId, useRef, useState } from "react";

// Structure drawing canvas, lazy-loaded (JSME, 3.6 MB, academic/commercial free).
//
// The brief named Ketcher; JSME does the same job here for about a tenth of
// Ketcher's ~33 MB of browser assets, which matters for a tool people open
// once out of curiosity. The editor is isolated behind this component, so
// swapping it later touches only this file.

interface JSMEInstance {
  smiles(): string;
  readGenericMolecularInput(input: string): void;
  setCallBack(event: string, fn: () => void): void;
  setOptions(opts: string): void;
}
interface JSApplet {
  JSME: new (id: string, width: string, height: string, options?: Record<string, string>) => JSMEInstance;
}
declare global {
  interface Window {
    JSApplet?: JSApplet;
    jsmeOnLoad?: () => void;
  }
}

let jsme: Promise<JSApplet> | null = null;

function loadJSME(): Promise<JSApplet> {
  if (!jsme) {
    jsme = new Promise<JSApplet>((resolve, reject) => {
      if (window.JSApplet) return resolve(window.JSApplet);
      // JSME calls this global once its GWT modules have finished loading.
      window.jsmeOnLoad = () => (window.JSApplet ? resolve(window.JSApplet) : reject(new Error("JSME loaded without JSApplet")));
      const s = document.createElement("script");
      s.src = `${import.meta.env.BASE_URL}vendor/jsme/jsme.nocache.js`;
      s.async = true;
      s.onerror = () => reject(new Error("JSME could not be loaded"));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error("JSME timed out")), 20000);
    });
  }
  return jsme;
}

export function Sketcher({ smiles, onChange }: { smiles: string; onChange: (smiles: string) => void }) {
  const id = `jsme-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef(smiles);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    loadJSME()
      .then((JSApplet) => {
        if (disposed || !document.getElementById(id)) return;
        const ed = new JSApplet.JSME(id, "100%", "330px", {
          options: "newlook,noexportSVG,nopaste,star,norbutton",
        });
        if (initial.current.trim()) {
          try {
            ed.readGenericMolecularInput(initial.current);
          } catch {
            /* an unreadable starting structure just leaves the canvas empty */
          }
        }
        ed.setCallBack("AfterStructureModified", () => {
          try {
            onChangeRef.current(ed.smiles() ?? "");
          } catch {
            /* mid-edit states can fail to serialise; wait for the next change */
          }
        });
        if (!disposed) setStatus("ready");
      })
      .catch(() => !disposed && setStatus("error"));
    return () => {
      disposed = true;
      const host = document.getElementById(id);
      if (host) host.innerHTML = "";
    };
    // Mounted once: later SMILES changes come from this editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="field">
      <span className="label">Draw the structure</span>
      <div className="sketcher" aria-label="Molecule drawing canvas">
        {/* JSME owns this element's contents; React must never render children
            into it, or reconciliation wipes the editor's DOM. */}
        <div className="sketcher-canvas" id={id} />
        {status !== "ready" && (
          <div className="placeholder">
            {status === "loading" ? "Loading the editor…" : "The drawing editor could not load. Use the SMILES box instead."}
          </div>
        )}
      </div>
      <span className="hint">
        Draw with the mouse; the prediction updates as you edit. Switch to “Paste SMILES” to type a structure instead.
      </span>
    </div>
  );
}
