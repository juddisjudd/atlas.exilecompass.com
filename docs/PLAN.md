# ExileCompass Atlas Planner — Build Plan

A full Path of Exile 2 **Atlas Skill Tree planner** with a shareable progression
**timeline**, deployed at `atlas.exilecompass.com`.

> **This is a living document.** As tasks complete, check them off (`[x]`),
> update **Status** below, and add a dated line to the **Changelog**.

---

## Status

| | |
|---|---|
| **Current phase** | Phase 0 ✅ · 1 ✅ · 2 ✅ (sharing live) → Phase 3 next (QoL) |
| **Last updated** | 2026-06-05 |
| **Dev** | `bun run dev` (vite). Pipeline: `bun run data` (convert + bake). |
| **Prototype** | `S:\_projects_\_poe2_\poe2-atlas\index.html` (reference, single-file) |

---

## Goal

Players can fully fill the atlas tree, but atlas points arrive gradually as they
progress. The planner's value is the **optimal order** to take nodes. An author
builds a route, segments it into named milestones, and shares a link; viewers
scrub a timeline to see the tree state at each step of their progression.

---

## Locked decisions

- **Repo:** standalone, lives in `S:\_projects_\atlas.exilecompass.com`. Deployed
  independently to the subdomain (separate from the marketing site at
  `S:\_projects_\exilecompass.com`).
- **Stack:** SvelteKit 5 · Tailwind 4 · Vite 8 · TypeScript 6 · Bun. Built with
  **adapter-node** (Docker/Coolify, matching the main site) so share-link API
  routes + SSR OG-embed images are possible. The SVG canvas still renders
  client-side; SSR only serves the shell, the `/<id>` route, and the API.
- **Timeline model:** ordered allocation **steps** (flat array of node hashes,
  auto-appended in path/BFS order) + optional named **milestone markers**.
- **Sharing:** two tiers. (1) Stateless — versioned URL-safe base64 in the URL
  hash, stamped with `treeVersion` (works with zero backend). (2) Short links —
  pobb.in-style `/<12-char-id>` + `/<id>/raw`, persisted in **Postgres on
  Coolify** (one `plans` table; managed, monitorable, backed up).

---

## Target structure

```
atlas.exilecompass.com/
├── docs/
│   └── PLAN.md                  # this file
├── data/
│   ├── Atlas.json               # game export (source of truth)
│   ├── data_us.json             # converted tree
│   └── convert_atlas.py         # Atlas.json -> data_us.json pipeline
├── static/icons/                # local node icons (webp)
├── src/lib/atlas/
│   ├── tree-data.ts             # load + orbit->x/y math + arc geometry
│   ├── pathfinding.ts           # multi-source BFS + orphan prune
│   ├── allocation.svelte.ts     # reactive allocation state (runes)
│   ├── timeline.svelte.ts       # ordered steps + milestones state
│   └── share.ts                 # plan <-> base64 code (versioned)
├── src/lib/server/
│   └── db.ts                    # Postgres client + plans queries
├── src/lib/components/
│   ├── AtlasTree.svelte         # SVG render + pan/zoom + hover preview
│   ├── TimelinePanel.svelte     # scrubber + milestone editor
│   ├── NodeTooltip.svelte
│   └── Toolbar.svelte
└── src/routes/
    ├── +layout.svelte
    ├── +page.svelte             # planner (+ shared read-only view via #hash)
    ├── api/share/+server.ts     # POST { code } -> { id }
    ├── api/stats/+server.ts     # row count + table size (monitoring)
    └── [id]/
        ├── +page.server.ts      # load plan by id, SSR (OG embed)
        ├── +page.svelte         # read-only shared view
        └── raw/+server.ts       # GET -> raw base64 as text/plain
```

---

## Timeline data model

```ts
interface Plan {
  v: 1;                    // schema version
  treeVersion: string;     // which Atlas data this was built against
  steps: number[];         // node hashes, in allocation order
  milestones: { at: number; label: string }[];  // markers at step indices
  meta: { title?: string; author?: string; notes?: string };
}
```

- Authoring: clicking a node auto-paths and **appends the path to `steps`** in BFS
  order, so building the plan == allocating in the intended order.
