#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run from the LOOP repository root")

manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))

def apply_ops(text, patch, preflight=False):
    path_name = patch["path"]

    for op in patch["operations"]:
        kind = op["kind"]

        if kind == "replace":
            old, new = op["old"], op["new"]
            # Idempotent when the exact replacement has already landed.
            if new and new in text and old not in text:
                continue
            count = text.count(old)
            if count != 1:
                raise RuntimeError(
                    f"{path_name}: expected one occurrence for replacement, found {count}"
                )
            text = text.replace(old, new, 1)

        elif kind == "replace_all":
            old, new = op["old"], op["new"]
            expected = int(op["expected"])
            old_count = text.count(old)
            new_count = text.count(new)
            if old_count == 0 and new_count >= expected:
                continue
            if old_count != expected:
                raise RuntimeError(
                    f"{path_name}: expected {expected} occurrences for replacement, found {old_count}"
                )
            text = text.replace(old, new)

        elif kind == "replace_segment":
            start = text.find(op["start"])
            end = text.find(op["end"], start + len(op["start"])) if start >= 0 else -1
            if start < 0 or end < 0:
                # If segment was already replaced, treat the replacement as idempotent.
                if op["new"] in text:
                    continue
                raise RuntimeError(f"{path_name}: guarded segment anchor not found")
            end += len(op["end"])
            text = text[:start] + op["new"] + text[end:]

        elif kind == "insert_before":
            if op["text"] in text:
                continue
            idx = text.find(op["needle"])
            if idx < 0:
                raise RuntimeError(f"{path_name}: insert anchor not found")
            text = text[:idx] + op["text"] + text[idx:]

        elif kind == "replace_line_contains":
            if op["new"].strip() in text and op["needle"] not in text:
                continue
            lines = text.splitlines(True)
            matches = [i for i, line in enumerate(lines) if op["needle"] in line]
            if len(matches) != 1:
                raise RuntimeError(
                    f"{path_name}: expected one matching line for {op['needle']!r}, found {len(matches)}"
                )
            lines[matches[0]] = op["new"] + ("\n" if not op["new"].endswith("\n") else "")
            text = "".join(lines)

        elif kind == "replace_query_block":
            # If the replacement line already exists and the query start is gone, it is already applied.
            if op["start_contains"] not in text:
                if op["new"].strip() in text:
                    continue
                raise RuntimeError(
                    f"{path_name}: query start not found: {op['start_contains']!r}"
                )
            start = text.find(op["start_contains"])
            line_start = text.rfind("\n", 0, start) + 1
            end = text.find(op["end_contains"], start)
            if end < 0:
                raise RuntimeError(
                    f"{path_name}: query end not found: {op['end_contains']!r}"
                )
            end += len(op["end_contains"])
            text = text[:line_start] + op["new"] + text[end:]

        elif kind == "replace_file_content":
            text = op["new"]

        else:
            raise RuntimeError(f"{path_name}: unknown operation {kind}")

    return text

# ------------------------------------------------------------------
# TRUE PRE-FLIGHT
# Simulate EVERY patch before writing any more repository files.
# This is safe both from clean main and from the earlier partial V4 run.
# ------------------------------------------------------------------
simulated = {}
try:
    for patch in manifest["patches"]:
        path = repo / patch["path"]
        if not path.exists():
            raise RuntimeError(f"expected source missing: {patch['path']}")
        text = path.read_text(encoding="utf-8")

        # The checks describe current-main landmarks. If a file is already partially
        # patched, the operation simulation below is the authoritative safety check.
        simulated[patch["path"]] = apply_ops(text, patch, preflight=True)

    for rel in manifest["replace_files"]:
        if not (repo / rel).exists():
            raise RuntimeError(f"expected existing replacement target missing: {rel}")
        if not (pkg / rel).exists():
            raise RuntimeError(f"package payload missing: {rel}")

    for rel in manifest["create_files"]:
        if not (pkg / rel).exists():
            raise RuntimeError(f"package payload missing: {rel}")
        target = repo / rel
        if target.exists():
            expected = (pkg / rel).read_text(encoding="utf-8")
            current = target.read_text(encoding="utf-8")
            if current != expected:
                raise RuntimeError(
                    f"{rel} already exists with different content; refusing to overwrite"
                )
except RuntimeError as exc:
    raise SystemExit(f"ERROR: V4.1 pre-flight failed: {exc}. No additional changes have been made.")

print("Pre-flight passed: V4.1 can safely resume the earlier partial V4 run.")

def backup(path):
    bak = path.with_name(path.name + ".pre-flow-v4-1.bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

updated, created, unchanged = [], [], []

# Replace owned file (safe even if prior run already installed it).
for rel in manifest["replace_files"]:
    dst_path = repo / rel
    expected = (pkg / rel).read_text(encoding="utf-8")
    current = dst_path.read_text(encoding="utf-8")
    if current == expected:
        unchanged.append(rel)
    else:
        backup(dst_path)
        dst_path.write_text(expected, encoding="utf-8")
        updated.append(rel)

# Create-only dependencies (prior partial run may already have them).
for rel in manifest["create_files"]:
    dst_path = repo / rel
    expected = (pkg / rel).read_text(encoding="utf-8")
    if dst_path.exists():
        unchanged.append(rel)
    else:
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        dst_path.write_text(expected, encoding="utf-8")
        created.append(rel)

# Apply the fully simulated source patches.
for patch in manifest["patches"]:
    path = repo / patch["path"]
    current = path.read_text(encoding="utf-8")
    next_text = simulated[patch["path"]]
    if current == next_text:
        unchanged.append(patch["path"])
        continue
    backup(path)
    path.write_text(next_text, encoding="utf-8")
    updated.append(patch["path"])

print()
print("Financial Flow V4.1 applied successfully.")
if created:
    print("CREATED")
    for rel in created:
        print(" ", rel)
if updated:
    print("UPDATED")
    for rel in updated:
        print(" ", rel)
if unchanged:
    print("UNCHANGED / ALREADY APPLIED")
    for rel in unchanged:
        print(" ", rel)

print()
print("Next:")
print("  git diff --check")
print("  cd loop_work")
print("  npm run typecheck")
