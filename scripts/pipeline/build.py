"""Build data/processed/*.json and print the data summary.

    python -m scripts.pipeline.build            # uses cached downloads
    python -m scripts.pipeline.build --refresh  # re-download sources
"""
from __future__ import annotations

import argparse
import io
import json
import math
from collections import Counter, defaultdict
from contextlib import redirect_stdout
from datetime import date

import pandas as pd

from . import genotypes, m2or, odorants, predict_index, receptors, references, structures, train_model
from .paths import PROCESSED
from .sources import fetch_all

STATUS_ORDER = {"agonist": 0, "inconclusive": 1, "non_agonist": 2}


def _clean(x):
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    return x


def write_json(name: str, payload) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / name).write_text(json.dumps(_clean(payload), ensure_ascii=False, separators=(",", ":")))


def pair_record(p: m2or.Pair, with_receptor: bool = True) -> dict:
    r = dict(status=p.status, quality=p.quality, provenance="measured")
    if with_receptor:
        r["receptor"] = p.gene
    if p.allele != m2or.REF:
        r["allele"] = p.allele
    if p.reason:
        r["reason"] = p.reason
    if p.log_ec50 is not None:
        r["log_ec50"] = p.log_ec50
        r["ec50_values"] = [dict(log_ec50=v, doi=d, rounded=rd) for v, d, rd in p.log_ec50_values]
        if p.ec50_below_assay_range:
            r["ec50_below_assay_range"] = True
    if p.log_ec50_gt is not None:
        r["log_ec50_gt"] = p.log_ec50_gt
    if p.max_conc_um is not None:
        r["max_conc_um"] = p.max_conc_um
    if p.min_resp_um is not None:
        r["min_resp_um"] = p.min_resp_um
    r["n_positive"] = p.n_positive
    r["n_experiments"] = p.n_experiments
    r["dois"] = p.dois
    r["assays"] = p.assays
    return r


