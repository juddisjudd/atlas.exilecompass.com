// Reactive allocation state (Svelte 5 runes). Owns the set of allocated nodes
// and the rules for growing / shrinking the tree.
import { SvelteSet } from 'svelte/reactivity';
import { adjacency, rootSet } from './tree-data';
import { pathTo, reachableAllocated } from './pathfinding';

export class Allocation {
	allocated = new SvelteSet<number>();

	get count(): number {
		return this.allocated.size;
	}

	isAllocated(h: number): boolean {
		return this.allocated.has(h);
	}

	isStart(h: number): boolean {
		return rootSet.has(h);
	}

	inTree(h: number): boolean {
		return rootSet.has(h) || this.allocated.has(h);
	}

	/** A node directly takeable next (neighbours something in the tree). */
	isReachable(h: number): boolean {
		if (this.inTree(h)) return false;
		const ns = adjacency.get(h);
		if (!ns) return false;
		for (const nb of ns) if (this.inTree(nb)) return true;
		return false;
	}

	/** Chain [anchor, ..., target] a click would allocate, or null. */
	pathTo(h: number): number[] | null {
		return pathTo(h, this.allocated);
	}

	/** Allocate the whole path to a node, or remove it (pruning orphans). */
	toggle(h: number): void {
		if (this.isStart(h)) return;
		if (this.allocated.has(h)) {
			this.allocated.delete(h);
			const keep = reachableAllocated(this.allocated);
			for (const a of [...this.allocated]) if (!keep.has(a)) this.allocated.delete(a);
		} else {
			const chain = pathTo(h, this.allocated);
			if (!chain) return;
			for (let i = 1; i < chain.length; i++) this.allocated.add(chain[i]);
		}
	}

	clear(): void {
		this.allocated.clear();
	}
}
