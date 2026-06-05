// Loads the baked atlas tree and exposes typed lookups shared across the app.
import treeJson from './tree.json';

export type NodeType = 'normal' | 'notable' | 'keystone' | 'root';

export interface TreeNode {
	h: number; // hash / id
	x: number;
	y: number;
	g: number; // group
	t: NodeType;
	s: string; // subtree name
	n: string; // display name
	id: string; // internal id (AtlasRitualNotable16_ ...)
	ic: string; // local icon path (/icons/x.webp)
	st: string[]; // stat lines
}

export interface TreeEdge {
	a: number;
	b: number;
	// Present only for arc edges (same group + orbit): draw along the orbit circle.
	r?: number;
	cx?: number;
	cy?: number;
	sw?: number; // sweep flag
	lg?: number; // large-arc flag
}

export interface TreeBackground {
	img: string;
	cx: number;
	cy: number;
	size: number;
	sub: string;
}

export interface TreeData {
	version: string;
	constants: { orbitRadii: number[]; skillsPerOrbit: number[] };
	roots: number[];
	subtreeByRoot: Record<string, string>;
	bounds: { minX: number; minY: number; maxX: number; maxY: number };
	totalPoints: number;
	ascendancyPoints: number;
	backgrounds: TreeBackground[];
	nodes: TreeNode[];
	edges: TreeEdge[];
}

export const tree = treeJson as unknown as TreeData;

export const nodeByHash: Map<number, TreeNode> = new Map(tree.nodes.map((n) => [n.h, n]));

export const rootSet: Set<number> = new Set(tree.roots);

/** Undirected adjacency list, hash -> neighbour hashes. */
export const adjacency: Map<number, number[]> = (() => {
	const m = new Map<number, number[]>();
	const link = (a: number, b: number) => {
		const list = m.get(a);
		if (list) list.push(b);
		else m.set(a, [b]);
	};
	for (const e of tree.edges) {
		link(e.a, e.b);
		link(e.b, e.a);
	}
	return m;
})();

export const SUBTREE_COLORS: Record<string, string> = {
	Ritual: '#d9c52b',
	Breach: '#d96c1d',
	Delirium: '#2bd9c1',
	Incursion: '#d92b6a',
	Abyss: '#6e2bd9',
	Generic: '#6b6f7a'
};

export const NODE_RADIUS: Record<NodeType, number> = {
	normal: 32,
	notable: 40,
	keystone: 55,
	root: 80
};

export type FrameState = 'normal' | 'canallocate' | 'active';

// Real game node frames (3 allocation states each). frameD = outer frame
// diameter, iconD = inner hole the skill icon fills (native px). Scaled by
// FRAME_SCALE for the tree.
export const NODE_FRAME: Record<'normal' | 'notable' | 'keystone', { base: string; frameD: number; iconD: number }> = {
	normal: { base: '/assets/passiveskillscreenpassiveframe', frameD: 84, iconD: 64 },
	notable: { base: '/assets/atlaspassiveskillscreennotableframe', frameD: 152, iconD: 100 },
	keystone: { base: '/assets/atlaspassiveskillscreenkeystoneframe', frameD: 220, iconD: 132 }
};
export const FRAME_SCALE = 0.85;

export function frameUrl(t: 'normal' | 'notable' | 'keystone', state: FrameState): string {
	return NODE_FRAME[t].base + state + '.webp';
}