def main(refresh: bool = False) -> None:
    fetch_all(refresh=refresh)

    # --- receptors: naming authority and identity --------------------------
    hgnc = receptors.load_hgnc()
    uni = receptors.load_uniprot()
    gpcrdb = receptors.load_gpcrdb()
    mapper = receptors.SymbolMapper(hgnc, uni)

    # --- M2OR -----------------------------------------------------------------
    raw, m2or_file = m2or.load_experiments()
    h = m2or.normalise_human(raw)
    mapping = {}
    for g, grp in h.groupby("gene"):
        ref_rows = grp[grp["allele"] == m2or.REF]
        mapping[g] = mapper.map(g, set(grp["Uniprot ID"].dropna()), set(ref_rows["Sequence"].dropna()))
    h["gene_m2or"] = h["gene"]
    h["gene"] = h["gene"].map(lambda g: mapping[g][0])
    pairs = m2or.aggregate_pairs(h)
    mols = m2or.molecule_table(h)

    ref_pairs = [p for p in pairs if p.allele == m2or.REF]
    by_gene_ref = defaultdict(list)
    for p in ref_pairs:
        by_gene_ref[p.gene].append(p)
    by_key = {(p.gene, p.allele, p.inchikey): p for p in pairs}
    alleles_by_gene = defaultdict(set)
    by_allele = defaultdict(list)
    for p in pairs:
        if p.allele != m2or.REF:
            alleles_by_gene[p.gene].add(p.allele)
            by_allele[(p.gene, p.allele)].append(p)

    # Receptor universe: HGNC protein-coding ORs + any other OR named in M2OR.
    hg = hgnc.set_index("symbol")
    coding = set(hgnc.loc[hgnc["locus_type"] == "gene with protein product", "symbol"])
    universe = sorted(coding | set(by_gene_ref) | set(alleles_by_gene), key=receptors.sort_key)
    uni_by_gene = {g: r for g, r in zip(uni["Gene Names (primary)"], uni.to_dict("records"))}

    accessions = {}
    for s in universe:
        acc = None
        if s in hg.index and isinstance(hg.at[s, "uniprot_ids"], str):
            acc = hg.at[s, "uniprot_ids"].split("|")[0]
        elif s in uni_by_gene:
            acc = uni_by_gene[s]["Entry"]
        else:
            ids = h.loc[h["gene"] == s, "Uniprot ID"].dropna()
            acc = ids.mode().iat[0] if len(ids) else None
        accessions[s] = acc
    uni_len = dict(zip(uni["Entry"], uni["Length"].astype(int)))
    missing = [a for a in set(accessions.values()) if a and a not in uni_len]
    extra = receptors.uniprot_extra(missing)
    af = receptors.alphafold_models(sorted({a for a in accessions.values() if a}))

    # Functional variants seen in M2OR: an allele whose status differs from
    # the reference allele for at least one molecule tested on both.
    def variant_effects(gene: str) -> list[dict]:
        out = []
        for allele in sorted(alleles_by_gene.get(gene, ())):
            diffs = []
            for p in by_allele[(gene, allele)]:
                ref = by_key.get((gene, m2or.REF, p.inchikey))
                if ref and {ref.status, p.status} == {"agonist", "non_agonist"}:
                    diffs.append(dict(inchikey=p.inchikey, name=mols.at[p.inchikey, "name"],
                                      ref=ref.status, variant=p.status))
            if diffs:
                out.append(dict(allele=allele, differs_for=diffs))
        return out

    receptor_rows = []
    for s in universe:
        cls = receptors.classify(s)
        acc = accessions[s]
        gp = gpcrdb.get(acc, {}) if acc else {}
        tested = [p for p in by_gene_ref.get(s, []) if p.status != "inconclusive"]
        agon = sorted((p for p in tested if p.status == "agonist"),
                      key=lambda p: (p.log_ec50 is None, p.log_ec50 or 0))
        locus = hg.at[s, "locus_type"] if s in hg.index else None
        receptor_rows.append(dict(
            gene=s, hgnc_id=hg.at[s, "hgnc_id"] if s in hg.index else None,
            horde_id=hg.at[s, "horde_id"] if s in hg.index else None,
            locus_type=locus, location=hg.at[s, "location"] if s in hg.index else None,
            cls=cls["cls"], family=cls["family"], subfamily=cls["subfamily"],
            uniprot=acc, length=uni_len.get(acc) or extra.get(acc, {}).get("length"),
            gpcrdb=gp.get("entry_name"), gpcrdb_class=gp.get("receptor_class"),
            structure=dict(source="pdb", id=receptors.NATIVE_STRUCTURES[s]) if s in receptors.NATIVE_STRUCTURES
            else (dict(source="alphafold", id=af[acc]["entry"], version=af[acc]["version"], plddt=af[acc]["plddt"],
                       cif=af[acc]["cif"]) if acc in af else None),
            n_tested=len(tested), n_agonists=len(agon), n_inconclusive=sum(p.status == "inconclusive" for p in by_gene_ref.get(s, [])),
            agonists=[dict(inchikey=p.inchikey, name=mols.at[p.inchikey, "name"], quality=p.quality,
                           log_ec50=p.log_ec50, below_assay_range=p.ec50_below_assay_range, dois=p.dois)
                      for p in agon],
            alleles_tested=sorted(alleles_by_gene.get(s, ())),
            functional_variants=variant_effects(s),
            m2or_names=sorted({k for k, v in mapping.items() if v[0] == s}),
        ))

    # --- test odorants -------------------------------------------------------
    leff = odorants.load_leffingwell()
    drav = odorants.load_dravnieks()
    keller = odorants.load_keller()
    m2or_keys = set(mols.index)
    tested_count = Counter(p.inchikey for p in ref_pairs if p.status != "inconclusive")
    odorant_rows, pair_rows, seed_report = [], [], []
    for spec in odorants.SEEDS + odorants.EXTRAS:
        pc = odorants.resolve(spec)
        ik = pc["InChIKey"] if pc else None
        alternatives = sorted((k for k in m2or_keys if ik and k[:14] == ik[:14]),
                              key=lambda k: -tested_count.get(k, 0))
        match = "exact" if ik in m2or_keys else ("skeleton" if alternatives else "none")
        m2or_ik = ik if ik in m2or_keys else (alternatives[0] if alternatives else None)
        rows = sorted((p for p in pairs if p.inchikey == m2or_ik),
                      key=lambda p: (p.allele != m2or.REF, STATUS_ORDER[p.status], p.gene))
        ref_rows = [p for p in rows if p.allele == m2or.REF]
        var_rows = [p for p in rows if p.allele != m2or.REF]
        odorant_rows.append(dict(
            id=spec["id"], name=spec["name"], inchikey=ik, m2or_inchikey=m2or_ik, m2or_match=match,
            m2or_name=mols.at[m2or_ik, "name"] if m2or_ik else None,
            stereo_alternatives_in_m2or=[dict(inchikey=k, name=mols.at[k, "name"], n_tested=tested_count.get(k, 0))
                                         for k in alternatives if k != m2or_ik],
            cid=pc.get("CID") if pc else None, smiles=pc.get("smiles") if pc else None,
            formula=pc.get("MolecularFormula") if pc else None, mw=float(pc["MolecularWeight"]) if pc else None,
            iupac=pc.get("IUPACName") if pc else None,
            descriptors=(odorants.descriptors_for(ik, leff, drav) if ik else [])
            + ([keller[int(pc["CID"])]] if pc and int(pc["CID"]) in keller else []),
            provenance="measured",
        ))
        pair_rows.append(dict(
            odorant=spec["id"],
            pairs=[pair_record(p) for p in ref_rows],
            variant_pairs=[pair_record(p) for p in var_rows],
        ))
        seed_report.append((spec, ik, m2or_ik, match, ref_rows, var_rows, alternatives))

    # --- genotypes and structures ---------------------------------------------
    inchikey_of = {o["id"]: o["m2or_inchikey"] for o in odorant_rows}
    genotype_cases = genotypes.build(h, inchikey_of) + genotypes.build_curated()
    structure_rows = []
    for st in receptors.STRUCTURES:
        row = dict(st)
        if st["pdb"] == "8F76":
            row["contacts"] = structures.ligand_contacts("8F76", "PPI", "o51e2_human")
            row["contacts_note"] = "Heavy atoms within 4 Å of propionate, measured from the deposited 8F76 coordinates."
        row["bundled"] = st["pdb"] in structures.BUNDLED
        structure_rows.append(row)
    structures.bundle()

    # --- references ----------------------------------------------------------
    dois = set(references.LITERATURE)
    for pr in pair_rows:
        for p in pr["pairs"] + pr["variant_pairs"]:
            dois.update(p["dois"])
    for r in receptor_rows:
        for a in r["agonists"]:
            dois.update(a["dois"])
    for s in receptors.STRUCTURES:
        dois.add(s["doi"])
    for c in genotype_cases:
        dois.update({c["doi"], c["expression"]["doi"]} | ({c["conflict"]["doi"]} if c["conflict"] else set()))
    refs = [dict(references.lookup(d), cited_for=references.LITERATURE.get(d)) for d in sorted(dois)]
    refs += [dict(r, resolved="manual") for r in references.NON_DOI]

    # --- Phase 2 prediction index --------------------------------------------
    pindex, pblob = predict_index.build(h, pairs, mols)
    pindex = predict_index.with_evaluation(pindex, pblob)
    predict_index.write(pindex, pblob)
    model = train_model.train(pindex, pblob)
    train_model.write(model)
    write_json("prediction_summary.json", dict(
        meta=dict(built=date.today().isoformat()),
        neighbours=dict(
            reference_molecules=pindex["receptors"]["count"],
            descriptor_molecules=pindex["descriptors"]["count"],
            fingerprint=dict(radius=pindex["fingerprint"]["radius"], n_bits=pindex["fingerprint"]["n_bits"],
                             chirality=pindex["fingerprint"]["chirality"]),
            **(pindex.get("evaluation") or {}),
        ),
        model={k: v for k, v in model["evaluation"].items() if k != "per_receptor"}
        | dict(trained=len(model["receptors"]),
               best_receptor=max(model["receptors"], key=lambda r: r["auc"])["receptor"],
               best_auc=max(r["auc"] for r in model["receptors"])),
    ))

    meta = dict(built=date.today().isoformat(), m2or_file=m2or_file,
                filters="Homo sapiens; single compounds (M2OR 'mono' or 'sum of isomers'); M2OR Pair-table consensus rules",
                untested="Any receptor in receptors.json that is not listed for an odorant has not been tested with it.")
    write_json("receptors.json", dict(meta=meta, receptors=receptor_rows, structures=structure_rows))
    write_json("genotypes.json", dict(meta=meta, cases=genotype_cases))
    write_json("odorants.json", dict(meta=meta, odorants=odorant_rows))
    write_json("pairs.json", dict(meta=meta, odorants=pair_rows))
    write_json("references.json", dict(meta=meta, references=refs))

    # --- summary -------------------------------------------------------------
    buf = io.StringIO()
    with redirect_stdout(buf):
        print_summary(h, pairs, ref_pairs, mapping, coding, receptor_rows, seed_report, refs, m2or_file)
        print("\nGENOTYPE CASES (alleles compared within one paper)")
        print("\n".join(genotypes.check(genotype_cases)))
        print("\nPREDICTION INDEX (Phase 2 nearest-neighbour baseline)")
        print("\n".join(predict_index.summary(pindex, pblob)))
        print("\nLEARNED MODEL (per-receptor logistic regression)")
        print("\n".join(train_model.summary(model)))
        c8 = next(r for r in structure_rows if r["pdb"] == "8F76")["contacts"]
        print("\n8F76 propionate contacts (≤ 4 Å): " + ", ".join(
            f"{c['residue'].title()}{c['number']}{('(' + c['generic_number'] + ')') if c['generic_number'] else ''}"
            f" {c['distance']} Å" for c in c8))
    text = buf.getvalue()
    print(text)
    (PROCESSED / "summary.txt").write_text(text)


