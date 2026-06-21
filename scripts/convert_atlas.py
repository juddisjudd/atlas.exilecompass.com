#!/usr/bin/env python3
"""
Convert the game's Atlas.json (PoE2 export) to the data_us.json format the bake
step consumes.

Non-obvious field mapping (Atlas.json -> data_us.json):
  groups[i]                    -> groups[str(i+1)]   (keys are 1-indexed)
  passive.radius               -> node.orbit
  passive.position_clockwise   -> node.orbitIndex
  passive.splines[j]           -> node.connections[j].orbit
  passive.stat_text (markup -) -> node.stats

Mastery nodes (is_icon_only) are kept; the viewer filters them at render time.
poe2db-only fields (sprites, jewelSlots, ...) aren't in the game file -> empty.
totalPoints / ascendancyPoints are game caps not in Atlas.json; set below.
"""
import json
import re
import sys

CDN_PREFIX = "https://cdn.poe2db.tw/image/"
TOTAL_POINTS = 123
ASCENDANCY_POINTS = 8

# [Tag|Display Text] -> "Display Text"   and   [Word] -> "Word"
_MARKUP = re.compile(r"\[(?:[^\]|]*\|)?([^\]]*)\]")


def strip_markup(s):
    return _MARKUP.sub(r"\1", s)


def icon_url(dds_path):
    if not dds_path:
        return ""
    return CDN_PREFIX + re.sub(r"\.dds$", ".webp", dds_path)


def convert(atlas):
    groups_in = atlas["groups"]
    passives_meta = atlas["passives"]
    roots = atlas["roots"]

    out_groups = {}
    out_nodes = {}

    # Synthetic aggregator root, mirroring the data_us.json layout.
    out_nodes["root"] = {
        "group": 0, "orbit": 0, "orbitIndex": 0,
        "in": [], "out": [str(r) for r in roots],
    }

    for i, grp in enumerate(groups_in):
        gkey = str(i + 1)
        orbits = sorted({p["radius"] for p in grp["passives"]})
        node_hashes = [str(p["hash"]) for p in grp["passives"]]
        out_groups[gkey] = {
            "x": round(grp["x"], 2), "y": round(grp["y"], 2),
            "orbits": orbits, "nodes": node_hashes,
        }

        for p in grp["passives"]:
            h = str(p["hash"])
            meta = passives_meta.get(h, {})
            splines = p.get("splines", [])
            conns = [
                {"id": str(c), "orbit": splines[j] if j < len(splines) else 0}
                for j, c in enumerate(p.get("connections", []))
            ]
            name = meta.get("name") or meta.get("id", "")
            stats = [strip_markup(t) for t in meta.get("stat_text", [])]
            out_nodes[h] = {
                "skill": p["hash"],
                "group": i + 1,
                "orbit": p["radius"],
                "orbitIndex": p["position_clockwise"],
                "out": [],
                "connections": conns,
                "in": [],
                "id": meta.get("id", ""),
                "name": name,
                "icon": icon_url(meta.get("icon", "")),
                "stats": stats,
            }

    xs = [g["x"] for g in groups_in]
    ys = [g["y"] for g in groups_in]

    return {
        "tree": "Atlas",
        "classes": [],
        "alternate_ascendancies": [],
        "groups": out_groups,
        "nodes": out_nodes,
        "extraImages": [],
        "jewelSlots": [],
        "min_x": int(min(xs)), "min_y": int(min(ys)),
        "max_x": int(max(xs)), "max_y": int(max(ys)),
        "constants": {
            "PSSCentreInnerRadius": 130,
            "skillsPerOrbit": atlas["skills_per_orbit"],
            "orbitRadii": atlas["orbit_radii"],
        },
        "sprites": [],
        "imageZoomLevels": [],
        "points": {
            "totalPoints": TOTAL_POINTS,
            "ascendancyPoints": ASCENDANCY_POINTS,
        },
    }


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "Atlas.json"
    dst = sys.argv[2] if len(sys.argv) > 2 else "data_us.generated.json"
    with open(src, encoding="utf-8") as f:
        atlas = json.load(f)
    out = convert(atlas)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"Wrote {dst}: {len(out['groups'])} groups, {len(out['nodes'])} nodes")


if __name__ == "__main__":
    main()
