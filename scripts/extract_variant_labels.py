#!/usr/bin/env python3
"""
Build data/atlas_variant_labels.json: option stat id -> condition-line templates,
consumed by scripts/bake.mjs to render multi-choice selector option labels.

Output shape, per id:
    "<stat_id>": [ { "min": <int|null>, "max": <int|null>, "t": "<template>" }, ... ]
where `t` keeps the {0}/{1} value placeholders. bake.mjs substitutes the values
from data/selector-options.json (picking the line whose [min,max] the value falls
in, so "increased" vs "reduced" renders correctly), or leaves the placeholders in
for value-less options (the UI strips them).

Labels come from two game stat-translation files:
  - atlas_variant_stat_descriptions.json : short radial labels (biomes, essence,
    rogue exiles, etc.)
  - atlas_stat_descriptions.json         : full-sentence stats used by the
    "difficulty"/content selectors (rare/magic monsters, ritual, breach, ...).

Only ids referenced by data/selector-options.json are emitted, so the file stays
small. The variant file wins on id collisions (its labels are menu-friendly).

Usage:
  python scripts/extract_variant_labels.py <variant_desc.json> <atlas_desc.json> [out.json]
"""
import json
import re
import sys

_MARKUP = re.compile(r"\[(?:[^\]|]*\|)?([^\]]*)\]")


def clean(s):
    return _MARKUP.sub(r"\1", s).replace("\n", " ").strip()


def lines_of(entry):
    """Condition lines for one description entry: [{min,max,t}, ...]."""
    out = []
    for line in entry.get("English", []):
        conds = line.get("condition") or [{}]
        c = conds[0] if conds else {}
        out.append({"min": c.get("min"), "max": c.get("max"), "t": clean(line.get("string", ""))})
    return out


def templates_from(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        for e in json.load(f):
            if not (e.get("ids") and e.get("English")):
                continue
            ls = lines_of(e)
            for sid in e["ids"]:
                out.setdefault(sid, ls)
    return out


def referenced_ids(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    ids = set()
    for key, opts in data.items():
        if key.startswith("_"):
            continue
        for opt in opts:
            ids.add(opt if isinstance(opt, str) else opt["id"])
    return ids


def main():
    variant = sys.argv[1] if len(sys.argv) > 1 else "atlas_variant_stat_descriptions.json"
    atlas = sys.argv[2] if len(sys.argv) > 2 else "atlas_stat_descriptions.json"
    dst = sys.argv[3] if len(sys.argv) > 3 else "data/atlas_variant_labels.json"

    # atlas first, variant second so variant labels override on collision
    merged = {**templates_from(atlas), **templates_from(variant)}
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
    print(f"Wrote {dst}: {len(out)} option templates for {len(needed)} referenced ids")
    if missing:
        print(f"WARNING: {len(missing)} option ids have no template:")
        for sid in missing:
            print(f"  - {sid}")


if __name__ == "__main__":
    main()
