<script lang="ts">
	import { tree, nodeByHash, NODE_RADIUS } from '$lib/atlas/tree-data';
	import { Allocation } from '$lib/atlas/allocation.svelte';

	let { alloc = new Allocation() }: { alloc?: Allocation } = $props();

	// --- precomputed edge paths (node positions are static) ---
	const edges = tree.edges.map((e) => {
		const a = nodeByHash.get(e.a)!;
		const b = nodeByHash.get(e.b)!;
		const d =
			e.r != null
				? `M${a.x},${a.y} A${e.r},${e.r} 0 ${e.lg},${e.sw} ${b.x},${b.y}`
				: `M${a.x},${a.y} L${b.x},${b.y}`;
		return { a: e.a, b: e.b, d, key: `${e.a}-${e.b}` };
	});

	// --- view (pan / zoom) ---
	let view = $state({ tx: 0, ty: 0, s: 1 });
	let viewport = $state<HTMLDivElement>();
	let sceneEl = $state<SVGGElement>();

	const transform = $derived(`translate(${view.tx},${view.ty}) scale(${view.s})`);

	function zoomFit() {
		if (!viewport) return;
		let minX = tree.bounds.minX,
			minY = tree.bounds.minY,
			w = tree.bounds.maxX - tree.bounds.minX,
			h = tree.bounds.maxY - tree.bounds.minY;
		const bb = sceneEl?.getBBox?.();
		if (bb && bb.width && bb.height) {
			minX = bb.x;
			minY = bb.y;
			w = bb.width;
			h = bb.height;
		}
		const pad = 40;
		const s = Math.min(
			(viewport.clientWidth - pad * 2) / w,
			(viewport.clientHeight - pad * 2) / h
		);
		view = {
			s,
			tx: viewport.clientWidth / 2 - (minX + w / 2) * s,
			ty: viewport.clientHeight / 2 - (minY + h / 2) * s
		};
	}
	function zoomReset() {
		view = { tx: 0, ty: 0, s: 1 };
	}

	$effect(() => {
		// fit once the scene is laid out
		zoomFit();
	});

	// --- drag to pan ---
	let dragging = $state(false);
	let lastX = 0,
		lastY = 0;
	function onPointerDown(e: PointerEvent) {
		if (!viewport || (e.target as Element).closest('.node')) return;
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		viewport.setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		view = { ...view, tx: view.tx + (e.clientX - lastX), ty: view.ty + (e.clientY - lastY) };
		lastX = e.clientX;
		lastY = e.clientY;
	}
	function onPointerUp() {
		dragging = false;
	}
	function onWheel(e: WheelEvent) {
		if (!viewport) return;
		e.preventDefault();
		const r = viewport.getBoundingClientRect();
		const mx = e.clientX - r.left,
			my = e.clientY - r.top;
		const factor = Math.exp(-e.deltaY * 0.0015);
		const s = Math.max(0.02, Math.min(8, view.s * factor));
		view = {
			s,
			tx: mx - (mx - view.tx) * (s / view.s),
			ty: my - (my - view.ty) * (s / view.s)
		};
	}

	// --- hover: tooltip + path preview ---
	let hovered = $state<number | null>(null);
	let tip = $state<{ h: number; x: number; y: number } | null>(null);

	const previewChain = $derived(hovered == null ? null : alloc.pathTo(hovered));
	const previewNodes = $derived(new Set(previewChain ? previewChain.slice(1) : []));
	const previewEdges = $derived.by(() => {
		const s = new Set<string>();
		if (previewChain) {
			for (let i = 0; i < previewChain.length - 1; i++) {
				s.add(`${previewChain[i]}-${previewChain[i + 1]}`);
				s.add(`${previewChain[i + 1]}-${previewChain[i]}`);
			}
		}
		return s;
	});

	function onNodeEnter(h: number, e: PointerEvent) {
		hovered = h;
		tip = { h, x: e.clientX, y: e.clientY };
	}
	function onNodeMove(e: PointerEvent) {
		if (tip) tip = { ...tip, x: e.clientX, y: e.clientY };
	}
	function onNodeLeave() {
		hovered = null;
		tip = null;
	}

	let showLabels = $state(false);
	const tipNode = $derived(tip ? nodeByHash.get(tip.h) : null);
	const tipRect = $derived(tip && viewport ? viewport.getBoundingClientRect() : null);
</script>

