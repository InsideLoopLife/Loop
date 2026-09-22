#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent

if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run this installer from the LOOP repository root")

manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))
created, updated, unchanged = [], [], []

def backup(path: Path):
    bak = path.with_name(path.name + ".pre-instant-boot-v3.bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

# ---------------------------------------------------------------------------
# PRE-FLIGHT — no repo file is modified until every guarded anchor is checked.
# ---------------------------------------------------------------------------
for rel in manifest["create_only"]:
    src = pkg / rel
    dst = repo / rel
    if not src.exists():
        raise SystemExit(f"ERROR: package payload missing {rel}")
    if dst.exists() and dst.read_text(encoding="utf-8") != src.read_text(encoding="utf-8"):
        raise SystemExit(
            f"ERROR: {rel} already exists with different content. "
            "Nothing has been changed."
        )

for rel in manifest["replace_or_create"]:
    if not (pkg / rel).exists():
        raise SystemExit(f"ERROR: package payload missing {rel}")

for rel, edits in manifest["changes"].items():
    path = repo / rel
    if not path.exists():
        raise SystemExit(f"ERROR: expected source file is missing: {rel}")
    text = path.read_text(encoding="utf-8")

    for edit in edits:
        old = edit["old"]
        new = edit["new"]
        label = edit["label"]

        if new and new in text and old not in text:
            continue

        count = text.count(old)
        if count != 1:
            raise SystemExit(
                f"ERROR: safe anchor pre-flight failed in {rel}: {label} "
                f"(found {count}). Nothing has been changed."
            )
        text = text.replace(old, new, 1)

print("Pre-flight passed: all V3 source anchors match the reviewed main branch.")

# ---------------------------------------------------------------------------
# APPLY
# ---------------------------------------------------------------------------
for rel in manifest["create_only"]:
    src = pkg / rel
    dst = repo / rel
    content = src.read_text(encoding="utf-8")
    dst.parent.mkdir(parents=True, exist_ok=True)

    if dst.exists():
        unchanged.append(rel)
    else:
        dst.write_text(content, encoding="utf-8")
        created.append(rel)

for rel in manifest["replace_or_create"]:
    src = pkg / rel
    dst = repo / rel
    content = src.read_text(encoding="utf-8")
    dst.parent.mkdir(parents=True, exist_ok=True)

    if dst.exists():
        if dst.read_text(encoding="utf-8") == content:
            unchanged.append(rel)
        else:
            backup(dst)
            dst.write_text(content, encoding="utf-8")
            updated.append(rel)
    else:
        dst.write_text(content, encoding="utf-8")
        created.append(rel)

for rel, edits in manifest["changes"].items():
    path = repo / rel
    text = path.read_text(encoding="utf-8")
    original = text

    for edit in edits:
        old = edit["old"]
        new = edit["new"]
        if new and new in text and old not in text:
            continue
        text = text.replace(old, new, 1)

    if text == original:
        unchanged.append(rel)
    else:
        backup(path)
        path.write_text(text, encoding="utf-8")
        updated.append(rel)

print()
print("LOOP Instant Boot V3 applied.")
for label, rows in (
    ("CREATED", created),
    ("UPDATED", updated),
    ("UNCHANGED", unchanged),
):
    if rows:
        print(label)
        for row in rows:
            print(" ", row)

print()
print("IMPORTANT")
print("- Production Supabase route_boot_snapshots was already created and hardened.")
print("- The migration file is included so repository history matches production.")
print("- No mortgage, tax, maternity, ISA, pension valuation, savings accrual,")
print("  household ownership, recurrence, or investment pricing formulas were changed.")
print("- Run git diff --check and npm run typecheck before committing.")
