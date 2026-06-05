// Bake data/data_us.json (+ data/Atlas.json for type flags) into a compact,
// render-ready tree at src/lib/atlas/tree.json:
//   - node screen positions (orbit -> x/y)
//   - edges with arc geometry for same-group/same-orbit links
//   - node type (root/notable/keystone/normal; mastery nodes are dropped)
//   - subtree colour (BFS component from each root)
//   - local icon paths (/icons/<name>.webp)
//
// Run:  bun run bake     (or: node scripts/bake.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataUsRaw = readFileSync(join(root, 'data/data_us.json'), 'utf8');
const dataUs = JSON.parse(dataUsRaw);
const atlas = JSON.parse(readFileSync(join(root, 'data/Atlas.json'), 'utf8'));

const { orbitRadii, skillsPerOrbit } = dataUs.constants;
const groups = dataUs.groups;
const nodesIn = dataUs.nodes;
const passives = atlas.passives; // hash -> game flags

const TWO_PI = Math.PI * 2;

function nodePos(n) {
	const g = groups[String(n.group)];
	if (!g) return null;
	const o = n.orbit ?? 0;
	const a = (TWO_PI * (n.orbitIndex ?? 0)) / skillsPerOrbit[o];
	return {
		x: +(g.x + orbitRadii[o] * Math.sin(a)).toFixed(2),
		y: +(g.y - orbitRadii[o] * Math.cos(a)).toFixed(2)
	};
}

function typeOf(hash) {
	const p = passives[String(hash)] || {};
	if (p.is_atlas_root) return 'root';
	if (p.is_icon_only) return 'mastery';
	if (p.is_keystone) return 'keystone';
	if (p.is_notable) return 'notable';
	return 'normal';
}

function iconPath(url) {
	if (!url) return '';
	return '/icons/' + url.split('/').pop();
}

// Game art lives in static/assets as lowercased basenames + .webp, while
// Atlas.json references it in PascalCase paths (e.g.
// ".../StartingPointRitualActive" -> "/assets/startingpointritualactive.webp").
function assetPath(ref) {
	if (!ref) return '';
	return '/assets/' + ref.split('/').pop().toLowerCase() + '.webp';
}

// ---- adjacency (real edges only) ----
const adj = new Map();
const linkAdj = (a, b) => {
	if (!adj.has(a)) adj.set(a, []);
	adj.get(a).push(b);
};
for (const [h, n] of Object.entries(nodesIn)) {
	if (h === 'root') continue;
	for (const c of n.connections || []) {
		linkAdj(h, String(c.id));
		linkAdj(String(c.id), h);
	}
}

// ---- subtree colouring: BFS the component of each root ----
const roots = nodesIn.root.out.map(String);
const subtreeByRoot = {};
const subtreeOf = {};
for (const r of roots) {
	const name = (passives[r]?.id || '')
		.replace(/^Atlas/, '')
		.replace(/Start_?$/, '');
	subtreeByRoot[r] = name || 'Generic';
	// flood-fill this root's component
	const stack = [r];
	const seen = new Set([r]);
	while (stack.length) {
		const cur = stack.pop();
		subtreeOf[cur] = subtreeByRoot[r];
		for (const nb of adj.get(cur) || []) {
			if (!seen.has(nb)) {
				seen.add(nb);
				stack.push(nb);
			}
		}
	}
}

// ---- start-point art + subtree background art (from Atlas.json) ----
const rootImage = {}; // root hash -> start-point icon
const rootBg = {}; // root hash -> { img, ix, iy }
for (const r of roots) {
	const sub = passives[r]?.atlas_subtree;
	rootImage[r] = sub?.image
		? assetPath(sub.image)
		: '/assets/startingpointgeneralactive.webp';
	rootBg[r] = {
		img: sub?.background ? assetPath(sub.background) : '/assets/atlasmaintreebg.webp',
		ix: sub?.illustration?.x ?? 0,
		iy: sub?.illustration?.y ?? 0
	};
}

