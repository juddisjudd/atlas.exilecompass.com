<script lang="ts">
	import {
		tree,
		nodeByHash,
		NODE_RADIUS,
		NODE_FRAME,
		FRAME_SCALE,
		frameUrl,
		type FrameState
	} from '$lib/atlas/tree-data';
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { Planner } from '$lib/atlas/planner.svelte';
	import { fmtChoiceLabel } from '$lib/atlas/stats';
	import { encodePlan, MAX_NOTES } from '$lib/atlas/share';
	import ModifierSummary from './ModifierSummary.svelte';
	import { FEATURED_ENABLED, FEATURED_PLANS } from '$lib/featured';

	// Display radius of a node's footprint (frame for normal/notable/keystone,
	// the larger start art for roots).
	function nodeRadius(t: string): number {
		if (t === 'root') return NODE_RADIUS.root;
		return (NODE_FRAME[t as 'normal' | 'notable' | 'keystone'].frameD * FRAME_SCALE) / 2;
	}
	function frameState(h: number): FrameState {
		if (planner.isTaken(h)) return 'active';
		if (planner.isReachable(h)) return 'canallocate';
		return 'normal';
	}

	let { planner = new Planner(), readonly = false }: { planner?: Planner; readonly?: boolean } =
		$props();

	// Floating notes panel: expanded by default on a shared (readonly) plan where
	// the notes are the point; collapsed in the editor so it stays out of the way.
	let notesOpen = $state(untrack(() => readonly));

	// 'YYYY-MM-DD' -> 'm/d/year' without going through Date() (avoids timezone
	// shifting the day for a date-only string).
	function fmtDate(iso: string): string {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
		return m ? `${+m[2]}/${+m[3]}/${m[1]}` : iso;
	}

	// --- featured planners modal ---
	const HIDE_FEATURED_KEY = 'ATLAS_HIDE_FEATURED_V1';
	// Init synchronously from storage so opted-out users never see a flash.
	let featuredDismissed = $state(browser && localStorage.getItem(HIDE_FEATURED_KEY) === '1');
	let dontShowFeatured = $state(false);
	// Once the user starts planning (or a shared plan loads nodes), drop the modal.
	$effect(() => {
		if (planner.count > 0) featuredDismissed = true;
	});
	const showFeatured = $derived(
		FEATURED_ENABLED && browser && !readonly && FEATURED_PLANS.length > 0 && !featuredDismissed
	);
	function dismissFeatured() {
		if (dontShowFeatured) localStorage.setItem(HIDE_FEATURED_KEY, '1');
		featuredDismissed = true;
	}

	// --- sharing ---
	let shareUrl = $state<string | null>(null);
	let sharing = $state(false);
	let copied = $state(false);
	let copiedT: ReturnType<typeof setTimeout> | undefined;
	function flagCopied() {
		copied = true;
		clearTimeout(copiedT);
		copiedT = setTimeout(() => (copied = false), 2000);
	}
	async function copyLink() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			flagCopied();
		} catch {
			/* clipboard may be unavailable */
		}
	}
	async function share() {
		sharing = true;
		shareUrl = null;
		copied = false;
		const code = encodePlan({
			steps: planner.steps,
			milestones: planner.milestones,
			title: planner.title,
			notes: planner.notes,
			choices: Object.fromEntries(planner.choices)
		});
		location.hash = code;
		try {
			const res = await fetch('/api/share', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code })
			});
			shareUrl = res.ok
				? `${location.origin}/${(await res.json()).id}`
				: `${location.origin}/#${code}`;
		} catch {
			shareUrl = `${location.origin}/#${code}`;
		}
		try {
			await navigator.clipboard.writeText(shareUrl);
			flagCopied();
		} catch {
			/* clipboard may be unavailable */
		}
		sharing = false;
	}

	const takenOrRoot = (h: number) => tree.roots.includes(h) || planner.isTaken(h);
	const plannedOrRoot = (h: number) => tree.roots.includes(h) || planner.isPlanned(h);

	// Per-subtree point counts: allocated up to the timeline cursor / total
	// allocatable nodes in that tree.
	const subtreeTotals: Record<string, number> = (() => {
		const t: Record<string, number> = {};
		for (const n of tree.nodes) if (n.t !== 'root') t[n.s] = (t[n.s] ?? 0) + 1;
		return t;
	})();
	const subtreeTaken = $derived.by(() => {
		const c: Record<string, number> = {};
		for (let i = 0; i < planner.cursor; i++) {
			const n = nodeByHash.get(planner.steps[i]);
			if (n) c[n.s] = (c[n.s] ?? 0) + 1;
		}
		return c;
	});
	const taken = (s: string) => subtreeTaken[s] ?? 0;
	const total = (s: string) => subtreeTotals[s] ?? 0;

	const SUBTREES = [
		{ name: 'Ritual', color: '#d9c52b', icon: '/misc/ritual.webp' },
		{ name: 'Breach', color: '#d96c1d', icon: '/misc/breach.webp' },
		{ name: 'Delirium', color: '#2bd9c1', icon: '/misc/delirium.webp' },
		{ name: 'Incursion', color: '#d92b6a', icon: '/misc/incursion.webp' },
		{ name: 'Abyss', color: '#6e2bd9', icon: '/misc/abyss.webp' },
		{ name: 'Expedition', color: '#c4832b', icon: '/misc/expedition.webp' }
	];

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
	// Hide the canvas until the first zoom-to-fit lands, so the page doesn't flash
	// the tree at scale 1 before snapping to fit.
	let ready = $state(false);

	// Content bounds from node positions + radii (excludes decorative
	// backgrounds, which would otherwise inflate the zoom-to-fit).
	const contentBounds = (() => {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const n of tree.nodes) {
			const r = nodeRadius(n.t);
			if (n.x - r < minX) minX = n.x - r;
			if (n.y - r < minY) minY = n.y - r;
			if (n.x + r > maxX) maxX = n.x + r;
			if (n.y + r > maxY) maxY = n.y + r;
		}
		return { minX, minY, w: maxX - minX, h: maxY - minY };
	})();

	const transform = $derived(`translate(${view.tx},${view.ty}) scale(${view.s})`);

	function zoomFit() {
		if (!viewport) return;
		const { minX, minY, w, h } = contentBounds;
		const pad = 40;
		const s = Math.min((viewport.clientWidth - pad * 2) / w, (viewport.clientHeight - pad * 2) / h);
		view = {
			s,
			tx: viewport.clientWidth / 2 - (minX + w / 2) * s,
			ty: viewport.clientHeight / 2 - (minY + h / 2) * s
		};
		ready = true;
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
		// Clicks inside the menu, or on a node, are handled elsewhere (the node's
		// own click toggles its menu); don't pan or dismiss for those.
		if ((e.target as Element).closest('.node-menu')) return;
		// Presses on floating UI (notes panel, modifiers, featured cards) must keep
		// their own click/focus — panning here would capture the pointer and swallow it.
		if ((e.target as Element).closest('.notes, .mods, .featured, .featured-backdrop')) return;
		if (!viewport || (e.target as Element).closest('.node')) return;
		menuH = null; // a press on empty canvas dismisses the choice menu
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
		menuH = null;
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

	const previewChain = $derived(hovered == null || readonly ? null : planner.pathTo(hovered));
	const previewNodes = $derived(new Set(previewChain ? previewChain.slice(1) : []));
	const previewEdges = $derived.by(() => {
		const e: string[] = [];
		if (previewChain) {
			for (let i = 0; i < previewChain.length - 1; i++) {
				e.push(`${previewChain[i]}-${previewChain[i + 1]}`);
				e.push(`${previewChain[i + 1]}-${previewChain[i]}`);
			}
		}
		return new Set(e);
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

	const tipNode = $derived(tip ? nodeByHash.get(tip.h) : null);
	const tipRect = $derived(tip && viewport ? viewport.getBoundingClientRect() : null);

	// --- at-node choice menu (for multi-choice selector nodes) ---
	// Holds the hash of the node whose menu is open; positioned at the node.
	let menuH = $state<number | null>(null);
	const menuNode = $derived(menuH == null ? null : nodeByHash.get(menuH));

	// Click behaviour: selector nodes already in the plan open their choice menu;
	// everything else allocates/removes as usual.
	function onNodeClick(h: number) {
		if (readonly) return;
		const node = nodeByHash.get(h);
		if (node?.c && planner.isPlanned(h)) {
			menuH = menuH === h ? null : h;
		} else {
			planner.toggle(h);
		}
	}

	// --- search: highlight nodes whose name or stats match the query ---
	// `searchInput` is the live field value; `query` is debounced and drives the
	// highlight, so typing doesn't recompute/repaint per keystroke. Panning to a
	// result is OPT-IN (the ▲/▼ buttons or arrow keys) — never automatic, so a big
	// result set never freezes the canvas just from typing.
	let searchInput = $state('');
	let query = $state('');
	let searchIdx = $state(0); // which result is "current"
	let located = $state(false); // whether we've jumped to a result yet
	let debounceT: ReturnType<typeof setTimeout> | undefined;

	function onSearchInput(v: string) {
		searchInput = v;
		clearTimeout(debounceT);
		debounceT = setTimeout(() => {
			query = v;
			searchIdx = 0;
			located = false;
		}, 200);
	}
	function clearSearch() {
		clearTimeout(debounceT);
		searchInput = '';
		query = '';
		searchIdx = 0;
		located = false;
	}

	const searchActive = $derived(query.trim().length >= 2);
	const searchHitList = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [] as number[];
		return tree.nodes
			.filter(
				(n) =>
					n.t !== 'root' &&
					(n.n.toLowerCase().includes(q) || n.st.some((s) => s.toLowerCase().includes(q)))
			)
			.map((n) => n.h);
	});
	const searchHits = $derived(new Set(searchHitList));
	const currentHit = $derived(searchHitList[searchIdx] ?? null);
	// When a search narrows to a single node, "radar ping" it so it's easy to spot.
	const pingHit = $derived(searchHitList.length === 1 ? searchHitList[0] : null);

	// Center the view on a node, zooming in a little if currently far out.
	function panToNode(h: number) {
		const n = nodeByHash.get(h);
		if (!n || !viewport) return;
		const s = Math.max(view.s, 0.55);
		view = { s, tx: viewport.clientWidth / 2 - n.x * s, ty: viewport.clientHeight / 2 - n.y * s };
	}
	// First press jumps to the current (first) result; later presses move through.
	function gotoResult(dir: number) {
		const len = searchHitList.length;
		if (!len) return;
		if (located) searchIdx = (searchIdx + dir + len) % len;
		located = true;
		panToNode(searchHitList[searchIdx]);
	}

	function onWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showFeatured) {
				dismissFeatured();
				return;
			}
			menuH = null;
			return;
		}
		if (!searchActive || !searchHitList.length) return;
		// Up/Down jump through results (Left/Right left alone so the query caret works)
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			gotoResult(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			gotoResult(-1);
		}
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="planner">
	<header>
		<h1>
			<a class="brand" href="https://exilecompass.com"
				><span class="mark" aria-hidden="true"></span>Exile<b>Compass</b></a
			>
			<span class="sep">|</span> Atlas Tree Planner
		</h1>
		<div class="search">
			<input
				placeholder="Search nodes…"
				value={searchInput}
				oninput={(e) => onSearchInput(e.currentTarget.value)}
			/>
			{#if searchActive}
				<span class="count">
					{located && searchHitList.length
						? `${searchIdx + 1}/${searchHitList.length}`
						: searchHitList.length}
				</span>
				<button
					class="jump"
					title="Jump to node (↓ next, ↑ previous)"
					disabled={searchHitList.length === 0}
					onclick={() => gotoResult(1)}>Jump to node</button
				>
			{/if}
			{#if searchInput}
				<button class="clr" title="Clear search" onclick={clearSearch}>×</button>
			{/if}
		</div>
		<span class="spacer"></span>
		{#if shareUrl}
			<input
				class="sharelink"
				readonly
				value={shareUrl}
				title={`${shareUrl}\n(click to copy)`}
				onclick={(e) => {
					e.currentTarget.select();
					copyLink();
				}}
				onfocus={(e) => e.currentTarget.select()}
			/>
		{/if}
		{#if !readonly}
			<button class="primary" disabled={sharing || planner.count === 0} onclick={share}>
				{sharing ? 'Sharing…' : copied ? '✓ Copied!' : 'Share'}
			</button>
			<button onclick={() => planner.clear()}>Clear</button>
		{/if}
		<button onclick={zoomFit}>Zoom to fit</button>
		<a
			class="kofi"
			href="https://ko-fi.com/ohitsjudd"
			target="_blank"
			rel="noopener noreferrer"
			title="Support me on Ko-fi"
		>
			<svg class="ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"
				><path
					d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linejoin="round"
				/><path
					d="M17 10.5h1.3a2.5 2.5 0 0 1 0 5H17"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
			Support on Ko-fi
		</a>
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
		<svg class="canvas" style:opacity={ready ? 1 : 0}>
			<defs>
				<clipPath id="nodeClip" clipPathUnits="objectBoundingBox">
					<circle cx="0.5" cy="0.5" r="0.5" />
				</clipPath>
			</defs>
			<g {transform}>
				<!-- subtree background art -->
				<g class="backgrounds">
					{#each tree.backgrounds as b (b.sub)}
						<image
							href={b.img}
							x={b.cx - b.size / 2}
							y={b.cy - b.size / 2}
							width={b.size}
							height={b.size}
							preserveAspectRatio="xMidYMid meet"
							opacity={b.sub === 'Generic' ? 1 : 0.6}
						/>
					{/each}
				</g>
				<g class="edges">
					{#each edges as e (e.key)}
						<path
							class="edge"
							class:allocated={takenOrRoot(e.a) && takenOrRoot(e.b)}
							class:future={plannedOrRoot(e.a) &&
								plannedOrRoot(e.b) &&
								!(takenOrRoot(e.a) && takenOrRoot(e.b))}
							class:preview={previewEdges.has(e.key)}
							d={e.d}
						/>
					{/each}
				</g>
				<g class="nodes">
					{#each tree.nodes as n (n.h)}
						{@const isRoot = n.t === 'root'}
						{@const r = nodeRadius(n.t)}
						{@const iconD = isRoot
							? NODE_RADIUS.root * 2
							: NODE_FRAME[n.t as 'normal' | 'notable' | 'keystone'].iconD * FRAME_SCALE}
						<g
							class="node {n.t}"
							class:allocated={planner.isTaken(n.h)}
							class:future={planner.isFuture(n.h)}
							class:preview={previewNodes.has(n.h)}
							class:search-hit={searchHits.has(n.h)}
							class:search-current={currentHit === n.h}
							data-h={n.h}
							role="button"
							tabindex="-1"
							onpointerenter={(e) => onNodeEnter(n.h, e)}
							onpointermove={onNodeMove}
							onpointerleave={onNodeLeave}
							onclick={(e) => {
								e.stopPropagation();
								onNodeClick(n.h);
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') onNodeClick(n.h);
							}}
						>
							<!-- transparent hit area covering the whole frame -->
							<circle class="hit" cx={n.x} cy={n.y} {r} />
							{#if isRoot}
								<!-- start-point art: unclipped + larger so the glow shows -->
								<image
									href={n.ic}
									x={n.x - r * 1.4}
									y={n.y - r * 1.4}
									width={r * 2.8}
									height={r * 2.8}
									preserveAspectRatio="xMidYMid meet"
								/>
							{:else}
								<circle class="bg" cx={n.x} cy={n.y} r={iconD * 0.46} />
								{#if n.ic}
									<image
										href={n.ic}
										x={n.x - iconD / 2}
										y={n.y - iconD / 2}
										width={iconD}
										height={iconD}
										preserveAspectRatio="xMidYMid meet"
										clip-path="url(#nodeClip)"
									/>
								{/if}
								<!-- real game frame, by type + allocation state -->
								<image
									class="frame"
									href={frameUrl(n.t as 'normal' | 'notable' | 'keystone', frameState(n.h))}
									x={n.x - r}
									y={n.y - r}
									width={r * 2}
									height={r * 2}
									preserveAspectRatio="xMidYMid meet"
								/>
								<circle class="overlay" cx={n.x} cy={n.y} {r} />
								{#if pingHit === n.h}
									<circle class="ping" cx={n.x} cy={n.y} {r} />
									<circle class="ping ping2" cx={n.x} cy={n.y} {r} />
								{/if}
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
				{:else if !tipNode.c}
					<div class="meta" style="font-style:italic">no stats</div>
				{/if}
				{#if tipNode.c}
					<div class="opts">
						{#each tipNode.c as o, i (i)}
							<div class="opt" class:sel={i === planner.choiceOf(tipNode.h)}>
								<span class="num">{i + 1}</span>
								<span>{fmtChoiceLabel(o.label)}</span>
							</div>
						{/each}
					</div>
					{#if !readonly}
						<div class="meta choice-hint">click node again to choose</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- at-node choice menu (game-style): Unallocate + the selectable bonuses -->
		{#if menuNode && menuNode.c}
			<div
				class="node-menu"
				style:left="{menuNode.x * view.s + view.tx}px"
				style:top="{menuNode.y * view.s + view.ty}px"
			>
				<button
					class="mi unalloc"
					onclick={() => {
						planner.toggle(menuNode.h);
						menuH = null;
					}}
				>
					Unallocate
				</button>
				{#each menuNode.c as o, i (i)}
					<button
						class="mi"
						class:sel={i === planner.choiceOf(menuNode.h)}
						onclick={() => {
							planner.setChoice(menuNode.h, i);
							menuH = null;
						}}
					>
						{fmtChoiceLabel(o.label)}
					</button>
				{/each}
			</div>
		{/if}

		{#if showFeatured}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="featured-backdrop" onclick={dismissFeatured}>
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="featured" onclick={(e) => e.stopPropagation()}>
					<button class="fclose" title="Close" aria-label="Close" onclick={dismissFeatured}
						>×</button
					>
					<h2>Featured planners</h2>
					<p class="fsub">Start from a curated plan, or close this to build your own.</p>
					<div class="fcards">
						{#each FEATURED_PLANS as f (f.id)}
							<div class="fcard">
								<a class="ftitle" href="/{f.id}">{f.title}</a>
								<div class="fmeta">
									<span class="fby">by {f.author} · Updated {fmtDate(f.updated)}</span>
									{#if f.twitch}
										<a
											class="ficon"
											href={f.twitch}
											target="_blank"
											rel="noopener noreferrer"
											title="Twitch"
											aria-label="{f.author} on Twitch"
										>
											<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
												<path
													fill="currentColor"
													d="M4.3 3 3 6.2v12.3h4.3V21h2.4l2.4-2.5h3.5L21 13.7V3H4.3Zm14.3 9.9-2.7 2.7h-4.3l-2.4 2.4v-2.4H6.2V4.7h12.4v8.2ZM15 7.6h1.7v4.8H15V7.6Zm-4.6 0H12v4.8h-1.6V7.6Z"
												/>
											</svg>
										</a>
									{/if}
									{#if f.youtube}
										<a
											class="ficon"
											href={f.youtube}
											target="_blank"
											rel="noopener noreferrer"
											title="YouTube"
											aria-label="{f.author} on YouTube"
										>
											<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
												<path
													fill="currentColor"
													d="M23 7.5a3 3 0 0 0-2.1-2.1C19 4.8 12 4.8 12 4.8s-7 0-8.9.6A3 3 0 0 0 1 7.5 31.4 31.4 0 0 0 .5 12 31.4 31.4 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1c.4-1.5.5-3 .5-4.5s-.1-3-.5-4.5ZM9.8 15.3V8.7l5.7 3.3-5.7 3.3Z"
												/>
											</svg>
										</a>
									{/if}
								</div>
							</div>
						{/each}
					</div>
					<label class="fdont">
						<input type="checkbox" bind:checked={dontShowFeatured} />
						Don't show this again
					</label>
				</div>
			</div>
		{/if}

		{#if !readonly || planner.notes}
			<div class="notes" class:open={notesOpen}>
				{#if notesOpen}
					<div class="notes-head">
						<span class="notes-title">📝 Notes</span>
						<button
							class="notes-collapse"
							title="Collapse notes"
							aria-label="Collapse notes"
							onclick={() => (notesOpen = false)}>–</button
						>
					</div>
					{#if readonly}
						<p class="notes-ro">{planner.notes}</p>
					{:else}
						<textarea
							class="notes-input"
							name="plan-notes"
							aria-label="Plan notes"
							maxlength={MAX_NOTES}
							placeholder="Notes for this plan (shared along with it)…"
							bind:value={planner.notes}
						></textarea>
					{/if}
				{:else}
					<button class="notes-pill" title="Show notes" onclick={() => (notesOpen = true)}>
						📝 Notes{#if planner.notes}<span class="notes-dot">●</span>{/if}
					</button>
				{/if}
			</div>
		{/if}

		<ModifierSummary {planner} />

		<div class="legend">
			<h3>Allocations</h3>
			<div class="row main">
				<img class="sicon" src="/misc/atlas.webp" alt="" />
				<span class="lname">Main</span>
				<span class="lcount">{taken('Generic')}/{total('Generic')}</span>
			</div>
			{#each SUBTREES as st (st.name)}
				<div class="row">
					<img class="sicon" src={st.icon} alt="" />
					<span class="lname">{st.name}</span>
					<span class="lcount">{taken(st.name)}/{total(st.name)}</span>
				</div>
			{/each}
		</div>
		<div class="help">
			<div><kbd>Drag</kbd> pan · <kbd>Wheel</kbd> zoom</div>
			<div><kbd>Hover</kbd> preview path · <kbd>Click</kbd> allocate / remove</div>
		</div>
	</div>
</div>

<style>
	.planner {
		display: grid;
		grid-template-rows: auto 1fr;
		min-height: 0;
		height: 100%;
		background: var(--bg);
		color: var(--text);
		font: 13px/1.4 var(--font-sans);
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		background: var(--panel);
		border-bottom: 1px solid var(--edge);
	}
	header h1 {
		font-size: 13px;
		font-weight: 500;
		color: var(--text);
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	header h1 .brand {
		display: inline-flex;
		align-items: center;
		gap: 0;
		color: var(--text);
		text-decoration: none;
		font-weight: 500;
	}
	header h1 .brand b {
		color: var(--text);
		font-weight: 700;
	}
	header h1 .brand:hover {
		color: #fff;
	}
	header h1 .brand .mark {
		width: 18px;
		height: 18px;
		flex: none;
		margin-right: 8px;
		background: var(--gold);
		-webkit-mask: url('/compass-mark.png') center / contain no-repeat;
		mask: url('/compass-mark.png') center / contain no-repeat;
	}
	header h1 .sep {
		color: var(--faint);
		font-weight: 400;
	}
	header .search {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	header .search input {
		background: var(--bg);
		border: 1px solid var(--edge);
		color: var(--text);
		border-radius: var(--radius-sm);
		padding: 4px 8px;
		font-size: 12px;
		width: 170px;
	}
	header .search input:focus {
		outline: none;
		border-color: var(--edge-strong);
	}
	header .search .count {
		color: var(--text);
		font: 11px var(--font-mono);
	}
	header .search .jump {
		background: var(--panel-2);
		border: 1px solid var(--edge);
		color: var(--text);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 12px;
		line-height: 1;
		padding: 4px 8px;
		white-space: nowrap;
	}
	header .search .jump:hover:not(:disabled) {
		border-color: var(--text);
		color: var(--text);
	}
	header .search .jump:disabled {
		opacity: 0.35;
		cursor: default;
	}
	header .search .clr {
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		font-size: 15px;
		line-height: 1;
		padding: 0 2px;
	}
	header .search .clr:hover {
		color: var(--gold-bright);
	}
	header .spacer {
		flex: 1;
	}
	header button {
		background: var(--panel-2);
		border: 1px solid var(--edge);
		color: var(--text);
		border-radius: var(--radius-sm);
		padding: 4px 10px;
		font-size: 12px;
		cursor: pointer;
	}
	header button:hover {
		border-color: var(--text);
		color: var(--text);
	}
	header button.primary {
		border-color: var(--ok);
		color: var(--ok-bright);
		background: var(--ok-soft);
	}
	header button.primary:hover {
		border-color: var(--ok-bright);
		color: var(--ok-bright);
	}
	header button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	header .kofi {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--panel-2);
		border: 1px solid var(--edge);
		color: var(--text);
		border-radius: var(--radius-sm);
		padding: 4px 10px;
		font-size: 12px;
		text-decoration: none;
		transition: border-color 0.15s var(--ease);
	}
	header .kofi:hover {
		border-color: var(--edge-strong);
	}
	header .kofi .ico {
		width: 14px;
		height: 14px;
	}

	header .sharelink {
		background: var(--bg);
		border: 1px solid var(--edge);
		color: var(--ok-bright);
		border-radius: var(--radius-sm);
		padding: 4px 8px;
		font: 11px var(--font-mono);
		width: 340px;
		max-width: 40vw;
		cursor: pointer;
		text-overflow: ellipsis;
	}
	header .sharelink:hover {
		border-color: var(--text);
	}

	/* floating notes panel, top-left of the viewport. Collapses to a small pill. */
	.notes {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 11;
	}
	.notes-pill {
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: 12px var(--font-sans);
		padding: 6px 10px;
		cursor: pointer;
	}
	.notes-pill:hover {
		border-color: var(--text);
		color: var(--text);
	}
	.notes-dot {
		color: var(--text);
		font-size: 8px;
		margin-left: 6px;
		vertical-align: middle;
	}
	.notes.open {
		display: flex;
		flex-direction: column;
		/* size to the (resizable) textarea so dragging it wider grows the panel */
		width: fit-content;
		min-width: 240px;
		max-width: 80vw;
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		padding: 8px 10px 10px;
	}
	.notes-head {
		display: flex;
		align-items: center;
		margin-bottom: 6px;
	}
	.notes-title {
		flex: 1;
		color: var(--muted);
		font: 600 11px var(--font-sans);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.notes-collapse {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}
	.notes-collapse:hover {
		color: var(--text);
	}
	.notes-input {
		display: block;
		width: 256px;
		min-width: 220px;
		max-width: 78vw;
		min-height: 64px;
		box-sizing: border-box;
		background: var(--bg);
		border: 1px solid var(--edge-soft);
		border-radius: var(--radius-sm);
		color: var(--text);
		font: 12px/1.5 var(--font-sans);
		padding: 6px 8px;
		resize: both;
	}
	.notes-input:focus {
		outline: none;
		border-color: var(--edge-strong);
	}
	.notes-ro {
		margin: 0;
		width: 256px;
		max-width: 78vw;
		max-height: 40vh;
		overflow-y: auto;
		white-space: pre-wrap;
		color: var(--text);
		font: 12px/1.5 var(--font-sans);
	}

	/* featured plans modal: dimmed backdrop (click to dismiss) + centered card. */
	.featured-backdrop {
		position: absolute;
		inset: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.6);
	}
	.featured {
		position: relative;
		text-align: center;
		max-width: 90%;
		max-height: 86%;
		overflow-y: auto;
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius-lg);
		padding: 22px 26px;
		box-shadow: 0 12px 44px rgba(0, 0, 0, 0.55);
	}
	.fclose {
		position: absolute;
		top: 8px;
		right: 10px;
		background: none;
		border: none;
		color: var(--muted);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}
	.fclose:hover {
		color: var(--text);
	}
	.fdont {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
		color: var(--muted);
		font: 12px var(--font-sans);
		cursor: pointer;
	}
	.fdont input {
		cursor: pointer;
	}
	.featured h2 {
		margin: 0 0 4px;
		color: var(--text);
		font: 600 20px var(--font-sans);
	}
	.featured .fsub {
		margin: 0 0 16px;
		color: var(--muted);
		font: 13px var(--font-sans);
	}
	.featured .fcards {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		justify-content: center;
	}
	.featured .fcard {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 220px;
		max-width: 300px;
		padding: 12px 16px;
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius);
		text-align: left;
		transition: border-color 0.12s;
	}
	.featured .fcard:hover {
		border-color: var(--text);
	}
	.featured .ftitle {
		color: var(--text);
		font: 600 14px var(--font-sans);
		text-decoration: none;
	}
	.featured .ftitle:hover {
		text-decoration: underline;
	}
	.featured .fmeta {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--muted);
		font: 12px/1.4 var(--font-sans);
	}
	.featured .fby {
		flex: 1;
	}
	.featured .ficon {
		display: inline-flex;
		color: var(--muted);
		transition: color 0.12s;
	}
	.featured .ficon:hover {
		color: var(--text);
	}

	.viewport {
		position: relative;
		overflow: hidden;
		background: var(--bg);
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
		transition: opacity 0.15s ease-out;
	}

	.edge {
		fill: none;
		stroke: #4d4d4d;
		stroke-width: 1.5;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	.edge.allocated {
		stroke: var(--ok);
		stroke-width: 3;
	}
	.edge.future {
		stroke: var(--ok-deep);
		stroke-width: 2;
	}
	.edge.preview {
		stroke: var(--ok);
		stroke-width: 3;
		stroke-dasharray: 9 7;
	}

	.node {
		cursor: pointer;
	}
	.node image {
		pointer-events: none;
	}
	/* invisible click/hover target spanning the whole frame */
	.node circle.hit {
		fill: transparent;
	}
	/* dark backing behind the (sometimes transparent) skill icon */
	.node circle.bg {
		fill: var(--panel);
	}
	.node circle.overlay {
		fill: none;
		pointer-events: none;
	}

	/* planned but not yet reached at the current timeline position */
	.node.future {
		opacity: 0.45;
	}
	/* hover path preview — green ring over the frame */
	.node.preview circle.overlay {
		stroke: var(--ok);
		stroke-width: 4;
		vector-effect: non-scaling-stroke;
	}
	/* glow the matches (no dimming of the rest) */
	.node.search-hit {
		opacity: 1;
	}
	/* matches get a cheap bright ring (no filter — filters on many nodes tank
	   panning perf); only the focused result gets a single soft glow */
	/* stroke-width is in tree units (scales with zoom) so the ring stays a thin
	   halo proportional to the node instead of a fat fixed-pixel blob when zoomed out */
	.node.search-hit circle.overlay {
		stroke: #ffd966;
		stroke-width: 9;
	}
	.node.search-current circle.overlay {
		stroke: #fff6d5;
		stroke-width: 14;
		filter: drop-shadow(0 0 8px #ffd966);
	}
	/* radar ping for a sole search result — expanding rings that fade out */
	.node .ping {
		fill: none;
		stroke: #ffe9a6;
		stroke-width: 8;
		pointer-events: none;
		transform-box: fill-box;
		transform-origin: center;
		animation: node-ping 1.8s ease-out infinite;
	}
	.node .ping.ping2 {
		animation-delay: 0.9s;
	}
	@keyframes node-ping {
		0% {
			transform: scale(0.7);
			opacity: 0.85;
		}
		100% {
			transform: scale(3.2);
			opacity: 0;
		}
	}

	.tip {
		position: absolute;
		pointer-events: none;
		transform: translate(-50%, -100%);
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
		font-size: 12px;
		max-width: min(540px, 90vw);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
		z-index: 20;
	}
	.tip .name {
		font-weight: 600;
		color: var(--text);
		margin-bottom: 4px;
		font-size: 13px;
	}
	.tip .meta {
		color: var(--muted);
		font-size: 11px;
		margin-bottom: 4px;
	}
	.tip .meta span {
		margin-right: 8px;
	}
	.tip .line {
		color: var(--text);
		line-height: 1.35;
		white-space: pre-line;
	}

	.legend,
	.help {
		position: absolute;
		bottom: 12px;
		background: var(--glass);
		border: 1px solid var(--edge);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
		font-size: 11px;
		z-index: 10;
	}
	.legend {
		left: 12px;
		font-size: 13px;
		padding: 12px 14px;
		min-width: 168px;
	}
	.help {
		right: 12px;
		color: var(--muted);
		max-width: 260px;
	}
	.legend h3 {
		font-size: 12px;
		margin: 0 0 8px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.legend .row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 5px 0;
	}
	.legend .row.main {
		padding-bottom: 6px;
		margin-bottom: 6px;
		border-bottom: 1px solid var(--edge);
	}
	.legend .sicon {
		width: 24px;
		height: 24px;
		object-fit: contain;
		flex: none;
		display: block;
	}
	.legend .lname {
		flex: 1;
	}
	.legend .lcount {
		color: var(--text);
		font: 13px var(--font-mono);
		margin-left: 14px;
	}
	.help kbd {
		background: var(--panel-2);
		border: 1px solid var(--edge);
		border-radius: var(--radius-sm);
		padding: 1px 5px;
		font: 11px var(--font-mono);
		color: var(--text);
	}

	/* multi-choice options listed in the hover tooltip (numbered, like in-game) */
	.tip .opts {
		margin-top: 6px;
		padding-top: 6px;
		border-top: 1px solid var(--edge);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tip .opt {
		display: flex;
		align-items: baseline;
		gap: 6px;
		color: var(--text);
		line-height: 1.3;
	}
	.tip .opt .num {
		flex: none;
		min-width: 14px;
		text-align: center;
		color: var(--faint);
		font: 10px var(--font-mono);
	}
	.tip .opt.sel {
		color: var(--ok-bright);
		font-weight: 600;
	}
	.tip .opt.sel .num {
		color: var(--ok-bright);
	}
	.tip .choice-hint {
		margin: 5px 0 0;
		font-style: italic;
	}

	/* at-node choice menu (game-style popover) */
	.node-menu {
		position: absolute;
		transform: translate(14px, -50%);
		z-index: 30;
		display: flex;
		flex-direction: column;
		min-width: 150px;
		max-width: min(560px, 90vw);
		background: var(--glass);
		border: 1px solid var(--edge-strong);
		border-radius: var(--radius);
		padding: 4px;
		box-shadow: 0 6px 22px rgba(0, 0, 0, 0.75);
	}
	.node-menu .mi {
		text-align: left;
		background: transparent;
		border: 0;
		border-radius: var(--radius-sm);
		color: var(--text);
		padding: 5px 8px;
		font-size: 12px;
		line-height: 1.3;
		cursor: pointer;
	}
	.node-menu .mi:hover {
		background: var(--panel-2);
		color: #fff;
	}
	.node-menu .mi.sel {
		color: var(--ok-bright);
		font-weight: 600;
	}
	.node-menu .mi.unalloc {
		color: var(--gold-bright);
		border-bottom: 1px solid var(--edge);
		margin-bottom: 3px;
		padding-bottom: 6px;
		border-radius: 0;
	}
	.node-menu .mi.unalloc:hover {
		background: var(--accent-soft);
		color: var(--gold-bright);
	}
</style>
