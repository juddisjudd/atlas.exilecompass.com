<script lang="ts">
	import AtlasTree from '$lib/components/AtlasTree.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import { Planner } from '$lib/atlas/planner.svelte';

	const planner = new Planner();
</script>

<svelte:head>
	<title>Atlas Planner — ExileCompass</title>
	<meta name="description" content="Path of Exile 2 Atlas skill tree planner" />
</svelte:head>

<div class="app">
	<div class="tree-area"><AtlasTree {planner} /></div>
	{#if planner.count > 0}
		<TimelinePanel {planner} />
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
	.tree-area {
		flex: 1;
		min-height: 0;
	}
</style>