- Viewing: scrubbing to step `k` renders `steps[0..k]` as allocated; milestones
  are labeled stops you can jump to / autoplay between.

---

## Sharing & storage

Two tiers, same encoded `code` underneath:

1. **Stateless (Phase 2):** `encode(plan)` -> URL-safe base64, lives in the URL
   hash (`atlas.exilecompass.com/#<code>`). No backend. Works forever offline.
2. **Short links (Phase 2, DB-backed):** `POST /api/share { code }` stores it and
   returns a 12-char id (nanoid). `/<id>` renders the plan; `/<id>/raw` returns
   the raw base64 (pobb.in-style).

**Storage:** Postgres on Coolify — one table, opaque blob, tiny rows:

```sql
CREATE TABLE plans (
  id           TEXT PRIMARY KEY,      -- 12-char nanoid
  code         TEXT NOT NULL,         -- base64 plan
  tree_version TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  views        INTEGER DEFAULT 0
);
```

Connection via `DATABASE_URL` env var (provisioned in Coolify when we reach
Phase 2). `/api/stats` exposes `count(*)` + `pg_total_relation_size('plans')`
so growth is monitorable from a URL.

---

## Phases & tasks

### Phase 0 — Scaffold & port (parity with prototype) — ✅ done
- [x] Init SvelteKit (Svelte 5) project with Bun in repo root
- [x] Add Tailwind 4 + Vite plugin; port the prototype's dark/gold theme tokens
- [x] Configure `adapter-node`, `svelte.config.js`, `tsconfig`
- [x] Add eslint/prettier configs matching the main site
- [x] Data into `data/` (`Atlas.json`, `data_us.json`); scripts into `scripts/`
      (`convert_atlas.py`, `bake.mjs`); icons into `static/icons/`
- [x] `bake.mjs`: `data_us.json` (+ Atlas flags) -> `src/lib/atlas/tree.json`
      (positions, arc edges, types, subtree colouring, local icons, version hash)
- [x] `tree-data.ts`: typed tree load + adjacency + lookups
- [x] `pathfinding.ts`: multi-source BFS + orphan pruning
- [x] `allocation.svelte.ts`: reactive allocation state (runes / SvelteSet)
- [x] `AtlasTree.svelte`: SVG render, pan/zoom, hover tooltip, hover path preview
- [x] Toolbar: zoom-to-fit / reset / clear, allocated counter, labels toggle
- [x] Filter mastery nodes; green connections; no start-node border (match prototype)
- [x] Verify parity with `index.html` in-browser; no console errors; `bun run check` clean
- [x] `git init` + initial commit; pushed to GitHub (`juddisjudd/atlas.exilecompass.com`)

### Phase 1 — Timeline core — ✅ done (reorder deferred)
- [x] `planner.svelte.ts`: ordered `steps` are the source of truth (merges
      allocation + timeline; `cursor` = view position, `milestones[]`)
- [x] Appending a path adds its nodes to `steps`; removing prunes from `steps`
- [x] `TimelinePanel.svelte`: horizontal scrubber over `steps` (drag/click)
- [x] Scrub to `k` -> `steps[0..k]` shown taken, later steps shown "future" (dimmed)
- [x] Add / rename / delete / jump-to milestone markers at the current step
- [x] Step counter + "points so far" display tied to scrubber
- [ ] Drag to reorder steps (deferred — needs connectivity-preserving reorder;
      revisit in Phase 3 QoL)

### Phase 2 — Sharing — ✅ done
**Stateless tier:**
- [x] `share.ts`: encode `Plan` -> URL-safe base64 (compact binary, 16-bit hashes)
- [x] Decode + validate; `isCurrentTree()` warns on `treeVersion` mismatch
- [x] Load plan from URL hash on the main page; `Share` action sets `#code`
- [x] Read-only shared-view mode (`/[id]` page; tree + scrubber, no editing)
- [x] Versioned format (`SHARE_VERSION`) so old links survive tree updates

**Short-link tier (Postgres on Coolify):**
- [x] Postgres provisioned in Coolify; `DATABASE_URL` wired via `$env/dynamic/private`
- [x] `db.ts`: client + `createPlan` / `getPlan` (bumps views) / `stats`; lazy `plans` table
- [x] `POST /api/share` -> validates code, stores, returns 12-char nanoid id
- [x] `/<id>` route: `+page.server.ts` loads plan, renders read-only view + "Edit a copy"
- [x] `/<id>/raw`: returns raw base64 as `text/plain`
- [x] `/api/stats`: `{count, bytes, kib}` for monitoring

