// Fetch the latest PoE2 atlas data from the repoe-fork export into data/, then
// regenerate the baked tree (convert -> extract labels -> bake). The hand-curated
// data/selector-options.json is NOT overwritten.
// Source: https://repoe-fork.github.io/poe2/
// Run:  bun scripts/update-data.mjs   (or: bun run update)
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://repoe-fork.github.io/poe2/';

// remote path  ->  local path (relative to repo root)
const FILES = [
	['passive_skill_trees/Atlas.json', 'data/Atlas.json'],
	['stat_translations/atlas_variant_stat_descriptions.json', 'data/source/atlas_variant_stat_descriptions.json'],
	['stat_translations/atlas_stat_descriptions.json', 'data/source/atlas_stat_descriptions.json']
];

async function fetchTo(remote, local) {
	const url = BASE + remote;
	process.stdout.write(`  GET ${url} ... `);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	const text = await res.text();
	JSON.parse(text); // validate it's real JSON before we overwrite anything
	const dst = join(root, local);
	await mkdir(dirname(dst), { recursive: true });
	await writeFile(dst, text);
	console.log(`${(text.length / 1024).toFixed(0)} KB -> ${local}`);
}

function run(cmd, args) {
	console.log(`\n$ ${cmd} ${args.join(' ')}`);
	const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
	if (r.status !== 0) throw new Error(`${cmd} exited with ${r.status}`);
}

console.log(`Fetching atlas data from ${BASE}`);
for (const [remote, local] of FILES) await fetchTo(remote, local);

// Atlas.json -> data_us.json
run('python', ['scripts/convert_atlas.py', 'data/Atlas.json', 'data/data_us.json']);
// option labels (only those referenced by the curated map)
run('python', [
	'scripts/extract_variant_labels.py',
	'data/source/atlas_variant_stat_descriptions.json',
	'data/source/atlas_stat_descriptions.json',
	'data/atlas_variant_labels.json'
]);
// bake the render-ready tree
run('bun', ['scripts/bake.mjs']);

console.log('\nDone. Review `git diff` and rebuild the app.');
