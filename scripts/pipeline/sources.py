"""Downloads with an on-disk cache, so the pipeline can be re-run offline.

Every file lands in data/raw/. Nothing here interprets the data.
"""
from __future__ import annotations

import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from .paths import CACHE, GPCRDB_JSON, M2OR_DIR, M2OR_SNAPSHOT, PYRFUME_DIR, UNIPROT_TSV

USER_AGENT = "ENodorIM-data-pipeline/0.1 (academic)"
_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT

M2OR_GITHUB = "https://raw.githubusercontent.com/chemosim-lab/M2OR/main"
PYRFUME_GITHUB = "https://raw.githubusercontent.com/pyrfume/pyrfume-data/main"
PYRFUME_FILES = {
    "leffingwell": ["manifest.toml", "behavior_sparse.csv", "molecules.csv", "stimuli.csv", "leffingwell_readme.pdf"],
    "dravnieks_1985": ["manifest.toml", "behavior_1.csv", "molecules.csv", "stimuli.csv"],
    "keller_2016": ["manifest.toml", "molecules.csv", "stimuli.csv"],
    "goodscents": ["manifest.toml", "README.md", "behavior.csv", "molecules.csv", "stimuli.csv"],
}


def download(url: str, dest: Path, *, refresh: bool = False, timeout: int = 120) -> Path:
    if dest.exists() and not refresh:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = _session.get(url, timeout=timeout)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def cached_json(url: str, *, method: str = "GET", body: dict | None = None, retries: int = 3) -> dict | list | None:
    """GET/POST a JSON API once and keep the answer in data/raw/cache/."""
    key = hashlib.sha1((method + url + json.dumps(body, sort_keys=True)).encode()).hexdigest()
    path = CACHE / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())["data"]
    CACHE.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        try:
            r = _session.request(method, url, json=body, timeout=60)
            if r.status_code == 404:
                data = None
            else:
                r.raise_for_status()
                data = r.json()
            path.write_text(json.dumps({"url": url, "data": data}))
            return data
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return None


def cached_json_many(urls: list[str], workers: int = 8) -> list:
    """Cached GETs in parallel; returns the payloads in input order."""
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(cached_json, urls))


def fetch_all(refresh: bool = False) -> None:
    # M2OR: the website is behind a browser challenge, so we use the authors'
    # GitHub snapshot (Apache-2.0). A manual export from m2or.chemsensim.fr
    # placed in data/raw/m2or/ takes precedence (see m2or.load_experiments).
    download(f"{M2OR_GITHUB}/M2OR_20230428.csv", M2OR_SNAPSHOT, refresh=refresh)
    download(f"{M2OR_GITHUB}/README.md", M2OR_DIR / "README.md", refresh=refresh)
    download(f"{M2OR_GITHUB}/LICENSE", M2OR_DIR / "LICENSE", refresh=refresh)

    # UniProt: reviewed human olfactory receptors (keyword Olfaction, GPCR family 1).
    download(
        "https://rest.uniprot.org/uniprotkb/stream?format=tsv"
        "&query=organism_id:9606+AND+reviewed:true+AND+keyword:KW-0552"
        "+AND+family:%22G-protein+coupled+receptor+1+family%22"
        "&fields=accession,gene_primary,gene_synonym,protein_name,length,sequence",
        UNIPROT_TSV,
        refresh=refresh,
    )

    # GPCRdb receptor list (includes the olfactory classes O1/O2).
    download("https://gpcrdb.org/services/receptorlist/", GPCRDB_JSON, refresh=refresh)

    for ds, files in PYRFUME_FILES.items():
        for f in files:
            download(f"{PYRFUME_GITHUB}/{ds}/{f}", PYRFUME_DIR / ds / f, refresh=refresh)
