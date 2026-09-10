import { env } from '$env/dynamic/private';
import type { HubSpotSubmission } from './mapping';

/** Server only — holds the token. Talks to the WireMock stand-in in this phase. */

export interface UploadedFile {
	id: string;
	url: string;
	name: string;
	size: number;
}

export const config = {
	get apiBase(): string {
		return env.HUBSPOT_API_BASE || 'http://localhost:8080';
	},
	get formsBase(): string {
		return env.HUBSPOT_FORMS_BASE || 'http://localhost:8080';
	},
	get token(): string {
		return env.HUBSPOT_TOKEN || 'mock-token';
	},
	get portalId(): string {
		return env.HUBSPOT_PORTAL_ID || '000000';
	},
	get formGuid(): string {
		return env.HUBSPOT_FORM_GUID || '00000000-0000-0000-0000-000000000000';
	},
	get filesFolder(): string {
		return env.HUBSPOT_FILES_FOLDER || '/proiecte';
	}
};

const TIMEOUT_MS = 15_000;

/**
 * True while no real HubSpot credential is configured — i.e. the demo deploy.
 *
 * In that state `uploadFile` and `submitForm` short-circuit to a synthetic success so a
 * tester can walk the whole questionnaire and reach /multumim. Nothing is sent anywhere.
 * Setting a real `HUBSPOT_TOKEN` turns this off on its own; there is no flag to forget.
 */
export function isUnconfigured(): boolean {
	const t = (env.HUBSPOT_TOKEN ?? '').trim();
	return t === '' || t === 'mock-token';
}

/** Romanian, user-safe. Technical detail goes to console.error, never to the browser. */
export const GENERIC_ERROR = 'Nu am putut trimite răspunsurile. Încearcă din nou.';

/** Dev only: the mock scenario header is forwarded only when the mock admin base is set. */
function scenarioHeaders(scenario?: string): Record<string, string> {
	if (!scenario) return {};
	if (!(env.MOCK_ADMIN_BASE ?? '')) return {};
	return { 'X-Mock-Scenario': scenario };
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Files API v3 upload. Verified shape (developers.hubspot.com, fetched 2026-09-08):
 * multipart with `file`, `options` (JSON, `access` required), `folderPath`/`folderId`,
 * `fileName`; 201 returns { id, url, name, size, … }.
 */
export async function uploadFile(
	file: File,
	opts?: { folderPath?: string; fileName?: string; scenario?: string }
): Promise<UploadedFile> {
	const folderPath = opts?.folderPath || config.filesFolder;
	const fileName = opts?.fileName || file.name;

	const form = new FormData();
	form.append('file', file, fileName);
	form.append(
		'options',
		JSON.stringify({
			access: 'PUBLIC_NOT_INDEXABLE',
			duplicateValidationStrategy: 'NONE',
			duplicateValidationScope: 'EXACT_FOLDER'
		})
	);
	form.append('folderPath', folderPath);
	form.append('fileName', fileName);

	if (isUnconfigured()) {
		console.warn(
			`[hubspot] DEMO MODE: no HUBSPOT_TOKEN set — pretending to upload "${fileName}". Nothing left this server.`
		);
		return {
			id: `demo-${Math.random().toString(36).slice(2, 10)}`,
			url: `https://example.invalid/demo/${encodeURIComponent(fileName)}`,
			name: fileName,
			size: file.size
		};
	}

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(`${config.apiBase}/files/v3/files`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.token}`,
				...scenarioHeaders(opts?.scenario)
			},
			body: form,
			signal: ctrl.signal
		});

		const text = await res.text();
		if (!res.ok) {
			console.error(`[hubspot] files upload ${res.status}: ${text.slice(0, 500)}`);
			throw new Error(`upload failed (${res.status})`);
		}

		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			console.error(`[hubspot] files upload: non-JSON body: ${text.slice(0, 500)}`);
			throw new Error('upload failed (bad response)');
		}
		if (!isRecord(body) || typeof body.url !== 'string') {
			console.error(`[hubspot] files upload: no url in response: ${text.slice(0, 500)}`);
			throw new Error('upload failed (no url)');
		}

		return {
			id: String(body.id ?? ''),
			url: body.url,
			name: String(body.name ?? fileName),
			size: typeof body.size === 'number' ? body.size : file.size
		};
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Forms v3 authenticated submission. Verified (docs/hubspot-forms-v3-auth.txt):
 * POST /submissions/v3/integration/secure/submit/:portalId/:formGuid, JSON body,
 * `Authorization: Bearer {token}`, response carries `inlineMessage` / `redirectUri` / `errors`.
 */
export async function submitForm(
	submission: HubSpotSubmission,
	opts?: { scenario?: string }
): Promise<{ ok: boolean; inlineMessage?: string; error?: string }> {
	const url = `${config.formsBase}/submissions/v3/integration/secure/submit/${config.portalId}/${config.formGuid}`;

	if (isUnconfigured()) {
		const fields = submission.fields.map((f) => `${f.name}=${f.value.slice(0, 120)}`);
		console.warn(
			'[hubspot] DEMO MODE: no HUBSPOT_TOKEN set — the submission was NOT sent to HubSpot.\n' +
				fields.join('\n')
		);
		return { ok: true, inlineMessage: 'Mulțumim! (demo — răspunsurile nu au fost trimise)' };
	}

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${config.token}`,
				...scenarioHeaders(opts?.scenario)
			},
			body: JSON.stringify(submission),
			signal: ctrl.signal
		});

		const text = await res.text();
		if (!res.ok) {
			console.error(`[hubspot] form submit ${res.status}: ${text.slice(0, 1000)}`);
			return { ok: false, error: GENERIC_ERROR };
		}

		let inlineMessage: string | undefined;
		try {
			const body: unknown = JSON.parse(text);
			if (isRecord(body) && typeof body.inlineMessage === 'string') {
				inlineMessage = body.inlineMessage;
			}
		} catch {
			/* a 2xx with no JSON body is still a success */
		}
		return { ok: true, inlineMessage };
	} catch (err) {
		console.error('[hubspot] form submit failed:', err);
		return { ok: false, error: GENERIC_ERROR };
	} finally {
		clearTimeout(timer);
	}
}
