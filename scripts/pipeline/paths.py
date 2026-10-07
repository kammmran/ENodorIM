from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
CACHE = RAW / "cache"
PROCESSED = ROOT / "data" / "processed"

M2OR_DIR = RAW / "m2or"
M2OR_SNAPSHOT = M2OR_DIR / "M2OR_20230428.csv"
PYRFUME_DIR = RAW / "pyrfume"
UNIPROT_TSV = RAW / "uniprot" / "human_ORs.tsv"
GPCRDB_JSON = RAW / "gpcrdb" / "receptorlist.json"
