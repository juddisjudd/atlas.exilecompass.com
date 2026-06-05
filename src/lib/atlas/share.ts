// Encode/decode a plan to a compact, URL-safe base64 code (pobb.in style).
// Layout (v1):
//   u8  version
//   6B  treeVersion (12 hex chars -> 6 bytes)
//   u16 stepCount, then stepCount * u16 node hashes
//   u8  milestoneCount, then per milestone: u16 at, u8 labelLen, label (utf8)
//   u8  titleLen, title (utf8)
import { tree } from './tree-data';
import type { Milestone } from './planner.svelte';

export const SHARE_VERSION = 1;

export interface Plan {
	v: number;
	treeVersion: string;
	steps: number[];
	milestones: Milestone[];
	title: string;
}

export interface PlanInput {
	steps: number[];
	milestones: Milestone[];
	title?: string;
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
		if (v !== SHARE_VERSION) return null; // unknown version
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
		return { v, treeVersion, steps, milestones, title };
	} catch {
		return null;
	}
}

/** Whether a decoded plan was built against the current tree data. */
export function isCurrentTree(plan: Plan): boolean {
	return plan.treeVersion === tree.version.slice(0, 12);
}
