// Curated "Featured Planners" shown in the empty-state overlay on a fresh visit
// (the planner is empty and not in readonly/shared mode). The overlay hides
// itself as soon as the user allocates a node.
//
// `id` is a shared plan's short id — the part after the domain in its share URL,
// e.g. https://atlas.exilecompass.com/AbC123xyz -> id "AbC123xyz". Create the
// plan, hit Share, copy the id from the URL. The title links to /<id>.
//
// `twitch` / `youtube` are optional full URLs; their icons only render when set.
// Order here is the order shown. An empty list renders no overlay.
// Master switch for the featured-planners modal. Set to `true` to re-enable it
// (the entries and all UI code are kept regardless).
export const FEATURED_ENABLED = false;

export interface FeaturedPlan {
	id: string; // shared plan short id (links to /<id>)
	title: string;
	author: string;
	updated: string; // ISO date 'YYYY-MM-DD' (shown as m/d/year)
	twitch?: string; // full channel URL
	youtube?: string; // full channel URL
}

export const FEATURED_PLANS: FeaturedPlan[] = [
	// DEMO entry so the overlay is visible — replace `id` with a real share id
	// (the title link 404s until you do) and drop in the real social URLs.
	{
		id: 'REPLACE_ME',
		title: 'Fungun Atlas Tree & Strats',
		author: 'Fungun',
		updated: '2026-06-08',
		twitch: 'https://twitch.tv/',
		youtube: 'https://youtube.com/'
	}
];
