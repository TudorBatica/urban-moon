import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Dev only: reads WireMock's request journal so you can see what HubSpot would have received. */

export interface InboxField {
	name: string;
	value: string;
}

export interface InboxEntry {
	id: string;
	kind: 'submission' | 'upload';
	method: string;
	url: string;
	at: string;
	size: number;
	ts: number;
	status: number;
	/** submissions */
	fields: InboxField[];
	/** uploads */
	fileName: string;
	folderPath: string;
	note: string;
}

const MAX_VALUE = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

function cut(v: string): string {
	return v.length <= MAX_VALUE ? v : v.slice(0, MAX_VALUE - 1) + '…';
}

function asString(v: unknown): string {
	if (typeof v === 'string') return v;
	if (v === null || v === undefined) return '';
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

/** Pull a named part out of a logged multipart body (WireMock logs it as raw text). */
function multipartPart(body: string, name: string): string {
	const re = new RegExp(
		`name="${name}"[^]*?\\r?\\n\\r?\\n([^]*?)\\r?\\n--`,
		'i'
	);
	const m = re.exec(body);
	return m ? m[1].trim() : '';
}

export const load: PageServerLoad = async ({ fetch }) => {
	const adminBase = env.MOCK_ADMIN_BASE ?? '';
	if (!adminBase) error(404, 'Not found');

	let entries: InboxEntry[] = [];
	let problem = '';

	try {
		const res = await fetch(`${adminBase}/requests?limit=100`, {
			signal: AbortSignal.timeout(3000)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data: unknown = await res.json();
		const raw = isRecord(data) && Array.isArray(data.requests) ? data.requests : [];

		entries = raw
			.filter(isRecord)
			.map((row) => {
				const req = isRecord(row.request) ? row.request : {};
				const res2 = isRecord(row.response) ? row.response : {};
				const url = asString(req.url);
				const body = asString(req.body);
				const isSubmission = url.includes('/submissions/');
				const isUpload = url.includes('/files/v3/files');
				if (!isSubmission && !isUpload) return null;

				const entry: InboxEntry = {
					id: asString(row.id),
					kind: isSubmission ? 'submission' : 'upload',
					method: asString(req.method),
					url,
					at: asString(req.loggedDateString) || asString(req.loggedDate),
					ts: typeof req.loggedDate === 'number' ? req.loggedDate : 0,
					size: body.length,
					status: typeof res2.status === 'number' ? res2.status : 0,
					fields: [],
					fileName: '',
					folderPath: '',
					note: ''
				};

				if (isSubmission) {
					try {
						const parsed: unknown = JSON.parse(body);
						const fields = isRecord(parsed) && Array.isArray(parsed.fields) ? parsed.fields : [];
						entry.fields = fields.filter(isRecord).map((f) => ({
							name: asString(f.name),
							value: cut(asString(f.value))
						}));
						if (isRecord(parsed) && isRecord(parsed.context)) {
							entry.note = cut(asString(parsed.context.pageUri));
						}
					} catch {
						entry.note = 'Corpul cererii nu este JSON valid.';
					}
				} else {
					entry.fileName = cut(multipartPart(body, 'fileName'));
					entry.folderPath = cut(multipartPart(body, 'folderPath'));
				}

				return entry;
			})
			.filter((e): e is InboxEntry => e !== null)
			.sort((a, b) => b.ts - a.ts); // newest first
	} catch (err) {
		problem = `Nu am putut citi jurnalul WireMock (${(err as Error).message}).`;
	}

	return { adminBase, entries, problem };
};