def _fmt_ec50(p: m2or.Pair) -> str:
    if p.log_ec50 is not None:
        um = 10 ** p.log_ec50 * 1e6
        rounded = any(rd for _, _, rd in p.log_ec50_values)
        return f"EC50 {um:,.3g} µM" + (" (±0.5 log, rounded)" if rounded and len(p.log_ec50_values) == 1 else "")
    if p.log_ec50_gt is not None:
        return f"EC50 > {10 ** p.log_ec50_gt * 1e6:,.3g} µM"
    return ""


def print_summary(h, pairs, ref_pairs, mapping, coding, receptor_rows, seed_report, refs, m2or_file):
    line = "-" * 78
    print(line)
    print(f"DATA SUMMARY  (M2OR file: {m2or_file}; built {date.today().isoformat()})")
    print(line)
    print(f"Human single-compound experiments: {len(h):,}  ->  consensus pairs: {len(pairs):,} "
          f"(reference alleles {len(ref_pairs):,}, variant alleles {len(pairs) - len(ref_pairs):,})")
    st = Counter(p.status for p in ref_pairs)
    q = Counter((p.status, p.quality) for p in ref_pairs)
    print(f"Reference-allele pairs: agonist {st['agonist']:,} | non-agonist {st['non_agonist']:,} | inconclusive {st['inconclusive']:,}")
    print("   agonists by evidence: " + ", ".join(f"{k[1]} {v}" for k, v in sorted(q.items()) if k[0] == "agonist"))
    with_ag = {p.gene for p in ref_pairs if p.status == "agonist"}
    tested = {p.gene for p in ref_pairs if p.status != "inconclusive"}
    print(f"HGNC protein-coding human OR genes: {len(coding)}")
    print(f"Human ORs tested in M2OR (reference allele): {len(tested)}  |  with >= 1 agonist: {len(with_ag)} "
          f"({len(with_ag & coding)} of them protein-coding in HGNC)")
    ec_ref = [p for p in ref_pairs if p.log_ec50 is not None]
    ec_all = [p for p in pairs if p.log_ec50 is not None]
    rounded = sum(all(rd for _, _, rd in p.log_ec50_values) for p in ec_ref)
    below = [p for p in ec_ref if p.ec50_below_assay_range]
    print(f"Pairs with a numeric EC50: {len(ec_ref)} reference-allele ({rounded} only from Mainland 2015 whole-log values), "
          f"{len(ec_all)} incl. variant alleles; censored (EC50 > x): {sum(p.log_ec50_gt is not None for p in ref_pairs)}")
    if below:
        print(f"   flagged: {len(below)} EC50 values fitted below {10 ** m2or.ASSAY_FLOOR_LOG * 1e9:.0f} nM, i.e. below the range these "
              f"assays test ({', '.join(sorted({p.gene for p in below}))}; sources: "
              f"{', '.join(sorted({d for p in below for d in p.dois}))})")
    how = Counter(v[1] for v in mapping.values())
    print(f"M2OR gene names -> HGNC symbols: {dict(how)}")
    unm = sorted(k for k, v in mapping.items() if v[1] == "unmapped")
    if unm:
        print(f"   unmapped (kept as-is): {', '.join(unm)}")

    print(line)
    print("TEST ODORANTS  (reference alleles; claimed = receptor named in the brief)")
    print(line)
    for spec, ik, m2or_ik, match, ref_rows, var_rows, alts in seed_report:
        ag = [p for p in ref_rows if p.status == "agonist"]
        n_t = sum(p.status != "inconclusive" for p in ref_rows)
        n_inc = sum(p.status == "inconclusive" for p in ref_rows)
        print(f"\n{spec['name']}  [{ik}]")
        if match != "exact":
            print(f"   M2OR match: {match} -> {m2or_ik}")
        others = [a for a in alts if a != m2or_ik]
        for a in others:
            arows = [p for p in ref_pairs if p.inchikey == a]
            ag_a = [p for p in arows if p.status == "agonist"]
            print(f"   other stereo form in M2OR: {a}  tested on {sum(p.status != 'inconclusive' for p in arows)}, "
                  f"agonists: {', '.join(f'{p.gene} ({p.quality}{(', ' + _fmt_ec50(p)) if _fmt_ec50(p) else ''})' for p in ag_a) or 'none'}")
        print(f"   tested on {n_t} receptors, {len(ag)} agonists" + (f", {n_inc} inconclusive" if n_inc else ""))
        for p in ag:
            print(f"     + {p.gene:9s} {p.quality:19s} {_fmt_ec50(p):34s} {'; '.join(p.dois)[:60]}")
        for c in spec["claimed"]:
            hit = next((p for p in ref_rows if p.gene == c), None)
            vhit = [p for p in var_rows if p.gene == c]
            verdict = ("CONFIRMED agonist" if hit and hit.status == "agonist" else
                       f"in data but {hit.status}" if hit else
                       ("only variant alleles tested: " + ", ".join(f"{p.allele}={p.status}" for p in vhit)) if vhit else
                       "NOT in M2OR for this molecule")
            print(f"   claim {c}: {verdict}")
        vag = [p for p in var_rows if p.gene in spec["claimed"]]
        if vag:
            print("   variant alleles of claimed receptors: " + "; ".join(
                f"{p.gene}_{p.allele}={p.status} {_fmt_ec50(p)}".strip() for p in vag))

    print("\n" + line)
    print("MOST BROADLY TUNED (reference allele, >= 20 molecules tested)")
    print(line)
    rr = [r for r in receptor_rows if r["n_tested"] >= 20]
    for r in sorted(rr, key=lambda r: -r["n_agonists"])[:12]:
        print(f"   {r['gene']:9s} agonists {r['n_agonists']:3d} / tested {r['n_tested']:4d}")
    for g in ("OR1A1", "OR2W1"):
        r = next(x for x in receptor_rows if x["gene"] == g)
        rank = 1 + sum(x["n_agonists"] > r["n_agonists"] for x in receptor_rows)
        print(f"   {g}: rank {rank} by number of agonists")

    print("\n" + line)
    print("REFERENCES")
    print(line)
    bad = [r for r in refs if not r["resolved"]]
    print(f"{len(refs)} references; unresolved DOIs: {len(bad)} {[r.get('doi') for r in bad]}")
    for r in refs:
        if r.get("cited_for"):
            print(f"   {r.get('doi') or r.get('url'):35s} {str(r['authors'])[:22]:22s} {r['year']}  {str(r['title'])[:70]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    main(**vars(ap.parse_args()))
