import { json, error } from '@sveltejs/kit';
import { createPlan } from '$lib/server/db';
import { decodePlan } from '$lib/atlas/share';
import type { RequestHandler } from './$types';

const MAX_CODE = 16 * 1024; // sanity cap

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const code = body?.code;
	if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE) {
		throw error(400, 'invalid code');
	}
	const plan = decodePlan(code);
	if (!plan) throw error(400, 'code did not decode');

	const id = await createPlan(code, plan.treeVersion);
	return json({ id });
};