// ---- nodes (drop mastery: decorative, no connections, never rendered) ----
const pos = {};
const nodes = [];
for (const [h, n] of Object.entries(nodesIn)) {
	if (h === 'root') continue;
	const t = typeOf(h);
	const p = nodePos(n);
	if (p) pos[h] = p;
	if (t === 'mastery') continue;
	nodes.push({
		h: +h,
		x: p?.x ?? 0,
		y: p?.y ?? 0,
		g: n.group,
		t,
		s: subtreeOf[h] || 'Generic',
		n: n.name || n.id || String(h),
		id: n.id || '',
		ic: t === 'root' ? rootImage[h] || '' : iconPath(n.icon),
		st: n.stats || []
	});
}

// ---- subtree background images, sized to each cluster ----
const backgrounds = [];
for (const r of roots) {
	const name = subtreeByRoot[r];
	const members = nodes.filter((n) => n.s === name);
	if (!members.length) continue;
	const xs = members.map((n) => n.x);
	const ys = members.map((n) => n.y);
	const minX = Math.min(...xs),
		maxX = Math.max(...xs),
		minY = Math.min(...ys),
		maxY = Math.max(...ys);
	const w = maxX - minX,
		h = maxY - minY;
	const rp = pos[r] || { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
	const generic = name === 'Generic';
	// subtrees: centre on the start node + its illustration offset (matches the
	// game); generic main tree: centre on the cluster, nudged up a little.
	const GENERIC_BG_Y_OFFSET = 400; // smaller y = up
	// Fine-tune so the medallion ring sits on the start node (larger y = down,
	// which raises the compass within the medallion).
	const SUBTREE_BG_Y_OFFSET = 90;
	const cx = generic ? (minX + maxX) / 2 : rp.x + rootBg[r].ix;
	const cy = generic
		? (minY + maxY) / 2 - GENERIC_BG_Y_OFFSET
		: rp.y + rootBg[r].iy + SUBTREE_BG_Y_OFFSET;
	const size = Math.round(Math.max(w, h) * (generic ? 1.281 : 1.9));
	backgrounds.push({
		img: rootBg[r].img,
		cx: +cx.toFixed(1),
		cy: +cy.toFixed(1),
		size,
		sub: name
	});
}

// ---- edges (dedup) with arc geometry for same-group/same-orbit links ----
const seenEdge = new Set();
const edges = [];
for (const [h, n] of Object.entries(nodesIn)) {
	if (h === 'root') continue;
	const a = n;
	for (const c of n.connections || []) {
		const tHash = String(c.id);
		const b = nodesIn[tHash];
		if (!b) continue;
		const key = h < tHash ? h + '|' + tHash : tHash + '|' + h;
		if (seenEdge.has(key)) continue;
		seenEdge.add(key);
		const edge = { a: +h, b: +tHash };
		if (a.group === b.group && a.orbit === b.orbit && a.orbit !== 0) {
			const g = groups[String(a.group)];
			const sp = skillsPerOrbit[a.orbit];
			const delta = ((b.orbitIndex - a.orbitIndex) % sp + sp) % sp;
			edge.r = orbitRadii[a.orbit];
			edge.cx = +g.x.toFixed(2);
			edge.cy = +g.y.toFixed(2);
			edge.sw = delta <= sp / 2 ? 1 : 0;
			edge.lg = 0;
		}
		edges.push(edge);
	}
}

// ---- bounds from group positions ----
const gx = Object.values(groups).map((g) => g.x);
const gy = Object.values(groups).map((g) => g.y);

const out = {
	version: createHash('sha256').update(dataUsRaw).digest('hex').slice(0, 12),
	constants: { orbitRadii, skillsPerOrbit },
	roots: roots.map(Number),
	subtreeByRoot,
	bounds: {
		minX: Math.floor(Math.min(...gx)),
		minY: Math.floor(Math.min(...gy)),
		maxX: Math.ceil(Math.max(...gx)),
		maxY: Math.ceil(Math.max(...gy))
	},
	totalPoints: dataUs.points?.totalPoints ?? 0,
	ascendancyPoints: dataUs.points?.ascendancyPoints ?? 0,
	backgrounds,
	nodes,
	edges
};

const dst = join(root, 'src/lib/atlas/tree.json');
writeFileSync(dst, JSON.stringify(out));
const arcs = edges.filter((e) => e.r != null).length;
console.log(
	`baked ${dst}\n  version ${out.version}\n  ${nodes.length} nodes (mastery dropped), ${edges.length} edges (${arcs} arcs)`
);
