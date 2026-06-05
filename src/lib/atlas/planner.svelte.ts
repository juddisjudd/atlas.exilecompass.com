// Reactive planner state (Svelte 5 runes). The ordered `steps` list is the
// source of truth for allocation: editing always operates on the full plan,
// while `cursor` is a view position used to scrub through the progression
// (steps before the cursor are "taken", steps after it are "future").
import { rootSet, adjacency } from './tree-data';
import { pathTo as bfsPath, reachableAllocated } from './pathfinding';

export interface Milestone {
	at: number; // step index the milestone sits at
	label: string;
}

export class Planner {
	steps = $state<number[]>([]); // node hashes, in allocation order
	cursor = $state(0); // how many steps are "taken" in the current view
	milestones = $state<Milestone[]>([]);

	// hash -> position in steps
	stepIndex = $derived.by(() => {
		const m = new Map<number, number>();
		this.steps.forEach((h, i) => m.set(h, i));
		return m;
	});
	planned = $derived(new Set(this.steps));

	get count(): number {
		return this.steps.length;
	}

	indexOf(h: number): number {
		return this.stepIndex.get(h) ?? -1;
	}
	isPlanned(h: number): boolean {
		return this.stepIndex.has(h);
	}
	/** In the plan AND before the view cursor. */
	isTaken(h: number): boolean {
		const i = this.stepIndex.get(h);
		return i !== undefined && i < this.cursor;
	}
	/** In the plan but after the view cursor (comes later). */
	isFuture(h: number): boolean {
		const i = this.stepIndex.get(h);
		return i !== undefined && i >= this.cursor;
	}

	isStart(h: number): boolean {
		return rootSet.has(h);
	}
	/** Editing connectivity uses the FULL plan, independent of the view cursor. */
	inTree(h: number): boolean {
		return rootSet.has(h) || this.stepIndex.has(h);
	}
	isReachable(h: number): boolean {
		if (this.inTree(h)) return false;
		const ns = adjacency.get(h);
		if (!ns) return false;
		for (const nb of ns) if (this.inTree(nb)) return true;
		return false;
	}
	pathTo(h: number): number[] | null {
		return bfsPath(h, this.planned);
	}

	/** Allocate the whole path to a node, or remove it (pruning orphans). */
	toggle(h: number): void {
		if (rootSet.has(h)) return;
		if (this.stepIndex.has(h)) {
			const set = new Set(this.steps);
			set.delete(h);
			const keep = reachableAllocated(set);
			this.steps = this.steps.filter((s) => s !== h && keep.has(s));
			this.#clampMilestones();
		} else {
			const chain = bfsPath(h, this.planned);
			if (!chain) return;
			const add = chain.slice(1).filter((x) => !this.stepIndex.has(x));
			if (add.length) this.steps = [...this.steps, ...add];
		}
		this.cursor = this.steps.length; // snap the view to the live end after an edit
	}

	clear(): void {
		this.steps = [];
		this.cursor = 0;
		this.milestones = [];
	}

	setCursor(k: number): void {
		this.cursor = Math.max(0, Math.min(this.steps.length, Math.round(k)));
	}

	addMilestone(label?: string): void {
		const m: Milestone = {
			at: this.cursor,
			label: label ?? `Milestone ${this.milestones.length + 1}`
		};
		this.milestones = [...this.milestones, m].sort((a, b) => a.at - b.at);
	}
	updateMilestone(i: number, patch: Partial<Milestone>): void {
		this.milestones = this.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m));
	}
	removeMilestone(i: number): void {
		this.milestones = this.milestones.filter((_, j) => j !== i);
	}
	#clampMilestones(): void {
		const n = this.steps.length;
		this.milestones = this.milestones.map((m) => (m.at > n ? { ...m, at: n } : m));
	}
}
