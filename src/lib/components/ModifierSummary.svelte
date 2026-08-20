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
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: 12px var(--font-sans);
		padding: 6px 10px;
		cursor: pointer;
	}
	.mods-pill:hover {
		border-color: var(--text);
		color: var(--text);
	}
	.mods-count {
		color: var(--text);
		font: 11px var(--font-mono);
		margin-left: 6px;
	}
	.mods.open {
		display: flex;
		flex-direction: column;
		width: 420px;
		max-width: 84vw;
		max-height: min(62vh, 560px);
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		padding: 8px 10px 10px;
	}
	.mods-head {
		display: flex;
		align-items: center;
		margin-bottom: 6px;
	}
	.mods-title {
		flex: 1;
		color: var(--muted);
		font: 600 11px var(--font-sans);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.mods-at {
		color: var(--text);
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		margin-left: 6px;
	}
	.mods-collapse {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}
	.mods-collapse:hover {
		color: var(--text);
	}
	.mods-list {
		overflow-y: auto;
		min-height: 0;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
	}
	.mods-list::-webkit-scrollbar {
		width: 6px;
	}
	.mods-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.mods-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.18);
		border-radius: var(--radius-sm);
	}
	.mods-list::-webkit-scrollbar-thumb:hover {
		background: var(--text);
	}
	.mods-empty {
		margin: 2px 0;
		color: var(--muted);
		font: italic 12px var(--font-sans);
	}
	.totals {
		margin-bottom: 10px;
		padding: 6px 8px 7px;
		background: var(--panel-2);
		border: 1px solid var(--edge);
		border-radius: var(--radius);
	}
	.totals-head {
		color: var(--text);
		font: 600 12px var(--font-sans);
		margin-bottom: 4px;
	}
	.trow {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 1px 0;
		font: 12px/1.4 var(--font-sans);
	}
	.tlabel {
		flex: 1;
		color: var(--muted);
	}
	.tval {
		color: var(--text);
		font: 12px var(--font-mono);
	}
	.tsit {
		color: var(--faint);
		font: 11px var(--font-mono);
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
		border-bottom: 1px solid var(--edge);
		color: var(--grp-color, var(--text));
		font: 600 12px var(--font-sans);
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
		color: var(--text);
		font: 12px/1.4 var(--font-sans);
	}
	.line .txt {
		flex: 1;
		white-space: pre-line;
	}
	.line .mult {
		flex: none;
		color: var(--text);
		font: 11px var(--font-mono);
		background: var(--panel-2);
		border: 1px solid var(--edge);
		border-radius: var(--radius-sm);
		padding: 0 4px;
	}
</style>
