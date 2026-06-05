import { json } from '@sveltejs/kit';
import { stats } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const s = await stats();
	return json({ count: s.count, bytes: s.bytes, kib: Math.round(s.bytes / 1024) });
};
