import { error } from '@sveltejs/kit';
import { getPlan } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const row = await getPlan(params.id);
	if (!row) throw error(404, 'plan not found');
	return { id: params.id, code: row.code, views: row.views };
};
