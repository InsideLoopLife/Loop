#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent

if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run this from the LOOP repository root")

manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))

def patch_text(text, patch):
    for op in patch["ops"]:
        kind = op["kind"]
        if kind == "replace":
            old, new = op["old"], op["new"]
            if new in text and old not in text:
                continue
            count = text.count(old)
            if count != 1:
                raise RuntimeError(f"{patch['path']}: expected one anchor, found {count}: {old[:80]!r}")
            text = text.replace(old, new, 1)
        elif kind == "insert_before":
            marker = op["needle"]
            if op["text"] in text:
                continue
            pos = text.find(marker)
            if pos < 0:
                raise RuntimeError(f"{patch['path']}: insert-before anchor not found: {marker[:80]!r}")
            text = text[:pos] + op["text"] + text[pos:]
        elif kind == "insert_after":
            marker = op["needle"]
            if op["text"] in text:
                continue
            pos = text.find(marker)
            if pos < 0:
                raise RuntimeError(f"{patch['path']}: insert-after anchor not found: {marker[:80]!r}")
            pos += len(marker)
            text = text[:pos] + op["text"] + text[pos:]
        else:
            raise RuntimeError(f"unknown operation: {kind}")
    return text

simulated = {}
try:
    for rel in manifest["create_files"]:
        src = pkg / rel
        if not src.exists():
            raise RuntimeError(f"package payload missing: {rel}")
        dst = repo / rel
        if dst.exists() and dst.read_text(encoding="utf-8") != src.read_text(encoding="utf-8"):
            raise RuntimeError(f"{rel} already exists with different content")

    for patch in manifest["patches"]:
        path = repo / patch["path"]
        if not path.exists():
            raise RuntimeError(f"missing source file: {patch['path']}")
        simulated[patch["path"]] = patch_text(path.read_text(encoding="utf-8"), patch)
except RuntimeError as exc:
    raise SystemExit(f"ERROR: V4.8 preflight failed: {exc}. Nothing has been changed.")

print("Pre-flight passed: Financial Flow V4.8 anchors match.")

for rel in manifest["create_files"]:
    dst = repo / rel
    if dst.exists():
        print("UNCHANGED", rel)
        continue
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text((pkg / rel).read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
    print("CREATED", rel)

for patch in manifest["patches"]:
    path = repo / patch["path"]
    current = path.read_text(encoding="utf-8")
    updated = simulated[patch["path"]]
    if current == updated:
        print("UNCHANGED", patch["path"])
        continue
    backup = path.with_name(path.name + ".pre-flow-v4-8.bak")
    if not backup.exists():
        backup.write_text(current, encoding="utf-8")
    path.write_text(updated, encoding="utf-8", newline="\n")
    print("UPDATED", patch["path"])

print()
print("V4.8 applied:")
print("- one-line Spending Quick Add using the existing authoritative add forms")
print("- visible inferred amount / cadence / category / group before confirmation")
print("- Groups & categories jump navigation from the Spending top area")
print("- group name visible inside quick categorisation")
print("- Savings reasoning card: Result -> Why -> Evidence -> Action")
print("- clearer savings account / allocation language")
print("- no tax, NI, savings interest, household ownership or recurrence calculation changes")
print()
print("Run git diff --check and npm run typecheck before staging.")
