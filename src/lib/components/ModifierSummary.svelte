<script lang="ts">
	// Floating "Modifiers" panel: the combined stat lines of all allocated nodes
	// (up to the timeline cursor), merged and grouped by subtree. Collapses to a
	// pill like the notes panel.
	import { Planner } from '$lib/atlas/planner.svelte';
	import { summarize, totals } from '$lib/atlas/stats';
	import { SUBTREE_COLORS } from '$lib/atlas/tree-data';

	let { planner }: { planner: Planner } = $props();
	let open = $state(false);

	const META: Record<string, { label: string; icon: string }> = {
		Generic: { label: 'Main', icon: '/misc/atlas.webp' },
		Ritual: { label: 'Ritual', icon: '/misc/ritual.webp' },
		Breach: { label: 'Breach', icon: '/misc/breach.webp' },
		Delirium: { label: 'Delirium', icon: '/misc/delirium.webp' },
		Incursion: { label: 'Incursion', icon: '/misc/incursion.webp' },
		Abyss: { label: 'Abyss', icon: '/misc/abyss.webp' },
		Expedition: { label: 'Expedition', icon: '/misc/expedition.webp' }
	};

	// Follows the timeline cursor, so scrubbing shows the modifiers you'd have
	// at that point in the progression.
	const taken = $derived(planner.steps.slice(0, planner.cursor));
	const groups = $derived(summarize(taken, planner.choices));
	const headline = $derived(totals(taken));
	const lineCount = $derived(groups.reduce((sum, g) => sum + g.lines.length, 0));
	const partial = $derived(planner.cursor < planner.count);
</script>

<!-- stop wheel events so scrolling the list doesn't zoom the tree behind it -->
<div class="mods" class:open onwheel={(e) => e.stopPropagation()}>
	{#if open}
		<div class="mods-head">
			<span class="mods-title">
				Modifiers
				{#if partial}<span class="mods-at">at step {planner.cursor}/{planner.count}</span>{/if}
			</span>
			<button
				class="mods-collapse"
				title="Collapse modifiers"
				aria-label="Collapse modifiers"
				onclick={() => (open = false)}>–</button
			>
		</div>
		<div class="mods-list">
			{#if lineCount === 0}
				<p class="mods-empty">Allocate nodes to see their combined modifiers.</p>
			{:else}
				{#if headline.length}
					<div class="totals">
						<div class="totals-head">Totals</div>
						{#each headline as t (t.label)}
							<div class="trow">
								<span class="tlabel">{t.label}</span>
								<span class="tval">{t.base ? `${t.base}%` : '–'}</span>
								{#if t.situational}
									<span
										class="tsit"
										title="From conditional lines (area-specific, per-modifier, …) not counted in the total"
										>+{t.situational}%</span
									>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
				{#each groups as g (g.subtree)}
					{@const meta = META[g.subtree]}
					<div class="grp">
						<div class="grp-head" style:--grp-color={SUBTREE_COLORS[g.subtree]}>
							{#if meta}<img class="grp-icon" src={meta.icon} alt="" />{/if}
							<span>{meta?.label ?? g.subtree}</span>
						</div>
						{#each g.lines as l (l.text)}
							<div class="line" title={l.count > 1 ? `from ${l.count} nodes` : undefined}>
								<span class="txt">{l.text}</span>
								{#if l.count > 1}<span class="mult">×{l.count}</span>{/if}
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	{:else}
		<button class="mods-pill" title="Show combined modifiers" onclick={() => (open = true)}>
			Modifiers{#if lineCount}<span class="mods-count">{lineCount}</span>{/if}
		</button>
	{/if}
</div>

<style>
	.mods {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 11;
	}
	.mods-pill {
		background: rgba(15, 15, 15, 0.85);
		border: 1px solid #2a2a2a;
		border-radius: 4px;
		color: #c4c7cf;
		font:
			12px system-ui,
			sans-serif;
		padding: 6px 10px;
		cursor: pointer;
	}
	.mods-pill:hover {
		border-color: #c9aa45;
		color: #c9aa45;
	}
	.mods-count {
		color: #f0c850;
		font:
			11px ui-monospace,
			monospace;
		margin-left: 6px;
	}
	.mods.open {
		display: flex;
		flex-direction: column;
		width: 420px;
		max-width: 84vw;
		max-height: min(62vh, 560px);
		background: rgba(15, 15, 15, 0.92);
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		padding: 8px 10px 10px;
	}
	.mods-head {
		display: flex;
		align-items: center;
		margin-bottom: 6px;
	}
	.mods-title {
		flex: 1;
		color: #8a8d97;
		font:
			600 11px system-ui,
			sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.mods-at {
		color: #f0c850;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		margin-left: 6px;
	}
	.mods-collapse {
		background: none;
		border: none;
		color: #8a8d97;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}
	.mods-collapse:hover {
		color: #c9aa45;
	}
	.mods-list {
		overflow-y: auto;
		min-height: 0;
		scrollbar-width: thin;
		scrollbar-color: #2e2e2e transparent;
	}
	.mods-list::-webkit-scrollbar {
		width: 6px;
	}
	.mods-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.mods-list::-webkit-scrollbar-thumb {
		background: #2e2e2e;
		border-radius: 3px;
	}
	.mods-list::-webkit-scrollbar-thumb:hover {
		background: #c9aa45;
	}
	.mods-empty {
		margin: 2px 0;
		color: #8a8d97;
		font:
			italic 12px system-ui,
			sans-serif;
	}
	.totals {
		margin-bottom: 10px;
		padding: 6px 8px 7px;
		background: rgba(201, 170, 69, 0.05);
		border: 1px solid #32301f;
		border-radius: 5px;
	}
	.totals-head {
		color: #c9aa45;
		font:
			600 12px system-ui,
			sans-serif;
		margin-bottom: 4px;
	}
	.trow {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 1px 0;
		font:
			12px/1.4 system-ui,
			sans-serif;
	}
	.tlabel {
		flex: 1;
		color: #d8dae0;
	}
	.tval {
		color: #f0c850;
		font:
			12px ui-monospace,
			monospace;
	}
	.tsit {
		color: #6b7280;
		font:
			11px ui-monospace,
			monospace;
		cursor: help;
	}
	.grp + .grp {
		margin-top: 10px;
	}
	.grp-head {
		display: flex;
		align-items: center;
		gap: 7px;
		padding-bottom: 4px;
		margin-bottom: 4px;
		border-bottom: 1px solid #232323;
		color: var(--grp-color, #c9aa45);
		font:
			600 12px system-ui,
			sans-serif;
	}
	.grp-icon {
		width: 18px;
		height: 18px;
		object-fit: contain;
		display: block;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 2px 0;
		color: #d8dae0;
		font:
			12px/1.4 system-ui,
			sans-serif;
	}
	.line .txt {
		flex: 1;
		white-space: pre-line;
	}
	.line .mult {
		flex: none;
		color: #f0c850;
		font:
			11px ui-monospace,
			monospace;
		background: #1f1b10;
		border: 1px solid #3a3322;
		border-radius: 3px;
		padding: 0 4px;
	}
</style>
