import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DEFAULT_BASE = 'http://localhost:8080';

export const GET: RequestHandler = async () => {
	const base = env.HUBSPOT_API_BASE || DEFAULT_BASE;
	const mock = base.includes('localhost');

	let mockReachable = false;
	if (mock) {
		try {
			const res = await fetch(`${base}/__admin/health`, {
				signal: AbortSignal.timeout(1000)
			});
			mockReachable = res.ok;
		} catch {
			mockReachable = false;
		}
	}

	return json({ ok: true, mock, mockReachable });
};
