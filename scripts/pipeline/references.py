"""Citation metadata for every DOI the site shows (Crossref, DataCite fallback)."""
from __future__ import annotations

import re
import urllib.parse

from .sources import cached_json

# Literature the site cites outside the M2OR pairs (brief section 12 and
# data sources). DOIs were resolved with Crossref and their titles checked.
LITERATURE = {
    "10.1093/nar/gkad886": "M2OR database",
    "10.1038/s41586-023-05798-y": "OR51E2–propionate structure (PDB 8F76)",
    "10.1038/s41467-023-43983-9": "OR52 consensus structure (PDB 8HTI)",
    "10.1038/s41586-024-08126-0": "Engineered consensus ORs (PDB 8UXV, 8UXY, 8UY0, 8UYQ)",
    "10.1038/nature06162": "OR7D4 genotype and androstenone perception",
    "10.1038/nn.3598": "OR10G4 variation and guaiacol perception",
    "10.1073/pnas.1804106115": "Genetic variation across the OR repertoire alters perception",
    "10.1371/journal.pbio.0050284": "OR11H7P and isovaleric acid sensitivity (genetic association)",
    "10.1093/chemse/bjs049": "OR2J3 haplotypes and cis-3-hexen-1-ol detection",
    "10.1016/s0092-8674(94)90562-2": "Monoallelic expression of odorant receptor genes",
    "10.1038/sdata.2015.2": "Human OR responses to odorants (screen + dose-response)",
    "10.1085/jgp.201110645": "Response kinetics of olfactory receptor neurons",
    "10.1371/journal.pone.0002640": "Glomerular organisation of the human olfactory bulb",
    "10.7554/elife.47177": "Functional pathways of the human olfactory system",
    "10.1073/pnas.2101209118": "Olfactory bulb, odor valence and motor avoidance",
    "10.18632/oncotarget.16977": "Age-related central olfactory decline",
    "10.1126/science.aal2014": "Predicting human olfactory perception from chemical features",
    "10.1126/science.ade4401": "Principal odor map",
    "10.1186/s12868-016-0287-2": "Olfactory perception of chemically diverse molecules",
    "10.1093/nar/gkae1065": "GPCRdb 2025 (odorant receptors added)",
    "10.1093/nar/gkad1011": "AlphaFold DB 2024",
    "10.1093/nar/gkac888": "HGNC (genenames.org) 2023",
    "10.1093/nar/gkae1010": "UniProt 2025",
}

# References without a DOI.
NON_DOI = [
    dict(id="hladis-2023", authors="Hladiš et al.", year=2023, journal="ICLR 2023",
         title="Matching receptor to odorant with protein language and graph neural networks",
         url="https://openreview.net/forum?id=q9VherQJd8_", cited_for="Phase 2: learned OR–molecule model"),
    dict(id="openpom", authors="BioMachineLearning", year=2023, journal="GitHub",
         title="OpenPOM: open-source Principal Odor Map", url="https://github.com/BioMachineLearning/openpom",
         cited_for="Phase 2: smell prediction"),
]


# Titles of abstract collections, which are not peer-reviewed papers. Several
# OR-odorant EC50 values in M2OR cite these, so the site says what they are.
_ABSTRACTS = re.compile(r"abstracts? from|annual meeting|ECRO \d{4}", re.I)


def _source_type(title: str | None, kind: str | None) -> str:
    if title and _ABSTRACTS.search(title):
        return "conference abstract"
    return "dataset" if kind == "dataset" else "article"


def _authors(names: list[str]) -> str:
    if not names:
        return ""
    return names[0] + (" et al." if len(names) > 2 else (" & " + names[1] if len(names) == 2 else ""))


def lookup(doi: str) -> dict:
    doi = doi.lower()
    cr = cached_json("https://api.crossref.org/works/" + urllib.parse.quote(doi, safe="/"))
    if cr and cr.get("message"):
        m = cr["message"]
        fam = [a.get("family") or a.get("name", "") for a in m.get("author", [])]
        # Crossref's "issued" is the online-first date, which can be a year before
        # the volume year a paper is normally cited by (M2OR 2024, Mainland 2014).
        year = ((m.get("published-print") or m.get("issued") or {}).get("date-parts") or [[None]])[0][0]
        title = (m.get("title") or [""])[0]
        return dict(doi=doi, title=title, authors=_authors(fam), year=year,
                    journal=(m.get("container-title") or [""])[0] or m.get("publisher", ""),
                    volume=m.get("volume"), page=m.get("page"), type=m.get("type"),
                    source_type=_source_type(title, m.get("type")), resolved="crossref")
    dc = cached_json("https://api.datacite.org/dois/" + urllib.parse.quote(doi, safe="/"))
    if dc and dc.get("data"):
        a = dc["data"]["attributes"]
        fam = [c.get("familyName") or c.get("name", "") for c in a.get("creators", [])]
        t = (a.get("titles") or [{}])[0].get("title", "")
        return dict(doi=doi, title=t, authors=_authors(fam), year=a.get("publicationYear"),
                    journal=a.get("publisher"), type="dataset", source_type="dataset", resolved="datacite")
    return dict(doi=doi, title=None, authors=None, year=None, journal=None, source_type=None, resolved=None)
