#!/usr/bin/env python3
"""
Build data/atlas_variant_labels.json (option stat id -> English label), the
label source consumed by scripts/bake.mjs for multi-choice selector options.

Option labels come from two game stat-translation files:
  - atlas_variant_stat_descriptions.json : short radial labels for biome/essence/
    rogue/etc. selectors (e.g. "Amanamu", "Abyssal Eyes").
  - atlas_stat_descriptions.json         : full-sentence stats used by the
    "difficulty" selectors (e.g. Nemesis Rising's rare-monster options).

Only ids actually referenced by data/selector-options.json are emitted, so the
label file stays small. The variant file wins on id collisions (its labels are
the menu-friendly form).

Usage:
  python scripts/extract_variant_labels.py <variant_desc.json> <atlas_desc.json> [out.json]
"""
import json
import re
import sys

_MARKUP = re.compile(r"\[(?:[^\]|]*\|)?([^\]]*)\]")


def clean(s):
    return _MARKUP.sub(r"\1", s).replace("\n", " ").strip()


def labels_from(path):
    """id -> cleaned first English string, for every entry in a desc file."""
    out = {}
    with open(path, encoding="utf-8") as f:
        for e in json.load(f):
            if not (e.get("ids") and e.get("English")):
                continue
            text = clean(e["English"][0].get("string", ""))
            for sid in e["ids"]:
                out.setdefault(sid, text)
    return out


def referenced_ids(selector_options_path):
    with open(selector_options_path, encoding="utf-8") as f:
        data = json.load(f)
    ids = set()
    for key, opts in data.items():
        if key.startswith("_"):
            continue
        ids.update(opts)
    return ids


def main():
    variant = sys.argv[1] if len(sys.argv) > 1 else "atlas_variant_stat_descriptions.json"
    atlas = sys.argv[2] if len(sys.argv) > 2 else "atlas_stat_descriptions.json"
    dst = sys.argv[3] if len(sys.argv) > 3 else "data/atlas_variant_labels.json"

    # atlas first, variant second so variant labels override on collision
    merged = {**labels_from(atlas), **labels_from(variant)}
    needed = referenced_ids("data/selector-options.json")

    out = {}
    missing = []
    for sid in sorted(needed):
        if sid in merged:
            out[sid] = merged[sid]
        else:
            missing.append(sid)

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"Wrote {dst}: {len(out)} labels for {len(needed)} referenced option ids")
    if missing:
        print(f"WARNING: {len(missing)} option ids have no label:")
        for sid in missing:
            print(f"  - {sid}")


if __name__ == "__main__":
    main()
