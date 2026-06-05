<script lang="ts">
	import { onMount } from 'svelte';
	import AtlasTree from '$lib/components/AtlasTree.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import { Planner } from '$lib/atlas/planner.svelte';
	import { decodePlan } from '$lib/atlas/share';

	const planner = new Planner();

	onMount(() => {
		// Load a plan shared via the stateless URL hash (#<code>).
		const code = location.hash.replace(/^#/, '');
		if (code) {
			const plan = decodePlan(code);
			if (plan) planner.load(plan);
		}
	});
</script>

<svelte:head>
	<title>Atlas Planner — ExileCompass</title>
	<meta name="description" content="Path of Exile 2 Atlas skill tree planner" />
</svelte:head>

<div class="app">
	<div class="tree-area"><AtlasTree {planner} /></div>
	<TimelinePanel {planner} />
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
