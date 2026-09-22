#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run from the LOOP repository root")

manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))

def read(rel):
    return (repo / rel).read_text(encoding="utf-8")

# ---------- PRE-FLIGHT ----------
for rel in manifest["replace_files"]:
    if not (repo / rel).exists():
        raise SystemExit(f"ERROR: expected existing file missing: {rel}")
    if not (pkg / rel).exists():
        raise SystemExit(f"ERROR: package payload missing: {rel}")

for rel in manifest["create_files"]:
    if not (pkg / rel).exists():
        raise SystemExit(f"ERROR: package payload missing: {rel}")
    if (repo / rel).exists() and (repo / rel).read_text(encoding="utf-8") != (pkg / rel).read_text(encoding="utf-8"):
        raise SystemExit(f"ERROR: {rel} already exists with different content. Nothing changed.")

for patch in manifest["patches"]:
    path = repo / patch["path"]
    if not path.exists():
        raise SystemExit(f"ERROR: expected source missing: {patch['path']}")
    text = path.read_text(encoding="utf-8")
    for check in patch.get("checks", []):
        if check not in text:
            raise SystemExit(f"ERROR: pre-flight failed in {patch['path']}: missing {check!r}. Nothing changed.")

print("Pre-flight passed: Financial Flow V4 matches the reviewed main branch.")

def backup(path):
    bak = path.with_name(path.name + ".pre-flow-v4.bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

def replace_query_block(text, start_contains, end_contains, new):
    start = text.find(start_contains)
    if start < 0:
        raise RuntimeError(f"query start not found: {start_contains}")
    # include indentation before start
    line_start = text.rfind("\n", 0, start) + 1
    end = text.find(end_contains, start)
    if end < 0:
        raise RuntimeError(f"query end not found: {end_contains}")
    end = end + len(end_contains)
    return text[:line_start] + new + text[end:]

updated, created = [], []

for rel in manifest["replace_files"]:
    dst = repo / rel
    backup(dst)
    dst.write_text((pkg / rel).read_text(encoding="utf-8"), encoding="utf-8")
    updated.append(rel)

for rel in manifest["create_files"]:
    dst = repo / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        dst.write_text((pkg / rel).read_text(encoding="utf-8"), encoding="utf-8")
        created.append(rel)

for patch in manifest["patches"]:
    path = repo / patch["path"]
    text = path.read_text(encoding="utf-8")
    original = text

    for op in patch["operations"]:
        kind = op["kind"]

        if kind == "replace":
            if op["new"] in text and op["old"] not in text:
                continue
            count = text.count(op["old"])
            if count != 1:
                raise SystemExit(f"ERROR applying {patch['path']}: expected one occurrence, found {count}")
            text = text.replace(op["old"], op["new"], 1)

        elif kind == "replace_segment":
            start = text.find(op["start"])
            end = text.find(op["end"], start + len(op["start"]))
            if start < 0 or end < 0:
                raise SystemExit(f"ERROR applying segment in {patch['path']}")
            end += len(op["end"])
            text = text[:start] + op["new"] + text[end:]

        elif kind == "insert_before":
            idx = text.find(op["needle"])
            if idx < 0:
                raise SystemExit(f"ERROR insert anchor in {patch['path']}")
            text = text[:idx] + op["text"] + text[idx:]

        elif kind == "replace_line_contains":
            lines = text.splitlines(True)
            matches = [i for i, line in enumerate(lines) if op["needle"] in line]
            if len(matches) != 1:
                raise SystemExit(f"ERROR line anchor in {patch['path']}: {op['needle']}")
            lines[matches[0]] = op["new"] + ("\n" if not op["new"].endswith("\n") else "")
            text = "".join(lines)

        elif kind == "replace_query_block":
            text = replace_query_block(text, op["start_contains"], op["end_contains"], op["new"])

        elif kind == "replace_file_content":
            text = op["new"]

        else:
            raise SystemExit(f"Unknown operation {kind}")

    if text != original:
        backup(path)
        path.write_text(text, encoding="utf-8")
        updated.append(patch["path"])

print()
print("Financial Flow V4 applied.")
print("CREATED")
for rel in created:
    print(" ", rel)
print("UPDATED")
for rel in updated:
    print(" ", rel)
print()
print("Key changes:")
print("- House-style left workspace rail on desktop, compact rail on mobile.")
print("- One universal + Add entry point instead of five large action cards.")
print("- Spending core no longer waits for imports/suggestions/loans/accounts/pets/home/groups.")
print("- Savings charts/pots no longer wait for the external rates catalogue.")
print("- Savings market intelligence refreshes independently after the personal view is visible.")
print("- Spending route no longer flashes a second full V3 saved page before the actual planner.")
print("- Duplicate Financial Flow summary cards are collapsed behind detail.")
print("- Existing Sankey, savings charts, pot imagery, timeline, forms and advanced controls remain.")
print()
print("Run git diff --check, then npm run typecheck.")
