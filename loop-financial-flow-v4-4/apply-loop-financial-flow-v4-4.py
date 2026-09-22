#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run from the LOOP repository root")

manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))

def apply_ops(text: str, patch: dict) -> str:
    for op in patch["ops"]:
        kind = op.get("kind", "replace")
        if kind == "replace":
            old, new = op["old"], op["new"]
            if new in text and old not in text:
                continue
            count = text.count(old)
            if count != 1:
                raise RuntimeError(f"{patch['path']}: {op['label']} expected 1 anchor, found {count}")
            text = text.replace(old, new, 1)
        elif kind == "segment":
            start = text.find(op["start"])
            end = text.find(op["end"], start + len(op["start"])) if start >= 0 else -1
            if start < 0 or end < 0:
                if op["new"] in text:
                    continue
                raise RuntimeError(f"{patch['path']}: {op['label']} segment anchors not found")
            end += len(op["end"])
            text = text[:start] + op["new"] + text[end:]
        else:
            raise RuntimeError(f"Unknown operation: {kind}")
    return text

# True preflight: simulate every source patch before writing anything.
simulated = {}
try:
    for patch in manifest["patches"]:
        path = repo / patch["path"]
        if not path.exists():
            raise RuntimeError(f"missing source file {patch['path']}")
        simulated[patch["path"]] = apply_ops(path.read_text(encoding="utf-8"), patch)

    for rel in manifest["replace_files"] + manifest["create_files"]:
        if not (pkg / rel).exists():
            raise RuntimeError(f"package payload missing {rel}")

    for rel in manifest["create_files"]:
        target = repo / rel
        if target.exists() and target.read_text(encoding="utf-8") != (pkg / rel).read_text(encoding="utf-8"):
            raise RuntimeError(f"{rel} already exists with different content")
except RuntimeError as exc:
    raise SystemExit(f"ERROR: V4.4 preflight failed: {exc}. Nothing has been changed.")

print("Pre-flight passed: Financial Flow V4.4 matches current main.")

def backup(path: Path):
    bak = path.with_name(path.name + ".pre-flow-v4-4.bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

created, updated, unchanged = [], [], []

for rel in manifest["replace_files"]:
    dst = repo / rel
    src = pkg / rel
    content = src.read_text(encoding="utf-8")
    if dst.exists() and dst.read_text(encoding="utf-8") == content:
        unchanged.append(rel)
    else:
        if dst.exists():
            backup(dst)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(content, encoding="utf-8", newline="\n")
        updated.append(rel)

for rel in manifest["create_files"]:
    dst = repo / rel
    src = pkg / rel
    if dst.exists():
        unchanged.append(rel)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
        created.append(rel)

for patch in manifest["patches"]:
    path = repo / patch["path"]
    current = path.read_text(encoding="utf-8")
    next_text = simulated[patch["path"]]
    if current == next_text:
        unchanged.append(patch["path"])
    else:
        backup(path)
        path.write_text(next_text, encoding="utf-8", newline="\n")
        updated.append(patch["path"])

print()
print("Financial Flow V4.4 applied.")
for title, rows in (("CREATED", created), ("UPDATED", updated), ("UNCHANGED", unchanged)):
    if rows:
        print(title)
        for row in rows:
            print(" ", row)

print()
print("V4.4 scope:")
print("- retained Financial Flow memory across Overview / Spending / Savings transitions")
print("- retained route loaders show the previous real view while changed data refreshes")
print("- savings charts explicitly distinguish recorded, projected, estimated and missing evidence")
print("- Quick Add accepts plain language and prefills spending workflows")
print("- no database schema or financial calculation formulas changed")
print()
print("Run git diff --check and npm run typecheck before staging.")