### Phase 3 — Quality of life
- [ ] Point-cost in node tooltip / on hover preview (`+N`)
- [ ] Node search / jump-to
- [ ] Import / export plan as JSON
- [ ] Autoplay progression between milestones
- [ ] Mobile / small-screen layout pass

### Phase 4 — Embeds, deploy & advanced
- [ ] Discord OG-embed preview images per shared plan (SSR `/<id>`)
- [ ] Per-subtree point pools (Breach/Delirium/etc. earned separately)
- [x] Dockerfile (oven/bun multi-stage, adapter-node, healthcheck) + `.dockerignore`
- [ ] Coolify deploy config for the `atlas.` subdomain (user-side: env, domain)
- [ ] Periodic cleanup / TTL policy for unused plans (if needed)

---

## Tree-update workflow

When a patch changes the atlas: drop the new `Atlas.json` into `data/`, run
`convert_atlas.py`, bump `treeVersion`. The converter is validated against the
poe2db `data_us.json` (matches on every field the renderer uses).

---

## Changelog

- **2026-06-05** — Plan created. Decisions locked (separate SvelteKit repo;
  ordered-steps + milestones timeline).
- **2026-06-05** — Sharing/storage decided: **adapter-node** (was adapter-static)
  for share API + SSR OG embeds; **Postgres on Coolify** for pobb.in-style
  `/<id>` + `/<id>/raw` short links (one `plans` table). Stateless URL-hash
  sharing remains the Phase-2 first step before DB-backed links.
- **2026-06-05** — **Phase 0 complete.** Scaffolded SvelteKit 5 + Tailwind 4 +
  adapter-node app; built the `convert -> bake -> tree.json` data pipeline
  (`bun run data`); ported the renderer/pathfinding/allocation into
  `AtlasTree.svelte` + `src/lib/atlas/*`. Full parity with the prototype (509
  nodes, arc edges, allocation, hover path-preview, tooltips), `bun run check`
  clean, no console errors. Pushed to GitHub (`juddisjudd/atlas.exilecompass.com`).
- **2026-06-05** — **Phase 1 complete.** `planner.svelte.ts` makes the ordered
  `steps` list the source of truth (replaces the old `Allocation` set); `cursor`
  scrubs progression, with taken vs "future" (dimmed) node/edge styling.
  `TimelinePanel.svelte` adds the scrubber + milestone markers (add/rename/
  delete/jump) and a step/points readout. Drag-to-reorder steps deferred.
- **2026-06-05** — **Phase 2 complete.** `share.ts` encodes plans to compact
  URL-safe base64 (versioned, treeVersion-stamped). Stateless `#code` links load
  on the main page; `Share` also persists to **Postgres** (`db.ts`) and returns a
  pobb.in-style `/<id>` short link, with `/<id>/raw` and `/api/stats`. `/[id]` is
  a read-only SSR view with an "Edit a copy" link and a stale-tree warning.
  Verified end-to-end against the live Coolify DB (create/fetch/raw/stats/400).
- **2026-06-05** — Game art: wired the real atlas art from `static/assets`
  (Atlas.json PascalCase refs -> lowercased `.webp`). The 6 root nodes now show
  their start-point icons; each subtree (and the main tree) gets its themed
  background art behind the cluster (sized to the cluster, positioned via the
  start node + illustration offset). `bake.mjs` emits a `backgrounds[]` layer;
  zoom-to-fit measures node bounds only so the large backdrops don't skew it.
  (Per-node skill icons still come from the `/icons` set — not in this art batch.)
- **2026-06-05** — Deploy prep + UI minimalism: added `Dockerfile` (oven/bun
  multi-stage, runs bake-via-bun + vite build, `bun build/index.js`, healthcheck)
  and `.dockerignore`; switched bake/build scripts `node`->`bun`. Trimmed the
  toolbar (removed Reset view + Labels), simplified the header to "N points",
  and made the timeline panel always visible. `bun run build` verified.
