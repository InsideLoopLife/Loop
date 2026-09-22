#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run from /workspaces/Loop")

manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))
created, updated = [], []

def backup(path):
    bak = path.with_name(path.name + ".pre-v2-data-split.bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

for rel in manifest["payload_create"]:
    src, dst = pkg / rel, repo / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    content = src.read_text(encoding="utf-8")
    if dst.exists():
        if dst.read_text(encoding="utf-8") != content:
            raise SystemExit(f"ERROR: {rel} already exists with different content")
    else:
        dst.write_text(content, encoding="utf-8")
        created.append(rel)

for rel in manifest["payload_replace"]:
    src, dst = pkg / rel, repo / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    content = src.read_text(encoding="utf-8")
    if dst.exists() and dst.read_text(encoding="utf-8") != content:
        backup(dst)
        dst.write_text(content, encoding="utf-8")
        updated.append(rel)
    elif not dst.exists():
        dst.write_text(content, encoding="utf-8")
        created.append(rel)

for rel, edits in manifest["changes"].items():
    path = repo / rel
    if not path.exists():
        raise SystemExit(f"ERROR: missing {rel}")
    text = path.read_text(encoding="utf-8")
    original = text
    for edit in edits:
        old, new, label = edit["old"], edit["new"], edit["label"]
        if new and new in text and old not in text:
            continue
        if text.count(old) != 1:
            raise SystemExit(f"ERROR: changed/non-unique anchor in {rel}: {label}")
        text = text.replace(old, new, 1)
    if text != original:
        backup(path)
        path.write_text(text, encoding="utf-8")
        updated.append(rel)

print("Applied LOOP Performance V2 data split.")
print("Created:", len(created))
print("Updated:", len(updated))
print("Stale cached views are display-only while fresh data resolves.")
print("No database schema or financial formulas changed.")
