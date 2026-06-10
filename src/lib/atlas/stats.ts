// Aggregates the stat lines of allocated nodes into a per-subtree summary.
// Lines sharing the same text (numbers stripped) are merged by summing each
// numeric slot, so two nodes granting "5% increased Rare Monsters" show as a
// single "10% increased Rare Monsters" entry.
import { nodeByHash } from './tree-data';

export interface SummaryLine {
	text: string;
	count: number; // how many allocated nodes contribute to this line
}

export interface SummaryGroup {
	subtree: string;
	lines: SummaryLine[];
}

export interface StatTotal {
	label: string;
	base: number; // summed from unconditional lines
	situational: number; // summed from conditional variants (area-specific, per-modifier, …)
}

// Headline categories rolled up at the top of the modifier panel. `strict`
// matches the unconditional form of the line (counts toward the base total);
// `loose` catches conditional variants, whose values are reported separately
// as situational. Waystone quantity only exists as the map-boss line, so that
// is its base form.
const PCT = String.raw`(\d+(?:\.\d+)?)`;
const cat = (label: string, strict: string, loose: string) => ({
	label,
	strict: new RegExp(`^${PCT}% increased ${strict}$`),
	loose: new RegExp(`${PCT}% increased ${loose}`)
});
const TOTAL_CATEGORIES = [
	cat('Pack Size', 'Pack Size', String.raw`Pack Size\b`),
	cat('Magic Pack Size', 'Magic Pack Size', String.raw`Magic Pack Size\b`),
	cat('Rarity of Items', 'Rarity of Items found', String.raw`Rarity of Items\b`),
	cat('Quantity of Waystones', 'Quantity of Waystones dropped by Map Bosses', String.raw`Quantity of Waystones\b`),
	cat('Quantity of Tablets', 'Quantity of Tablets found', String.raw`Quantity of Tablets\b`),
	cat('Rare Chests', 'amount of Rare Chests', String.raw`amount of Rare Chests\b`),
	cat('Magic Chests', 'amount of Magic Chests', String.raw`amount of Magic Chests\b`),
	cat('Rare Monsters', 'Rare Monsters', String.raw`Rare Monsters\b`),
	cat('Magic Monsters', 'Magic Monsters', String.raw`Magic Monsters\b`)
];

/** Roll up the headline categories across the given allocated nodes. */
export function totals(hashes: Iterable<number>): StatTotal[] {
	const acc = TOTAL_CATEGORIES.map((c) => ({ label: c.label, base: 0, situational: 0 }));
	for (const h of hashes) {
		const n = nodeByHash.get(h);
		if (!n || n.t === 'root') continue;
		for (const line of n.st) {
			TOTAL_CATEGORIES.forEach((c, i) => {
				const m = c.strict.exec(line);
				if (m) {
					acc[i].base += parseFloat(m[1]);
				} else {
					const lm = c.loose.exec(line);
					if (lm) acc[i].situational += parseFloat(lm[1]);
				}
			});
		}
	}
	return acc.filter((t) => t.base > 0 || t.situational > 0);
}

const NUM = /\d+(?:\.\d+)?/g;
// Stands in for a stripped number while merging; never occurs in stat text.
const SLOT = String.fromCharCode(0);

// Generic ("Main") first, then the league subtrees in legend order.
const SUBTREE_ORDER = ['Generic', 'Ritual', 'Breach', 'Delirium', 'Incursion', 'Abyss'];

/** Strip the {0} magnitude placeholder from a selector option label. */
export function fmtChoiceLabel(label: string): string {
	const s = label
		.replace(/\{0\}%?/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return s ? s[0].toUpperCase() + s.slice(1) : label;
}

function fmtNum(v: number): string {
	return String(Math.round(v * 100) / 100);
}

/**
 * Summarize the stat lines of the given allocated nodes, grouped by subtree.
 * `choices` (node hash -> option index) keeps selector nodes with different
 * chosen options as separate entries, suffixed with the option label.
 */
export function summarize(
	hashes: Iterable<number>,
	choices: ReadonlyMap<number, number>
): SummaryGroup[] {
	type Entry = { tpl: string; vals: number[]; count: number; suffix?: string };
	const bySubtree = new Map<string, Map<string, Entry>>();

	for (const h of hashes) {
		const n = nodeByHash.get(h);
		if (!n || n.t === 'root') continue;
		const ci = choices.get(h);
		const choice = n.c && ci != null ? n.c[ci] : undefined;
		let group = bySubtree.get(n.s);
		if (!group) bySubtree.set(n.s, (group = new Map()));
		for (const line of n.st) {
			const vals: number[] = [];
			const tpl = line.replace(NUM, (m) => {
				vals.push(parseFloat(m));
				return SLOT;
			});
			const key = choice ? `${tpl}|${choice.id}` : tpl;
			const e = group.get(key);
			if (e) {
				e.count++;
				vals.forEach((v, i) => (e.vals[i] += v));
			} else {
				group.set(key, {
					tpl,
					vals,
					count: 1,
					suffix: choice ? fmtChoiceLabel(choice.label) : undefined
				});
			}
		}
	}

	const groups: SummaryGroup[] = [];
	for (const subtree of SUBTREE_ORDER) {
		const entries = bySubtree.get(subtree);
		if (!entries?.size) continue;
		const lines = [...entries.values()]
			.map((e) => {
				let i = 0;
				let text = e.tpl.replaceAll(SLOT, () => fmtNum(e.vals[i++]));
				if (e.suffix) text += ` — ${e.suffix}`;
				return { text, count: e.count };
			})
			.sort((a, b) => a.text.localeCompare(b.text));
		groups.push({ subtree, lines });
	}
	return groups;
}
