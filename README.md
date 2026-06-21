# Atlas Planner

A planner for the Path of Exile 2 Atlas passive skill tree, live at
[atlas.exilecompass.com](https://atlas.exilecompass.com).

Players unlock Atlas points gradually as they progress, so the useful question is
not just _which_ nodes to take but in _what order_. This planner treats a build as
an ordered progression: clicking a node auto-paths to it and appends the path to an
allocation timeline. You can mark named milestones along that timeline, scrub back
and forth to see the tree at any point in the progression, and share the result as a
link.

## Features

- Full interactive Atlas tree (509 nodes across the generic tree and the league
  subtrees) rendered as a pannable, zoomable SVG canvas.
- Order-aware allocation: clicking a node BFS-paths from the allocated set and
  appends the path; removing a node prunes any orphaned dependents.
- A progression timeline with a scrubber and named milestone markers; nodes ahead
  of the cursor render as "future".
- Multi-choice selector nodes, with the chosen option carried through to shares.
- A live modifier summary that aggregates allocated nodes' stats per subtree.
- Two ways to share a plan:
  - **Stateless** — the whole plan is encoded into the URL hash, no backend
    required.
  - **Short links** — a plan is persisted and given a short id, served as a
    read-only view at `/<id>` and as the raw code at `/<id>/raw`.

## Tech stack

- [SvelteKit](https://svelte.dev/docs/kit) with Svelte 5 (runes mode) and
  TypeScript
- [Tailwind CSS](https://tailwindcss.com/) 4 and [Vite](https://vite.dev/) 8
- [`@sveltejs/adapter-node`](https://svelte.dev/docs/kit/adapter-node) for the
  server build
- PostgreSQL for short-link storage (via the [`postgres`](https://github.com/porsager/postgres) client)
- [Bun](https://bun.sh/) as the package manager and runtime

## Getting started

Requires Bun and a `python` on your PATH (the data-conversion scripts are Python).

```sh
bun install
bun run dev          # start the dev server
```

Short-link persistence needs a Postgres database. Copy `.env.example` to `.env`
and set `DATABASE_URL`. Without it the app still runs and stateless hash-based
sharing works; only short-link creation and lookup are disabled.

### Scripts

| Command           | Description                                         |
| ----------------- | --------------------------------------------------- |
| `bun run dev`     | Vite dev server                                     |
| `bun run build`   | Bake the tree, then build for production            |
| `bun run preview` | Preview the production build                        |
| `bun run check`   | Type-check with `svelte-check`                      |
| `bun run lint`    | Prettier and ESLint checks                          |
| `bun run format`  | Format with Prettier                                |
| `bun run update`  | Fetch the latest Atlas data and regenerate the tree |

## Data pipeline

The rendered tree (`src/lib/atlas/tree.json`) is a build artifact generated from
the game's Atlas export under `data/`. It is committed so the app builds without
the pipeline, but it should not be edited by hand; edit the sources and re-bake.

```
repoe-fork export  ->  data/Atlas.json + data/source/*.json   (bun run update fetches these)
data/Atlas.json    ->  data/data_us.json                      (scripts/convert_atlas.py)
data/source/*.json ->  data/atlas_variant_labels.json         (scripts/extract_variant_labels.py)
the above + data/selector-options.json -> src/lib/atlas/tree.json  (scripts/bake.mjs)
```

`bun run update` runs the whole chain against the latest published data.
`bun run bake` re-bakes from the local `data/` files only. `data/selector-options.json`
is hand-curated and is not overwritten by an update.

When the bake stamps a new tree version, older share codes built against a previous
version are detected and flagged rather than silently misrendered.

## Deployment

A multi-stage [`Dockerfile`](Dockerfile) (oven/bun, adapter-node, healthcheck) is
included. The server listens on `PORT` (default 3000) and reads `DATABASE_URL` from
the environment.

```sh
docker build -t atlas-planner .
docker run -p 3000:3000 -e DATABASE_URL=... atlas-planner
```

## License

Licensed under the [GNU AGPL-3.0](LICENSE).

## Disclaimer

This is an unofficial fan project and is not affiliated with or endorsed by Grinding
Gear Games. Path of Exile and all related assets are property of Grinding Gear Games.
