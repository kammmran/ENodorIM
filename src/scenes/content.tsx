import type { ReactNode } from "react";
import { Cite } from "../ui/Refs";
import type { StageId } from "../model/timeline";

// Plain-language caption, time scale and details for each stage. Every
// number here has a source; model choices are labelled schematic.

export interface StageText {
  caption: ReactNode;
  timescale: ReactNode;
  details: ReactNode;
}

const RZ = "10.1085/jgp.201110645";

export const STAGE_TEXT: Record<StageId, StageText> = {
  sniff: {
    caption: (
      <>
        Inhaled air carries odorant molecules to the <strong>olfactory epithelium</strong> at the roof of the nasal cavity, where they
        dissolve in the mucus.
      </>
    ),
    timescale: (
      <>
        Breathing at rest is 2–3 Hz; sniffing reaches up to 10 Hz (rodents; <Cite doi={RZ} />).
      </>
    ),
    details: (
      <ul>
        <li>The flow lines and the share of molecules reaching the epithelium are drawn schematically.</li>
        <li>
          The concentration control sets the <em>assay</em> concentration used in cell-based receptor experiments. Concentrations in air or
          in the nasal mucus are not known for these data.
        </li>
      </ul>
    ),
  },
  binding: {
    caption: (
      <>
        The odorant binds <strong>odorant receptors</strong> (class A GPCRs) on the cilia of olfactory sensory neurons. Each receptor
        that responds is shown in colour; its strength is the activation <em>a</em> calculated from measured data.
      </>
    ),
    timescale: <>Binding is not resolved in time here (schematic).</>,
    details: (
      <ul>
        <li>
          One odorant activates several receptors, and one receptor responds to several odorants: the smell is encoded by the
          pattern across receptors — the barcode on the right.
        </li>
        <li>
          Humans have about 400 intact odorant receptors (<Cite doi="10.1038/nn.3598" />); HGNC lists 417 protein-coding OR genes (
          <Cite doi="10.1093/nar/gkac888" />).
        </li>
        <li>
          In mice, each sensory neuron expresses one receptor type (<Cite doi="10.1371/journal.pone.0002640" />, summarising rodent
          work), and one allele of it (<Cite doi="10.1016/s0092-8674(94)90562-2" />).
        </li>
        <li>
          Activation: <span className="mono">a = C / (EC50 + C)</span> when an EC50 was measured (Hill coefficient 1). Agonists known
          only from screening get a fixed qualitative level above the lowest concentration that gave a response.
        </li>
        <li>
          Data are from cell-based assays (HEK293T, Hana3A and others, with luciferase, cAMP or Ca²⁺ read-outs). They show which
          receptors <em>can</em> respond, not exactly what happens in a living nose.
        </li>
      </ul>
    ),
  },
  transduction: {
    caption: (
      <>
        The active receptor switches on <strong>Gαolf</strong>, which activates <strong>adenylyl cyclase III</strong>. Rising cAMP
        opens <strong>CNG channels</strong>; Na⁺ and Ca²⁺ flow in. Ca²⁺ opens the <strong>ANO2</strong> chloride channel, and Cl⁻
        leaving the cell amplifies the depolarisation.
      </>
    ),
    timescale: (
      <>
        Response delays can be as short as ~30 ms (isolated mouse neurons; <Cite doi={RZ} />).
      </>
    ),
    details: (
      <ul>
        <li>
          The Cl⁻ current carries up to ~90% of the odorant-induced receptor current (<Cite doi={RZ} />).
        </li>
        <li>
          The olfactory CNG channel is formed by CNGA2 with the auxiliary subunits CNGB1b and CNGA4; the Ca²⁺-activated Cl⁻ channel
          is anoctamin 2 (ANO2, TMEM16B) (<Cite doi={RZ} />).
        </li>
        <li>
          The plots on the right come from a small kinetic model of one neuron driven by the strongest receptor. Its shapes follow
          rodent and amphibian recordings; its parameter values are illustrative (schematic model).
        </li>
      </ul>
    ),
  },
  firing: {
    caption: (
      <>
        Depolarisation triggers <strong>action potentials</strong> that run along the axon to the olfactory bulb. When the odorant is
        gone, <strong>PDE1C</strong> breaks down cAMP and <strong>NCKX4</strong> removes Ca²⁺. Ca²⁺–calmodulin lowers the CNG
        channel's sensitivity to cAMP, which also makes the response adapt during a long stimulus.
      </>
    ),
    timescale: (
      <>
        Firing reaches ~200 Hz at saturating concentrations (isolated mouse neurons; <Cite doi={RZ} />).
      </>
    ),
    details: (
      <ul>
        <li>Higher concentrations give shorter delays and higher firing rates; neurons saturate within about 2 log units above threshold.</li>
        <li>Without NCKX4, response termination is prolonged by up to several seconds (mouse).</li>
        <li>
          The raster shows one model neuron per responding receptor type, each driven by its own activation (schematic). All from{" "}
          <Cite doi={RZ} />.
        </li>
      </ul>
    ),
  },
  bulb: {
    caption: (
      <>
        Axons of neurons with the same receptor converge on <strong>glomeruli</strong> in the olfactory bulb. Mitral and tufted cells
        carry the signal on, and inhibitory interneurons sharpen the pattern (<strong>lateral inhibition</strong>).
      </>
    ),
    timescale: (
      <>
        In humans, olfactory-bulb activity reflects odor valence from about 250 ms after odor onset (<Cite doi="10.1073/pnas.2101209118" />).
      </>
    ),
    details: (
      <ul>
        <li>
          Humans have more than 5,500 glomeruli per bulb, roughly 16 per receptor type (<Cite doi="10.1371/journal.pone.0002640" />). One
          glomerulus per receptor type is drawn.
        </li>
        <li>Which glomerulus belongs to which human receptor is not known, so the layout is schematic.</li>
        <li>Lateral inhibition is modelled as subtraction of a weighted surround; its strength is illustrative.</li>
      </ul>
    ),
  },
  cortex: {
    caption: (
      <>
        The bulb projects <strong>directly</strong> to primary olfactory cortex — the anterior olfactory nucleus, olfactory tubercle,
        frontal and temporal piriform cortex, and parts of the amygdala and entorhinal cortex — with no thalamic relay first.
      </>
    ),
    timescale: <>Region timing is schematic.</>,
    details: (
      <ul>
        <li>
          Definition of human primary olfactory cortex and its direct input from the bulb: <Cite doi="10.7554/elife.47177" />. Unlike other
          senses, olfaction has no pre-cortical thalamic relay.
        </li>
        <li>Brightness follows the total bulb output in the model and is not a measured activity level (schematic).</li>
        <li>
          Older age lowers the brightness of the primary olfactory cortex, insula and hippocampus; the direction comes from
          fMRI (<Cite doi="10.18632/oncotarget.16977" />), the size is illustrative.
        </li>
      </ul>
    ),
  },
  perception: {
    caption: (
      <>
        Primary olfactory cortex connects with networks that include the <strong>orbitofrontal cortex</strong>, <strong>insula</strong>,{" "}
        <strong>hippocampus</strong> and <strong>amygdala</strong>. The words on the right are what people reported in perception studies;
        they are not computed from the simulation.
      </>
    ),
    timescale: (
      <>
        For unpleasant odors, a motor-cortex response appears 300–400 ms after odor onset, linked to early bulb activity, before a fast
        avoidance movement (<Cite doi="10.1073/pnas.2101209118" />).
      </>
    ),
    details: (
      <ul>
        <li>
          Functional connectivity of primary olfactory subregions with orbitofrontal cortex, insula, hippocampus and amygdala:{" "}
          <Cite doi="10.7554/elife.47177" />.
        </li>
        <li>Region brightness is schematic. Detection and appraisal bars are schematic model outputs; their person-related shifts are illustrative.</li>
      </ul>
    ),
  },
};
