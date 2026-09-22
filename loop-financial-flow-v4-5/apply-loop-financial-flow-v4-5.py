#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run from LOOP repository root")

manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))

def apply_ops(text, patch):
    for op in patch["ops"]:
        if op["kind"] == "segment":
            start = text.find(op["start"])
            end = text.find(op["end"], start + len(op["start"])) if start >= 0 else -1
            if start < 0 or end < 0:
                if op["new"] in text:
                    continue
                raise RuntimeError(f"{patch['path']}: {op['label']} anchors not found")
            end += len(op["end"])
            text = text[:start] + op["new"] + text[end:]
        elif op["kind"] == "insert_before":
            if op["text"] in text:
                continue
            index = text.find(op["needle"])
            if index < 0:
                raise RuntimeError(f"{patch['path']}: insert anchor missing")
            text = text[:index] + op["text"] + text[index:]
    return text

simulated = {}
try:
    for patch in manifest["patches"]:
        path = repo / patch["path"]
        if not path.exists():
            raise RuntimeError(f"missing {patch['path']}")
        simulated[patch["path"]] = apply_ops(path.read_text(encoding="utf-8"), patch)
except RuntimeError as exc:
    raise SystemExit(f"ERROR: V4.5 preflight failed: {exc}. Nothing changed.")

print("Pre-flight passed: Financial Flow navigation V4.5.")

for patch in manifest["patches"]:
    path = repo / patch["path"]
    current = path.read_text(encoding="utf-8")
    next_text = simulated[patch["path"]]
    if current == next_text:
        print("UNCHANGED", patch["path"])
        continue
    backup = path.with_name(path.name + ".pre-flow-v4-5.bak")
    if not backup.exists():
        backup.write_text(current, encoding="utf-8")
    path.write_text(next_text, encoding="utf-8", newline="\n")
    print("UPDATED", patch["path"])

print()
print("V4.5 applied: one Financial Flow navigation system + compact House-style header.")
print("Run git diff --check and npm run typecheck.")
