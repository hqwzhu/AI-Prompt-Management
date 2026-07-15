import json
import os
import re
from pathlib import Path

import torch
from transformers import MarianMTModel, MarianTokenizer


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CURATED_PATH = PROJECT_ROOT / "prompt-source" / "curated" / "feishu.json"
CACHE_PATH = (
    PROJECT_ROOT
    / "prompt-source"
    / "curated"
    / "feishu-raw"
    / "translation-cache.json"
)
MODEL_NAME = "Helsinki-NLP/opus-mt-zh-en"
HAN_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
CATEGORY_TRANSLATIONS = {
    "编程": "Programming",
    "红书": "Xiaohongshu",
    "角色": "Roles",
    "论文": "Academic Writing",
    "生活": "Life",
    "视频": "Video",
    "图片": "Images",
    "问答": "General",
    "小说": "Fiction",
    "写作": "Writing",
    "运营": "Operations",
    "职场": "Workplace",
}
MANUAL_TRANSLATIONS = {
    "1. {问题1}": "1. {Question 1}",
}


def split_long_line(line: str, limit: int = 260) -> list[str]:
    if len(line) <= limit:
        return [line]

    parts = re.split(r"(?<=[。！？!?；;])", line)
    chunks: list[str] = []
    current = ""
    for part in parts:
        if len(current) + len(part) <= limit:
            current += part
            continue
        if current:
            chunks.append(current)
        while len(part) > limit:
            chunks.append(part[:limit])
            part = part[limit:]
        current = part
    if current:
        chunks.append(current)
    return chunks


def split_prompt(value: str) -> list[str]:
    chunks: list[str] = []
    for line in value.splitlines():
        if not line.strip():
            chunks.append("")
            continue
        chunks.extend(split_long_line(line))
    return chunks


data = json.loads(CURATED_PATH.read_text(encoding="utf-8"))
entries = data["entries"]
cache = (
    json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    if CACHE_PATH.exists()
    else {}
)

strings: set[str] = set()
prompt_chunks: dict[str, list[str]] = {}
for entry in entries:
    values = [entry["title"], entry["summary"]]
    values.extend(entry["sourcePath"].split("/"))
    values.extend(entry["tags"])
    strings.update(value.strip() for value in values if value.strip() and HAN_PATTERN.search(value))

    chunks = split_prompt(entry["prompt"])
    prompt_chunks[entry["id"]] = chunks
    strings.update(chunk for chunk in chunks if chunk and HAN_PATTERN.search(chunk))

pending = sorted(
    (value for value in strings if value not in cache),
    key=lambda value: (len(value), value),
)
print(f"Translation strings: {len(strings)}, pending: {len(pending)}", flush=True)

if pending:
    offline = os.getenv("FEISHU_TRANSLATION_OFFLINE") == "1"
    tokenizer = MarianTokenizer.from_pretrained(MODEL_NAME, local_files_only=offline)
    model = MarianMTModel.from_pretrained(MODEL_NAME, local_files_only=offline)
    model.eval()
    torch.set_num_threads(min(16, max(1, os.cpu_count() or 1)))

    offset = 0
    while offset < len(pending):
        source_length = len(pending[offset])
        batch_size = 64 if source_length <= 64 else 32 if source_length <= 128 else 16
        batch = pending[offset : offset + batch_size]
        encoded = tokenizer(
            batch,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        )
        max_input_tokens = int(encoded["attention_mask"].sum(dim=1).max().item())
        max_new_tokens = min(512, max(48, int(max_input_tokens * 1.8) + 16))
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=max_new_tokens,
                num_beams=1,
            )
        translated = tokenizer.batch_decode(generated, skip_special_tokens=True)
        for source, target in zip(batch, translated, strict=True):
            cache[source] = target.strip()

        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )
        offset += len(batch)
        print(
            f"Translated {offset}/{len(pending)} "
            f"(batch={len(batch)}, max_new_tokens={max_new_tokens})",
            flush=True,
        )

    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )


def translate(value: str) -> str:
    if not HAN_PATTERN.search(value):
        return value
    translated = MANUAL_TRANSLATIONS.get(value, cache.get(value, "")).strip()
    if not translated:
        raise ValueError(f"Empty English translation for: {value!r}")
    if HAN_PATTERN.search(translated):
        raise ValueError(f"Chinese text remains in translation for: {value!r}")
    return translated


for entry in entries:
    title = translate(entry["title"])
    category = CATEGORY_TRANSLATIONS[entry["category"]]
    source_path = " / ".join(translate(part.strip()) for part in entry["sourcePath"].split("/"))
    chunks = prompt_chunks[entry["id"]]
    prompt = "\n".join(translate(chunk) if chunk else "" for chunk in chunks)
    prompt = re.sub(r"\n{3,}", "\n\n", prompt).strip()
    summary = translate(entry["summary"])

    entry["translations"] = {
        "en": {
            "title": title,
            "category": category,
            "sourcePath": source_path,
            "summary": summary,
            "prompt": prompt,
            "tags": [category, title],
        }
    }

data["report"]["translation"] = {
    "model": MODEL_NAME,
    "englishEntries": len(entries),
    "remainingHanCharacters": sum(
        len(HAN_PATTERN.findall(json.dumps(entry["translations"]["en"], ensure_ascii=False)))
        for entry in entries
    ),
}
CURATED_PATH.write_text(
    json.dumps(data, ensure_ascii=False, indent=2),
    encoding="utf-8",
    newline="\n",
)

print(f"Translated {len(entries)} curated prompts in {CURATED_PATH}", flush=True)
