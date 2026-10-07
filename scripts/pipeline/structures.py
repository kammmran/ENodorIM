"""Experimental structure files and ligand contacts computed from coordinates.

Contacts are measured from the deposited model (heavy atoms within 4 Å of
the ligand), so the site states what the coordinates show rather than
paraphrasing a paper. GPCRdb supplies the generic residue numbers.
"""
from __future__ import annotations

import shutil

import gemmi

from .paths import RAW, ROOT
from .sources import cached_json, download

PDB_DIR = RAW / "pdb"
PUBLIC_STRUCTURES = ROOT / "public" / "structures"
BUNDLED = ["8F76"]  # shipped with the site; the others load from RCSB on demand


def ligand_contacts(pdb_id: str, ligand: str, gpcrdb_entry: str | None, cutoff: float = 4.0) -> list[dict]:
    path = download(f"https://files.rcsb.org/download/{pdb_id}.cif", PDB_DIR / f"{pdb_id}.cif")
    st = gemmi.read_structure(str(path))
    model = st[0]
    ns = gemmi.NeighborSearch(model, st.cell, 5).populate()
    generic = {}
    if gpcrdb_entry:
        for r in cached_json(f"https://gpcrdb.org/services/residues/{gpcrdb_entry}/") or []:
            generic[r["sequence_number"]] = (r["protein_segment"], r.get("display_generic_number"))
    contacts: dict = {}
    for chain in model:
        for res in chain:
            if res.name != ligand:
                continue
            for atom in res:
                for mark in ns.find_atoms(atom.pos, "\0", radius=cutoff):
                    cra = mark.to_cra(model)
                    if cra.residue.name == ligand or cra.atom.element.name == "H":
                        continue
                    d = cra.atom.pos.dist(atom.pos)
                    key = (cra.chain.name, cra.residue.name, cra.residue.seqid.num)
                    best = contacts.get(key)
                    if best is None or d < best["distance"]:
                        contacts[key] = dict(chain=key[0], residue=key[1], number=key[2], distance=round(d, 2),
                                             ligand_atom=atom.name, residue_atom=cra.atom.name)
    out = sorted(contacts.values(), key=lambda c: c["distance"])
    for c in out:
        seg, gn = generic.get(c["number"], (None, None))
        c["segment"], c["generic_number"] = seg, gn
        polar = c["ligand_atom"].startswith("O") and c["residue_atom"][0] in "NO"
        c["kind"] = ("salt bridge / H-bond" if c["residue"] in ("ARG", "LYS") and polar and c["distance"] <= 3.5
                     else "H-bond" if polar and c["distance"] <= 3.3 else "packing")
    return out


def bundle() -> None:
    PUBLIC_STRUCTURES.mkdir(parents=True, exist_ok=True)
    for pdb_id in BUNDLED:
        src = download(f"https://files.rcsb.org/download/{pdb_id}.cif", PDB_DIR / f"{pdb_id}.cif")
        shutil.copyfile(src, PUBLIC_STRUCTURES / f"{pdb_id}.cif")
