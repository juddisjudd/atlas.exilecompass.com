import { error } from '@sveltejs/kit';
import { getPlan } from '$lib/server/db';
import type { RequestHandler } from './$types';

// pobb.in-style raw view: the stored base64 plan code as plain text.
export const GET: RequestHandler = async ({ params }) => {
	const row = await getPlan(params.id);
	if (!row) throw error(404, 'plan not found');
	return new Response(row.code, {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
};
