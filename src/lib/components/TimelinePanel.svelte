<script lang="ts">
	import type { Planner } from '$lib/atlas/planner.svelte';
	import { tree } from '$lib/atlas/tree-data';

	let { planner, readonly = false }: { planner: Planner; readonly?: boolean } = $props();

	let trackEl = $state<HTMLDivElement>();
	let dragging = $state(false);

	// The track spans the FULL tree, so a partial plan reads as partial. The tree
	// is fully fillable, so "total points" is the number of allocatable nodes
	// (every non-root node) — not the stale totalPoints cap in the data.
	const ALLOCATABLE = tree.nodes.filter((n) => n.t !== 'root').length;
	const total = $derived(Math.max(ALLOCATABLE, planner.count, 1));
	const pct = (n: number) => (n / total) * 100;

	function setFromEvent(e: PointerEvent) {
		if (!trackEl) return;
		const r = trackEl.getBoundingClientRect();
		const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
		planner.setCursor(frac * total); // setCursor clamps to the planned length
	}
	function onTrackDown(e: PointerEvent) {
		dragging = true;
		setFromEvent(e);
		try {
			trackEl?.setPointerCapture(e.pointerId);
		} catch {
			/* synthetic / unsupported pointer */
		}
	}
	function onTrackMove(e: PointerEvent) {
		if (dragging) setFromEvent(e);
	}
	function onTrackUp() {
		dragging = false;
	}

	function prevMilestone() {
		const before = planner.milestones.filter((m) => m.at < planner.cursor).map((m) => m.at);
		planner.setCursor(before.length ? Math.max(...before) : 0);
	}
	function nextMilestone() {
		const after = planner.milestones.filter((m) => m.at > planner.cursor).map((m) => m.at);
		planner.setCursor(after.length ? Math.min(...after) : planner.count);
	}
</script>

<div class="timeline">
	<div class="bar">
		<div class="info">
			<b>{planner.cursor}</b> / {total} nodes · plan covers <b>{planner.count}</b>
		</div>
		<div class="spacer"></div>
		<button onclick={prevMilestone} title="Previous milestone">◀</button>
		<button onclick={nextMilestone} title="Next milestone">▶</button>
		{#if !readonly}
			<button class="primary" onclick={() => planner.addMilestone()}>+ Milestone</button>
		{/if}
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="track"
		bind:this={trackEl}
		onpointerdown={onTrackDown}
		onpointermove={onTrackMove}
		onpointerup={onTrackUp}
	>
		<!-- faint highlight for the portion of the tree the plan actually covers -->
		<div class="planned" style:width="{pct(planner.count)}%"></div>
		<!-- progress up to the current scrub position -->
		<div class="fill" style:width="{pct(planner.cursor)}%"></div>
		<!-- one tick line per allocatable point, so the full scale is visible -->
		<div class="ticks" style:--n={total}></div>
		{#if planner.count < total}
			<div
				class="planend"
				style:left="{pct(planner.count)}%"
				title="End of plan ({planner.count} points)"
			></div>
		{/if}
		{#each planner.milestones as m, i (i)}
			<div class="mstick" style:left="{pct(m.at)}%" title={m.label}></div>
		{/each}
		<div class="thumb" style:left="{pct(planner.cursor)}%"></div>
	</div>

	{#if planner.milestones.length}
		<div class="mlist">
			{#each planner.milestones as m, i (i)}
				<div class="chip">
					<button class="jump" title="Jump to step {m.at}" onclick={() => planner.setCursor(m.at)}
						>@{m.at}</button
					>
					{#if readonly}
						<span class="label ro">{m.label}</span>
					{:else}
						<input
							class="label"
							name="milestone-{i}"
							aria-label="Milestone label"
							value={m.label}
							oninput={(e) => planner.updateMilestone(i, { label: e.currentTarget.value })}
						/>
						<button class="del" title="Delete" onclick={() => planner.removeMilestone(i)}>×</button>
					{/if}
				</div>
			{/each}
		</div>
	{:else if !readonly}
		<!-- reserve the row so adding the first milestone doesn't shift the layout -->
		<div class="mlist empty">Set your first milestone…</div>
	{/if}
</div>

<style>
	.timeline {
		background: var(--panel);
		border-top: 1px solid var(--edge);
		padding: 8px 14px 10px;
		color: var(--text);
		font: 12px/1.4 var(--font-sans);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.info b {
		color: var(--text);
	}
	.spacer {
		flex: 1;
	}
	.bar button {
		background: var(--panel-2);
		border: 1px solid var(--edge);
		color: var(--text);
		border-radius: var(--radius-sm);
		padding: 3px 9px;
		font-size: 12px;
		cursor: pointer;
	}
	.bar button:hover {
		border-color: var(--text);
		color: var(--text);
	}
	.bar button.primary {
		border-color: var(--ok-deep);
		color: var(--ok-bright);
	}
	.bar button.primary:hover {
		border-color: var(--ok);
		color: var(--ok);
	}

	.track {
		position: relative;
		height: 22px;
		border-radius: 11px;
		background: var(--panel-2);
		cursor: pointer;
		touch-action: none;
	}
	/* region of the full tree the plan actually covers */
	.planned {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 11px;
		pointer-events: none;
	}
	.fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: linear-gradient(90deg, var(--ok-deep), var(--ok));
		border-radius: 11px;
		pointer-events: none;
	}
	/* scale gradations: minor line every 10 points, brighter major every 50
	   (per-point lines would be unreadably dense at ~500 points) */
	.ticks {
		position: absolute;
		inset: 0;
		border-radius: 11px;
		pointer-events: none;
		background-image:
			repeating-linear-gradient(
				to right,
				rgba(255, 255, 255, 0.22) 0 1px,
				transparent 1px calc(100% / var(--n) * 50)
			),
			repeating-linear-gradient(
				to right,
				rgba(255, 255, 255, 0.09) 0 1px,
				transparent 1px calc(100% / var(--n) * 10)
			);
	}
	/* boundary between planned and not-yet-planned points */
	.planend {
		position: absolute;
		top: -2px;
		bottom: -2px;
		width: 2px;
		background: var(--faint);
		transform: translateX(-1px);
		pointer-events: none;
	}
	.mstick {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: var(--text);
		transform: translateX(-1px);
		pointer-events: none;
	}
	.thumb {
		position: absolute;
		top: 50%;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ffffff;
		border: 2px solid var(--panel);
		transform: translate(-50%, -50%);
		pointer-events: none;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
	}

	.mlist {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--panel-2);
		border: 1px solid var(--edge);
		border-radius: var(--radius-sm);
		padding: 2px 4px 2px 6px;
	}
	.chip .jump {
		background: none;
		border: none;
		color: var(--text);
		font: 11px var(--font-mono);
		cursor: pointer;
		padding: 0 2px;
	}
	.chip .label {
		background: var(--bg);
		border: 1px solid var(--edge-soft);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: 12px;
		padding: 2px 6px;
		width: 130px;
	}
	.chip .label:focus {
		outline: none;
		border-color: var(--edge-strong);
	}
	.chip .label.ro {
		border-color: transparent;
		background: none;
		width: auto;
	}
	.chip .del {
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		padding: 0 4px;
	}
	.chip .del:hover {
		color: var(--gold-bright);
	}
	/* empty-state placeholder: same vertical footprint as a chip row */
	.mlist.empty {
		align-items: center;
		min-height: 26px;
		color: var(--faint);
		font-size: 12px;
		font-style: italic;
	}
</style>
