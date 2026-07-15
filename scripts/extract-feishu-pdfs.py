import json
from pathlib import Path

from pypdf import PdfReader


PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_ROOT = PROJECT_ROOT / "prompt-source" / "curated" / "feishu-raw"
INDEX_PATH = RAW_ROOT / "selected-library.json"
OUTPUT_PATH = RAW_ROOT / "pdf-text.json"


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(path)
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
entries = []

for root_item in index["rootNodes"]:
    root_node = root_item["rootNode"]
    for child in root_item.get("children", []):
        preview_path = child.get("previewPath")
        if not preview_path:
            continue

        node = child["node"]
        pdf_path = RAW_ROOT / preview_path
        try:
            text = extract_pdf_text(pdf_path)
            error = None
        except Exception as exc:  # Keep one bad attachment from blocking the full import.
            text = ""
            error = str(exc)

        entries.append(
            {
                "rootTitle": root_node["title"],
                "rootWikiToken": root_node["wikiToken"],
                "title": node["title"],
                "wikiToken": node["wikiToken"],
                "sourceUrl": node["url"],
                "previewPath": preview_path,
                "text": text,
                "error": error,
            }
        )

OUTPUT_PATH.write_text(
    json.dumps({"sourceUrl": index["sourceUrl"], "entries": entries}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

print(f"Extracted {len(entries)} PDF prompt files to {OUTPUT_PATH}")
