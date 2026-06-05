// Graph helpers for allocation: shortest path from the current tree to a target,
// and orphan pruning after a node is removed.
import { adjacency, rootSet } from './tree-data';

type HashSet = { has(h: number): boolean; [Symbol.iterator](): Iterator<number> };

/**
 * Multi-source BFS from every in-tree node (roots + allocated) to `target`.
 * Returns the full chain [anchor, ..., target] (anchor is in-tree), or null if
 * the target is already in the tree / unreachable.
 */
export function pathTo(target: number, allocated: HashSet): number[] | null {
	const inTree = (h: number) => rootSet.has(h) || allocated.has(h);
	if (inTree(target)) return null;

	const parent = new Map<number, number>();
	const visited = new Set<number>();
	const queue: number[] = [];
	for (const r of rootSet) {
		visited.add(r);
		queue.push(r);
	}
	for (const a of allocated) {
		if (!visited.has(a)) {
			visited.add(a);
			queue.push(a);
		}
	}

	let head = 0;
	let found = false;
	while (head < queue.length) {
		const cur = queue[head++];
		if (cur === target) {
			found = true;
			break;
		}
		const ns = adjacency.get(cur);
		if (!ns) continue;
		for (const nb of ns) {
			if (!visited.has(nb)) {
				visited.add(nb);
				parent.set(nb, cur);
				queue.push(nb);
			}
		}
	}
	if (!found) return null;

	const chain = [target];
	let c = target;
	while (parent.has(c)) {
		c = parent.get(c)!;
		chain.push(c);
	}
	chain.reverse();
	return chain;
}

/**
 * Set of allocated nodes still connected to a start through the allocated set.
 * Anything not returned has been orphaned (e.g. after removing a mid-path node).
 */
export function reachableAllocated(allocated: HashSet): Set<number> {
	const keep = new Set<number>();
	const stack: number[] = [...rootSet];
	while (stack.length) {
		const cur = stack.pop()!;
		const ns = adjacency.get(cur);
		if (!ns) continue;
		for (const nb of ns) {
			if (allocated.has(nb) && !keep.has(nb)) {
				keep.add(nb);
				stack.push(nb);
			}
		}
	}
	return keep;
}
