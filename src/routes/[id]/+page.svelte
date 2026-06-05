<script lang="ts">
	import AtlasTree from '$lib/components/AtlasTree.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import { Planner } from '$lib/atlas/planner.svelte';
	import { decodePlan, isCurrentTree } from '$lib/atlas/share';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const planner = new Planner();
	const plan = $derived(decodePlan(data.code));
	const stale = $derived(plan ? !isCurrentTree(plan) : false);
	$effect(() => {
		if (plan) planner.load(plan);
	});
</script>

<svelte:head>
	<title>{planner.title || 'Shared Atlas plan'} — ExileCompass</title>
	<meta name="description" content="A shared Path of Exile 2 Atlas plan" />
</svelte:head>

<div class="app">
	<div class="banner">
		<span>📤 Shared plan{planner.title ? ` · ${planner.title}` : ''} · {data.views} views</span>
		{#if stale}<span class="stale">⚠ built for a different tree version</span>{/if}
		<span class="spacer"></span>
		<a class="edit" href="/#{data.code}">Edit a copy →</a>
	</div>
	<div class="tree-area"><AtlasTree {planner} readonly /></div>
	{#if planner.count > 0}
		<TimelinePanel {planner} readonly />
	{/if}
</div>

<style>
	.app {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: #000;
	}
	.banner {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 14px;
		background: #0b1a0b;
		border-bottom: 1px solid #1d2d1d;
		color: #9be8a8;
		font:
			12px system-ui,
			sans-serif;
	}
	.banner .spacer {
		flex: 1;
	}
	.banner .stale {
		color: #e0c46a;
	}
	.banner .edit {
		color: #c9aa45;
		text-decoration: none;
		font-weight: 600;
	}
	.banner .edit:hover {
		text-decoration: underline;
	}
	.tree-area {
		flex: 1;
		min-height: 0;
	}
</style>
