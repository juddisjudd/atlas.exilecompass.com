// Postgres-backed store for shared plans (pobb.in-style short links).
// The plan stays an opaque base64 blob; this is just a key -> blob table.
import postgres from 'postgres';
import { nanoid } from 'nanoid';
import { env } from '$env/dynamic/private';

let sql: postgres.Sql | null = null;
let ensured: Promise<void> | null = null;

function db(): postgres.Sql {
	if (!sql) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
		sql = postgres(env.DATABASE_URL);
	}
	return sql;
}

/** Lazily create the table once per process. */
function ensure(): Promise<void> {
	if (!ensured) {
		ensured = db()`
			CREATE TABLE IF NOT EXISTS plans (
				id           TEXT PRIMARY KEY,
				code         TEXT NOT NULL,
				tree_version TEXT,
				created_at   TIMESTAMPTZ DEFAULT now(),
				views        INTEGER DEFAULT 0
			)
		`.then(() => undefined);
	}
	return ensured;
}

export interface PlanRow {
	code: string;
	tree_version: string | null;
	views: number;
}

/** Store a plan, returning its short id. Retries on the rare id collision. */
export async function createPlan(code: string, treeVersion: string): Promise<string> {
	await ensure();
	for (let attempt = 0; attempt < 5; attempt++) {
		const id = nanoid(12);
		try {
			await db()`
				INSERT INTO plans (id, code, tree_version)
				VALUES (${id}, ${code}, ${treeVersion})
			`;
			return id;
		} catch (e) {
			// 23505 = unique_violation -> id collision, retry
			if ((e as { code?: string }).code !== '23505') throw e;
		}
	}
	throw new Error('could not allocate a unique id');
}

/** Fetch a plan by id and bump its view counter. */
export async function getPlan(id: string): Promise<PlanRow | null> {
	await ensure();
	const rows = await db()<PlanRow[]>`
		UPDATE plans SET views = views + 1
		WHERE id = ${id}
		RETURNING code, tree_version, views
	`;
	return rows[0] ?? null;
}

/** Row count + on-disk size, for monitoring growth from a URL. */
export async function stats(): Promise<{ count: number; bytes: number }> {
	await ensure();
	const rows = await db()<{ count: number; bytes: number }[]>`
		SELECT count(*)::int AS count, pg_total_relation_size('plans')::int AS bytes
		FROM plans
	`;
	return rows[0];
}
