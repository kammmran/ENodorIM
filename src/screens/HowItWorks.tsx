import { useData } from "../data/load";
import { CENSORED_LEVEL, QUALITATIVE_LEVEL } from "../model/activation";
import { RELIABLE_AUC } from "../model/learned";
import { MODIFIERS } from "../model/modifiers";
import { MIN_SUPPORT, SCORE_THRESHOLD } from "../model/predict";
import { CORTEX_HALF, DETECTION_THRESHOLD } from "../model/simulation";
import { PARAMS } from "../model/transduction";
import { Cite, Prov } from "../ui/Refs";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function HowItWorks() {
  const data = useData();
  const coding = data.receptors.filter((r) => r.locus_type === "gene with protein product").length;
  const withAgonist = data.receptors.filter((r) => r.n_agonists > 0).length;
  const tested = data.receptors.filter((r) => r.n_tested > 0).length;
  const { neighbours: nn, model } = data.prediction;
  const refs = [...data.references].sort(
    (a, b) => (a.authors ?? "").localeCompare(b.authors ?? "") || (a.year ?? 0) - (b.year ?? 0),
  );

  return (
    <div className="prose">
      <h1>How this works</h1>
      <p>
        The simulation follows an odorant through three stages — olfactory GPCRs as the initiating event, neuronal
        integration, and decoding into conscious perception. Only the receptor step is driven by measured receptor data;
        every later stage shows what that pattern leads to. Every value on the site is labelled{" "}
        <Prov kind="measured" />, <Prov kind="predicted" /> or <Prov kind="schematic" />, and nothing is shown without a
        source.
      </p>

      <h2>Where the data comes from</h2>
      <ul>
        <li>
          <strong>Receptor–odorant pairs</strong> come from M2OR (<Cite doi="10.1093/nar/gkad886" />), file{" "}
          <span className="mono">{data.meta.m2or_file}</span> (Apache-2.0), filtered to <em>Homo sapiens</em> and single
          compounds. Many experiments are combined into one result per pair using M2OR's published rules: dose–response
          beats screening, and contradictory results leave a pair <em>inconclusive</em> — shown as “results disagree”
          rather than quietly dropped.
        </li>
        <li>
          <strong>Receptors:</strong> {data.receptors.length} names, of which {coding} are protein-coding OR genes in HGNC
          (<Cite doi="10.1093/nar/gkac888" />). {tested} have been tested with at least one molecule and {withAgonist} have
          at least one known agonist. M2OR spells the same gene several ways, so every name is mapped to an HGNC symbol by
          symbol, alias, UniProt accession, then sequence. Natural haplotypes (OR7D4 WM and the like) are kept as separate
          alleles rather than merged into the gene.
        </li>
        <li>
          <strong>Structures:</strong> experimental cryo-EM structures from RCSB PDB (8F76 for OR51E2), otherwise AlphaFold
          DB models clearly labelled predicted (<Cite doi="10.1093/nar/gkad1011" />). Binding-pocket contacts are measured
          from the deposited coordinates rather than paraphrased from a paper; generic residue numbers come from GPCRdb (
          <Cite doi="10.1093/nar/gkae1065" />).
        </li>
        <li>
          <strong>Percepts:</strong> Leffingwell expert labels (CC BY-NC), Dravnieks' atlas (1985) and Keller &amp;
          Vosshall 2016 panel ratings (<Cite doi="10.1186/s12868-016-0287-2" />), matched by exact InChIKey — a different
          stereoisomer is never substituted, because enantiomers can smell different. The Good Scents Company data were not
          used, having no licence.
        </li>
      </ul>

      <h2>The simulation</h2>

      <h3>
        Receptor activation <Prov kind="measured" />
      </h3>
      <p>
        With a measured EC50: <span className="mono">a = C / (EC50 + C)</span>, a Hill curve with coefficient 1, since M2OR
        gives no Hill coefficients. Where several papers report an EC50 the median is used and all values are listed.
        Agonists known only from screening switch on at a fixed qualitative level ({QUALITATIVE_LEVEL}) at and above the
        lowest concentration that gave a response; an EC50 fitted above the tested range gives {CENSORED_LEVEL}. Mark size
        in the barcode encodes the evidence behind each agonist: dose–response, confirmed screening, or a single screening
        hit.
      </p>

      <h3>
        Sensory neuron <Prov kind="schematic" />
      </h3>
      <p>
        Five coupled equations: receptor drive → Gαolf and adenylyl cyclase III (τ = {PARAMS.tauG} ms) → cAMP (synthesis,
        PDE1C breakdown) → CNG channel opening (Hill {PARAMS.h}, sensitivity lowered by Ca²⁺–calmodulin, τ ={" "}
        {PARAMS.tauCaM} ms) → Ca²⁺ (NCKX4 extrusion, τ = {PARAMS.tauCa} ms) → ANO2 chloride current, carrying up to{" "}
        {Math.round((PARAMS.gCl / (PARAMS.gCl + 1)) * 100)}% of the receptor current → depolarisation → firing up to{" "}
        {PARAMS.fMax} Hz. The shapes — delay, amplification, adaptation, termination — follow{" "}
        <Cite doi="10.1085/jgp.201110645" />; the parameter values are illustrative, not fitted to any recording.
      </p>

      <h3>
        Olfactory bulb <Prov kind="schematic" />
      </h3>
      <p>
        One glomerulus per receptor type receives that neuron type's mean firing rate, and lateral inhibition subtracts a
        weighted surround to sharpen the pattern. The layout is not anatomical: which human receptor maps to which
        glomerulus is unknown, and humans have more than 5,500 glomeruli per bulb, roughly 16 per receptor type (
        <Cite doi="10.1371/journal.pone.0002640" />).
      </p>

      <h3>
        Cortex and perception <Prov kind="schematic" />
      </h3>
      <p>
        Region brightness follows the total bulb output (half-saturation {CORTEX_HALF}); detection compares total neuron
        drive against a threshold of {DETECTION_THRESHOLD}. These are explanatory outputs, not measured activity. The words
        shown as the percept always come from human perception datasets and are never computed from the animation.
      </p>

      <h2>Who is smelling</h2>
      <p>
        Every multiplier lives in one file, <span className="mono">src/model/modifiers.ts</span>, each with its source and a
        comment explaining the value. Only receptor genotype changes receptor activation, and it does so using allele data
        measured within a single paper, so a genotype effect is never confounded with differences between laboratories.
        Age applies one small, clearly illustrative shift <em>after</em> the receptor stage, to regions named in the study
        it comes from. The receptor step itself is identical for everyone with the same genotype.
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Level</th>
            <th>Finding</th>
            <th>Applied as</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {MODIFIERS.map((m) => (
            <tr key={m.id}>
              <td>{m.level}</td>
              <td>
                {m.finding}
                <div className="tiny muted">{m.evidence}</div>
              </td>
              <td className="tiny">
                <Prov kind={m.kind} /> {m.comment}
              </td>
              <td className="tiny">{m.doi ? <Cite doi={m.doi} /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>
        Predicting a molecule nobody has measured <Prov kind="predicted" />
      </h2>
      <p>
        The <a href="#/draw">Draw a molecule</a> screen predicts receptors and odor words for a structure with no
        measurements. The molecule is fingerprinted in the browser — Morgan, radius {nn.fingerprint.radius},{" "}
        {nn.fingerprint.n_bits} bits, <strong>chirality included</strong>, because the measured data show enantiomers
        activating receptors differently and a predictor that treated (R)- and (S)-carvone as one molecule would contradict
        the site's own pairs. Python and the browser produce bit-identical fingerprints, so the reference set is
        precomputed and only the query molecule is fingerprinted at run time.
      </p>
      <p>
        Two methods run side by side, and the site shows both rather than presenting one as the answer.
      </p>
      <h3>Nearest neighbours</h3>
      <p>
        Tanimoto similarity against {nn.reference_molecules} measured molecules from M2OR. A receptor's score is the
        similarity-weighted share of similar molecules that respond, <em>counting only those actually tested on it</em> — so
        a receptor nobody tested stays unknown instead of being predicted negative. A receptor appears only when neighbours
        carrying at least {MIN_SUPPORT.toFixed(1)} summed similarity were tested on it, and is called a responder above a
        score of {SCORE_THRESHOLD}. Odor words come the same way, from {nn.descriptor_molecules} molecules with expert
        labels. Every prediction lists the molecules it came from.
      </p>
      <p>
        Holding out each of the {nn.molecules_scored} reference molecules with enough ground truth and scoring only the
        receptors it was really tested on: the top-ranked receptor is a true agonist for{" "}
        <strong>{pct(nn.top1_accuracy)}</strong> of molecules (n = {nn.top1_n}), with precision {nn.precision.toFixed(2)}{" "}
        and recall {nn.recall.toFixed(2)}.
      </p>
      <h3>A learned model</h3>
      <p>
        A per-receptor L2 logistic regression on fingerprint bits, trained for the {model.trained} receptors with enough
        measured molecules on both sides. It is cross-validated against the neighbour baseline on{" "}
        <strong>identical folds</strong> ({model.scheme}):
      </p>
      <table className="data">
        <thead>
          <tr>
            <th>Across {model.receptors} receptors</th>
            <th className="num">Learned model</th>
            <th className="num">Nearest neighbours</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Mean ROC-AUC</td>
            <td className="num">{model.mean_model_auc.toFixed(3)}</td>
            <td className="num">{model.mean_knn_auc.toFixed(3)}</td>
          </tr>
          <tr>
            <td>Mean average precision</td>
            <td className="num">{model.mean_model_ap.toFixed(3)}</td>
            <td className="num">{model.mean_knn_ap.toFixed(3)}</td>
          </tr>
          <tr>
            <td>Better on</td>
            <td className="num">{model.model_better} receptors</td>
            <td className="num">{model.knn_better} receptors</td>
          </tr>
        </tbody>
      </table>
      <p>
        The learned model is only marginally ahead. Random forests, extra trees, SVMs and four regularisation strengths all
        landed within 0.01 AUC of each other, so on this dataset the limit is the data, not the algorithm — which is why the
        comparison is published here instead of quietly claiming a win.
      </p>
      <p>
        What varies enormously is the <em>receptor</em>. The best model reaches AUC {model.best_auc.toFixed(2)} for{" "}
        <a href={`#/receptors/${model.best_receptor}`} className="mono">
          {model.best_receptor}
        </a>
        , while several sit at chance. A single headline number would hide that, so every prediction carries its own
        receptor's cross-validated AUC, values below {RELIABLE_AUC} are marked unreliable, and the simulation uses the
        learned score only above that line.
      </p>
      <p>
        The planned replacement is a learned model with more capacity — a graph neural network with a protein language
        model for receptors (
        <a href="https://openreview.net/forum?id=q9VherQJd8_" target="_blank" rel="noreferrer">
          Hladiš et al. 2023
        </a>
        ) and OpenPOM for odor descriptors — behind the same interface. On the evidence above, more data would help it more
        than a better architecture will.
      </p>

      <h2>
        Mixtures <Prov kind="schematic" />
      </h2>
      <p>
        On the <a href="#/mixtures">mixtures</a> screen, components compete for the same binding site on each receptor. For
        agonists of equal efficacy at concentrations C<sub>i</sub> with potencies EC50<sub>i</sub>, the response is
        Σ(C<sub>i</sub>/EC50<sub>i</sub>) / (1 + Σ(C<sub>i</sub>/EC50<sub>i</sub>)). Writing C<sub>i</sub> = f<sub>i</sub>·C
        turns that into an ordinary Hill curve with an effective EC50<sub>mix</sub> = 1 / Σ(f<sub>i</sub>/EC50<sub>i</sub>),
        so a mixture collapses to a single stimulus and every later stage runs on it unchanged.
      </p>
      <p>Two consequences are worth seeing on screen:</p>
      <ul>
        <li>
          At a fixed <em>total</em> concentration a mixture is never more potent than its best single component, because
          adding a weaker partner dilutes the stronger one.
        </li>
        <li>
          A component's share of a receptor's drive follows its potency there, not its share of the mixture. In a 1:1:1
          mixture of the two carvone enantiomers and guaiacol, the (R) form supplies about 90% of the drive at OR1A1 while
          the (S) form supplies about 80% at OR2W1.
        </li>
      </ul>

      <h2>Limits</h2>
      <ul>
        <li>
          Receptor–odorant data come from cell-based assays (HEK293T, Hana3A and others, with luciferase, cAMP or Ca²⁺
          read-outs). They show which receptors <em>can</em> respond, not what happens in a living nose.
        </li>
        <li>Most human receptors have no known ligand. “Not tested” is not “does not respond”; the site shows them separately.</li>
        <li>Assay concentrations are not concentrations in air or nasal mucus.</li>
        <li>Transduction details and timings are mostly from rodent and amphibian neurons.</li>
        <li>The glomerular map, region activity levels and the person-related shifts after the receptor stage are schematic or illustrative.</li>
        <li>Mainland et al. 2015 EC50 values are whole-log values (±0.5 log), and are flagged wherever shown.</li>
        <li>
          Nine EC50 values for OR51E2 are fitted below 1 nM, under the range those assays test; they are kept but marked,
          because they are extrapolations of a curve fit rather than measured potencies.
        </li>
        <li>
          Predictions are a similarity baseline and a small linear model, useful for ranking and weak at recall. Treat the
          top of a predicted list as a hypothesis worth testing, not a result.
        </li>
        <li>
          The mixture model only ever lets a receptor respond <em>more</em> as components are added. Real mixtures show
          suppression and masking, at the receptor and further along, and can smell of something no component smells of.
          None of that is modelled, and the blended words are a weighted display of the components' own reported words, not
          a prediction of how the mixture is perceived.
        </li>
      </ul>

      <h2>References</h2>
      <ol className="refs">
        {refs.map((r) => (
          <li key={r.doi ?? r.id}>
            {r.authors} ({r.year}). {r.title}. <em>{r.journal}</em>
            {r.volume ? ` ${r.volume}` : ""}
            {r.page ? `:${r.page}` : ""}.{" "}
            {r.doi ? (
              <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
                doi:{r.doi}
              </a>
            ) : (
              r.url && (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.url}
                </a>
              )
            )}
            {r.cited_for && <span className="muted"> — {r.cited_for}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