<div class="planner">
	<header>
		<h1>Path of Exile 2 — Atlas Tree</h1>
		<span class="stat"
			>{tree.nodes.length} nodes · {edges.length} edges · <b>{alloc.count}</b> allocated</span
		>
		<span class="spacer"></span>
		<label class="toggle"><input type="checkbox" bind:checked={showLabels} /> Labels</label>
		<button onclick={() => alloc.clear()}>Clear path</button>
		<button onclick={zoomFit}>Zoom to fit</button>
		<button onclick={zoomReset}>Reset view</button>
	</header>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="viewport"
		class:dragging
		bind:this={viewport}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onwheel={onWheel}
	>
		<svg class="canvas">
			<defs>
				<clipPath id="nodeClip" clipPathUnits="objectBoundingBox">
					<circle cx="0.5" cy="0.5" r="0.5" />
				</clipPath>
			</defs>
			<g bind:this={sceneEl} {transform}>
				<!-- edges -->
				<g class="edges">
					{#each edges as e (e.key)}
						<path
							class="edge"
							class:allocated={alloc.inTree(e.a) && alloc.inTree(e.b)}
							class:preview={previewEdges.has(e.key)}
							d={e.d}
						/>
					{/each}
				</g>
				<!-- nodes -->
				<g class="nodes" class:show-labels={showLabels}>
					{#each tree.nodes as n (n.h)}
						{@const r = NODE_RADIUS[n.t]}
						<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
						<g
							class="node {n.t} subtree-{n.s}"
							class:allocated={alloc.isAllocated(n.h)}
							class:allocatable={alloc.isReachable(n.h)}
							class:preview={previewNodes.has(n.h)}
							data-h={n.h}
							role="button"
							tabindex="-1"
							onpointerenter={(e) => onNodeEnter(n.h, e)}
							onpointermove={onNodeMove}
							onpointerleave={onNodeLeave}
							onclick={(e) => {
								e.stopPropagation();
								alloc.toggle(n.h);
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') alloc.toggle(n.h);
							}}
						>
							<circle class="bg" cx={n.x} cy={n.y} {r} />
							{#if n.ic}
								<image
									href={n.ic}
									x={n.x - r + 2}
									y={n.y - r + 2}
									width={(r - 2) * 2}
									height={(r - 2) * 2}
									preserveAspectRatio="xMidYMid meet"
									clip-path="url(#nodeClip)"
								/>
							{/if}
							{#if showLabels}
								<text class="label" x={n.x} y={n.y + r + 14}>{n.n}</text>
							{/if}
						</g>
					{/each}
				</g>
			</g>
		</svg>

		{#if tip && tipNode && tipRect}
			<div
				class="tip"
				style:left="{tip.x - tipRect.left}px"
				style:top="{tip.y - tipRect.top - 12}px"
			>
				<div class="name">{tipNode.n}</div>
				<div class="meta">
					{#if tipNode.t !== 'normal'}<span>type: <b>{tipNode.t}</b></span>{/if}
					{#if tipNode.s}<span>subtree: <b>{tipNode.s}</b></span>{/if}
				</div>
				{#if tipNode.st.length}
					{#each tipNode.st as line (line)}
						<div class="line">{line}</div>
					{/each}
				{:else}
					<div class="meta" style="font-style:italic">no stats</div>
				{/if}
			</div>
		{/if}

		<div class="legend">
			<h3>Subtrees</h3>
			<div class="row"><span class="sw" style="background:#d9c52b"></span> Ritual</div>
			<div class="row"><span class="sw" style="background:#d96c1d"></span> Breach</div>
			<div class="row"><span class="sw" style="background:#2bd9c1"></span> Delirium</div>
			<div class="row"><span class="sw" style="background:#d92b6a"></span> Incursion</div>
			<div class="row"><span class="sw" style="background:#6e2bd9"></span> Abyss</div>
		</div>
		<div class="help">
			<div><kbd>Drag</kbd> pan · <kbd>Wheel</kbd> zoom</div>
			<div><kbd>Hover</kbd> preview path · <kbd>Click</kbd> allocate / remove</div>
		</div>
	</div>
</div>

<style>
	.planner {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-rows: auto 1fr;
		background: #000;
		color: #d8dae0;
		font:
			13px/1.4 system-ui,
			sans-serif;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 14px;
		background: #0b0b0b;
		border-bottom: 1px solid #1d1d1d;
	}
	header h1 {
		font-size: 14px;
		font-weight: 600;
		color: #c9aa45;
		margin: 0;
	}
	header .stat {
		color: #8a8d97;
		font-size: 12px;
	}
	header .stat b {
		color: #f0c850;
	}
	header .spacer {
		flex: 1;
	}
	header button,
	header .toggle {
		background: #161616;
		border: 1px solid #2a2a2a;
		color: #d8dae0;
		border-radius: 4px;
		padding: 4px 10px;
		font-size: 12px;
		cursor: pointer;
	}
	header button:hover,
	header .toggle:hover {
		border-color: #c9aa45;
		color: #c9aa45;
	}

	.viewport {
		position: relative;
		overflow: hidden;
		background: #000;
		cursor: grab;
	}
	.viewport.dragging {
		cursor: grabbing;
	}
	.canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.edge {
		fill: none;
		stroke: #4d4d4d;
		stroke-width: 1.5;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	.edge.allocated {
		stroke: #4ade80;
		stroke-width: 3;
	}
	.edge.preview {
		stroke: #4ade80;
		stroke-width: 3;
		stroke-dasharray: 9 7;
	}

	.node {
		cursor: pointer;
	}
	.node circle.bg {
		stroke: #1a1a1a;
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.node image {
		pointer-events: none;
	}
	.node .label {
		fill: #d8dae0;
		font-size: 11px;
		text-anchor: middle;
		pointer-events: none;
		paint-order: stroke;
		stroke: rgba(0, 0, 0, 0.9);
		stroke-width: 3;
		stroke-linejoin: round;
	}

	.node.normal circle.bg {
		fill: #2a2a2a;
	}
	.node.notable circle.bg {
		fill: #c9923a;
	}
	.node.keystone circle.bg {
		fill: #d6b14a;
	}
	.node.root circle.bg {
		fill: none;
		stroke: none;
	}

	.node.subtree-Ritual circle.bg {
		stroke: #d9c52b;
	}
	.node.subtree-Breach circle.bg {
		stroke: #d96c1d;
	}
	.node.subtree-Delirium circle.bg {
		stroke: #2bd9c1;
	}
	.node.subtree-Incursion circle.bg {
		stroke: #d92b6a;
	}
	.node.subtree-Abyss circle.bg {
		stroke: #6e2bd9;
	}
	.node.root circle.bg {
		stroke: none;
	}

	.node.allocatable circle.bg {
		stroke: #f0c850;
		stroke-width: 3;
		stroke-dasharray: 6 5;
	}
	.node.allocated circle.bg {
		stroke: #ffe089;
		stroke-width: 7;
		stroke-dasharray: none;
	}
	.node.preview circle.bg {
		stroke: #4ade80;
		stroke-width: 4;
		stroke-dasharray: none;
	}

	.tip {
		position: absolute;
		pointer-events: none;
		transform: translate(-50%, -100%);
		background: rgba(15, 15, 15, 0.97);
		border: 1px solid #2a2a2a;
		border-radius: 4px;
		padding: 8px 10px;
		font-size: 12px;
		max-width: 320px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
		z-index: 20;
	}
	.tip .name {
		font-weight: 600;
		color: #c9aa45;
		margin-bottom: 4px;
		font-size: 13px;
	}
	.tip .meta {
		color: #8a8d97;
		font-size: 11px;
		margin-bottom: 4px;
	}
	.tip .meta span {
		margin-right: 8px;
	}
	.tip .line {
		color: #d8dae0;
		line-height: 1.35;
		white-space: pre-line;
	}

	.legend,
	.help {
		position: absolute;
		bottom: 12px;
		background: rgba(15, 15, 15, 0.85);
		border: 1px solid #2a2a2a;
		border-radius: 4px;
		padding: 8px 10px;
		font-size: 11px;
		z-index: 10;
	}
	.legend {
		left: 12px;
	}
	.help {
		right: 12px;
		color: #8a8d97;
		max-width: 260px;
	}
	.legend h3 {
		font-size: 11px;
		margin: 0 0 4px;
		color: #8a8d97;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.legend .row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 2px 0;
	}
	.legend .sw {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1px solid #1a1a1a;
	}
	.help kbd {
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-radius: 3px;
		padding: 1px 5px;
		font: 11px ui-monospace, monospace;
		color: #d8dae0;
	}
</style>
