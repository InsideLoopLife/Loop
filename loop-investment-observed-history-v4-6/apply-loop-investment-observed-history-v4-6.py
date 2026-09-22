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
        kind = op["kind"]
        if kind == "replace":
            old, new = op["old"], op["new"]
            if new in text and old not in text:
                continue
            count = text.count(old)
            if count != 1:
                raise RuntimeError(f"{patch['path']}: {op['label']} expected 1 anchor, found {count}")
            text = text.replace(old, new, 1)
        elif kind == "insert_before":
            if op["text"] in text:
                continue
            index = text.find(op["needle"])
            if index < 0:
                raise RuntimeError(f"{patch['path']}: insert-before anchor missing")
            text = text[:index] + op["text"] + text[index:]
        elif kind == "insert_after":
            if op["text"] in text:
                continue
            index = text.find(op["needle"])
            if index < 0:
                raise RuntimeError(f"{patch['path']}: insert-after anchor missing")
            index += len(op["needle"])
            text = text[:index] + op["text"] + text[index:]
        else:
            raise RuntimeError(f"unknown operation {kind}")
    return text

simulated = {}
try:
    for patch in manifest["patches"]:
        path = repo / patch["path"]
        if not path.exists():
            raise RuntimeError(f"missing {patch['path']}")
        simulated[patch["path"]] = apply_ops(path.read_text(encoding="utf-8"), patch)
except RuntimeError as exc:
    raise SystemExit(f"ERROR: observed-history V4.6 preflight failed: {exc}. Nothing changed.")

print("Pre-flight passed: observed investment history V4.6.")

for patch in manifest["patches"]:
    path = repo / patch["path"]
    current = path.read_text(encoding="utf-8")
    next_text = simulated[patch["path"]]
    if current == next_text:
        print("UNCHANGED", patch["path"])
        continue
    backup = path.with_name(path.name + ".pre-observed-v4-6.bak")
    if not backup.exists():
        backup.write_text(current, encoding="utf-8")
    path.write_text(next_text, encoding="utf-8", newline="\n")
    print("UPDATED", patch["path"])

print()
print("V4.6 applied.")
print("- shared global market observations drive holding mini charts")
print("- cadence is entitlement-aware (realtime / plus-pro / free settings)")
print("- no duplicate per-user intraday holding snapshots are written")
print("- 1D synthetic portfolio line removed")
print("- outlined/visible snapshot dots added to mini charts")
print()
print("Run git diff --check and npm run typecheck.")
