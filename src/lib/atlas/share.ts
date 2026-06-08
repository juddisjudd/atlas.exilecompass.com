// Encode/decode a plan to a compact, URL-safe base64 code (pobb.in style).
// Layout (v1):
//   u8  version
//   6B  treeVersion (12 hex chars -> 6 bytes)
//   u16 stepCount, then stepCount * u16 node hashes
//   u8  milestoneCount, then per milestone: u16 at, u8 labelLen, label (utf8)
//   u8  titleLen, title (utf8)
// v2 appends, after the title:
//   u16 choiceCount, then per choice: u16 node hash, u8 option index
// The option is stored as its index within the node's baked `c` list (1 byte);
// the treeVersion guard ensures that index still resolves to the same option.
// v3 appends, after the choices:
//   u16 notesLen, notes (utf8)   — free-text plan notes (16-bit length: may
//   exceed the 255-byte cap used for titles/milestone labels)
import { tree } from './tree-data';
import type { Milestone } from './planner.svelte';

export const SHARE_VERSION = 3;

// Cap on shared notes length (bytes). Generous for a paragraph or two while
// keeping the URL hash and stored blob bounded.
export const MAX_NOTES = 4000;

export interface Plan {
	v: number;
	treeVersion: string;
	steps: number[];
	milestones: Milestone[];
	title: string;
	notes: string;
	choices: Record<number, number>; // node hash -> chosen option index
}

export interface PlanInput {
	steps: number[];
	milestones: Milestone[];
	title?: string;
	notes?: string;
	choices?: Record<number, number>; // node hash -> chosen option index
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hexToBytes(hex: string, len: number): number[] {
	const out: number[] = [];
	for (let i = 0; i < len; i++) out.push(parseInt(hex.slice(i * 2, i * 2 + 2) || '0', 16) || 0);
	return out;
}
function bytesToHex(bytes: number[]): string {
	return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlToBytes(code: string): Uint8Array {
	const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function encodePlan(plan: PlanInput): string {
	const bytes: number[] = [];
	const u16 = (v: number) => bytes.push((v >> 8) & 0xff, v & 0xff);
	const str = (s: string, max = 255) => {
		const b = Array.from(encoder.encode(s)).slice(0, max);
		bytes.push(b.length);
		for (const x of b) bytes.push(x);
	};
	// 16-bit-length string, for fields that may exceed 255 bytes (notes).
	const str16 = (s: string, max: number) => {
		const b = Array.from(encoder.encode(s)).slice(0, max);
		u16(b.length);
		for (const x of b) bytes.push(x);
	};

	bytes.push(SHARE_VERSION);
	for (const b of hexToBytes(tree.version, 6)) bytes.push(b);
	u16(plan.steps.length);
	for (const h of plan.steps) u16(h & 0xffff);
	const ms = plan.milestones.slice(0, 255);
	bytes.push(ms.length);
	for (const m of ms) {
		u16(m.at);
		str(m.label);
	}
	str(plan.title ?? '');
	// v2: choices, encoded as (hash, option index) pairs
	const choiceEntries = Object.entries(plan.choices ?? {}).filter(([, idx]) => idx >= 0);
	u16(choiceEntries.length);
	for (const [k, idx] of choiceEntries) {
		u16(Number(k) & 0xffff);
		bytes.push(idx & 0xff);
	}
	// v3: free-text notes
	str16(plan.notes ?? '', MAX_NOTES);
	return bytesToBase64Url(Uint8Array.from(bytes));
}

export function decodePlan(code: string): Plan | null {
	try {
		const bytes = base64UrlToBytes(code);
		let p = 0;
		const u8 = () => bytes[p++];
		const u16 = () => (bytes[p++] << 8) | bytes[p++];
		const str = () => {
			const len = u8();
			const s = decoder.decode(bytes.slice(p, p + len));
			p += len;
			return s;
		};

		const v = u8();
		if (v < 1 || v > SHARE_VERSION) return null; // unknown version
		const treeVersion = bytesToHex(Array.from(bytes.slice(p, p + 6)));
		p += 6;
		const stepCount = u16();
		const steps: number[] = [];
		for (let i = 0; i < stepCount; i++) steps.push(u16());
		const mc = u8();
		const milestones: Milestone[] = [];
		for (let i = 0; i < mc; i++) {
			const at = u16();
			const label = str();
			milestones.push({ at, label });
		}
		const title = str();
		const choices: Record<number, number> = {};
		if (v >= 2 && p < bytes.length) {
			const cc = u16();
			for (let i = 0; i < cc; i++) {
				const h = u16();
				choices[h] = u8();
			}
		}
		let notes = '';
		if (v >= 3 && p < bytes.length) {
			const len = u16();
			notes = decoder.decode(bytes.slice(p, p + len));
			p += len;
		}
		return { v, treeVersion, steps, milestones, title, notes, choices };
	} catch {
		return null;
	}
}

/** Whether a decoded plan was built against the current tree data. */
export function isCurrentTree(plan: Plan): boolean {
	return plan.treeVersion === tree.version.slice(0, 12);
}
