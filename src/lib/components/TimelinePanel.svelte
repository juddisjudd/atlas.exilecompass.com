<script lang="ts">
	import type { Planner } from '$lib/atlas/planner.svelte';

	let { planner }: { planner: Planner } = $props();

	let trackEl = $state<HTMLDivElement>();
	let dragging = $state(false);

	const pct = (n: number) => (planner.count ? (n / planner.count) * 100 : 0);

	function setFromEvent(e: PointerEvent) {
		if (!trackEl || !planner.count) return;
		const r = trackEl.getBoundingClientRect();
		const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
		planner.setCursor(frac * planner.count);
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
			Step <b>{planner.cursor}</b> / {planner.count} · <b>{planner.cursor}</b> pts
		</div>
		<div class="spacer"></div>
		<button onclick={prevMilestone} title="Previous milestone">◀</button>
		<button onclick={nextMilestone} title="Next milestone">▶</button>
		<button class="primary" onclick={() => planner.addMilestone()}>+ Milestone</button>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="track"
		bind:this={trackEl}
		onpointerdown={onTrackDown}
		onpointermove={onTrackMove}
		onpointerup={onTrackUp}
	>
		<div class="fill" style:width="{pct(planner.cursor)}%"></div>
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
					<input
						class="label"
						name="milestone-{i}"
						aria-label="Milestone label"
						value={m.label}
						oninput={(e) => planner.updateMilestone(i, { label: e.currentTarget.value })}
					/>
					<button class="del" title="Delete" onclick={() => planner.removeMilestone(i)}>×</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.timeline {
		background: #0b0b0b;
		border-top: 1px solid #1d1d1d;
		padding: 8px 14px 10px;
		color: #d8dae0;
		font:
			12px/1.4 system-ui,
			sans-serif;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.info b {
		color: #f0c850;
	}
	.spacer {
		flex: 1;
	}
	.bar button {
		background: #161616;
		border: 1px solid #2a2a2a;
		color: #d8dae0;
		border-radius: 4px;
		padding: 3px 9px;
		font-size: 12px;
		cursor: pointer;
	}
	.bar button:hover {
		border-color: #c9aa45;
		color: #c9aa45;
	}
	.bar button.primary {
		border-color: #3a5a3a;
		color: #9be8a8;
	}
	.bar button.primary:hover {
		border-color: #4ade80;
		color: #4ade80;
	}

	.track {
		position: relative;
		height: 22px;
		border-radius: 11px;
		background: #1a1a1a;
		cursor: pointer;
		touch-action: none;
	}
	.fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: linear-gradient(90deg, #2f6f47, #4ade80);
		border-radius: 11px;
	}
	.mstick {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: #f0c850;
		transform: translateX(-1px);
		pointer-events: none;
	}
	.thumb {
		position: absolute;
		top: 50%;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ffe089;
		border: 2px solid #0b0b0b;
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
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 4px;
		padding: 2px 4px 2px 6px;
	}
	.chip .jump {
		background: none;
		border: none;
		color: #c9aa45;
		font:
			11px ui-monospace,
			monospace;
		cursor: pointer;
		padding: 0 2px;
	}
	.chip .label {
		background: #0d0d0d;
		border: 1px solid #242424;
		border-radius: 3px;
		color: #d8dae0;
		font-size: 12px;
		padding: 2px 6px;
		width: 130px;
	}
	.chip .label:focus {
		outline: none;
		border-color: #c9aa45;
	}
	.chip .del {
		background: none;
		border: none;
		color: #8a8d97;
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		padding: 0 4px;
	}
	.chip .del:hover {
		color: #e06a6a;
	}
</style>
