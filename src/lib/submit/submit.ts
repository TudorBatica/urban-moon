import type { Answers, Drawing, PlanFileMeta, PlansState, SubmitRequest } from '$lib/types';

/**
 * Client-side submit orchestration. Pure and injectable: every side effect (fetch, blob
 * lookup, storage, id generation) arrives as an option, so `submit.test.ts` drives it without
 * a browser.
 */

export type StepState = 'pending' | 'uploading' | 'done' | 'failed';

export interface StepProgress {
	index: number;
	total: number;
	label: string;
	state: StepState;
}

export interface SubmitResult {
	ok: boolean;
	error?: string;
	/** Label of the step that failed, when it failed. */
	step?: string;
}

/** The subset of `Storage` we use; a plain object works in tests. */
export interface SimpleStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface RunSubmissionOptions {
	answers: Answers;
	plans: PlansState;
	readback: string;
	fetchImpl?: typeof fetch;
	getBlob: (id: string) => Promise<Blob | undefined>;
	onProgress?: (p: StepProgress) => void;
	scenario?: string;
	/** Defaults to `sessionStorage` in the browser; injectable for tests. */
	storage?: SimpleStorage | null;
	/** Defaults to `location.href`. */
	pageUri?: string;
	/** Defaults to `crypto.randomUUID()`. */
	newId?: () => string;
}

export const SUBMISSION_ID_KEY = 'um.submissionId';
export const UPLOADED_KEY = 'um.uploaded';

const GENERIC_ERROR = 'Nu am putut trimite răspunsurile. Încearcă din nou.';

interface Uploaded {
	url: string;
	name: string;
	roomId: PlanFileMeta['roomId'];
}

function defaultStorage(): SimpleStorage | null {
	try {
		if (typeof sessionStorage !== 'undefined') return sessionStorage;
	} catch {
		/* private mode */
	}
	return null;
}

function randomId(): string {
	try {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
	} catch {
		/* fall through */
	}
	return `um-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function readCache(storage: SimpleStorage | null): Record<string, Uploaded> {
	if (!storage) return {};
	try {
		const raw = storage.getItem(UPLOADED_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, Uploaded>;
		}
	} catch {
		/* corrupt cache — start clean */
	}
	return {};
}

function writeCache(storage: SimpleStorage | null, cache: Record<string, Uploaded>): void {
	if (!storage) return;
	try {
		storage.setItem(UPLOADED_KEY, JSON.stringify(cache));
	} catch {
		/* quota — retries will simply re-upload */
	}
}

/** The submission id is kept for the whole attempt series so retries dedupe in HubSpot. */
export function submissionId(storage: SimpleStorage | null, newId: () => string): string {
	if (storage) {
		try {
			const existing = storage.getItem(SUBMISSION_ID_KEY);
			if (existing) return existing;
			const fresh = newId();
			storage.setItem(SUBMISSION_ID_KEY, fresh);
			return fresh;
		} catch {
			/* fall through */
		}
	}
	return newId();
}

/** Called after a successful submit so the next project starts clean. */
export function clearSubmissionState(storage: SimpleStorage | null = defaultStorage()): void {
	if (!storage) return;
	try {
		storage.removeItem(SUBMISSION_ID_KEY);
		storage.removeItem(UPLOADED_KEY);
	} catch {
		/* ignore */
	}
}

export function dataUrlToBlob(dataUrl: string): Blob {
	const comma = dataUrl.indexOf(',');
	const head = dataUrl.slice(0, comma);
	const body = dataUrl.slice(comma + 1);
	const mime = /:(.*?)[;,]/.exec(head)?.[1] ?? 'application/octet-stream';
	if (!head.includes(';base64')) {
		return new Blob([decodeURIComponent(body)], { type: mime });
	}
	const bin = atob(body);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}

/** The steps a run will report, in order. Used by the panel to render the list up front. */
export function planSteps(plans: PlansState): string[] {
	const labels = plans.files.map((f) => f.name);
	if (plans.drawing) labels.push('Planul desenat (imagine)', 'Planul desenat (date)');
	labels.push('Trimit răspunsurile');
	return labels;
}

function emailOf(answers: Answers): string {
	const id = answers?.c_identity;
	if (id && typeof id === 'object' && !Array.isArray(id)) {
		const e = (id as Record<string, unknown>).email;
		if (typeof e === 'string') return e.trim();
	}
	return '';
}

export async function runSubmission(opts: RunSubmissionOptions): Promise<SubmitResult> {
	const {
		answers,
		plans,
		readback,
		getBlob,
		onProgress,
		scenario,
		fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
		storage = defaultStorage(),
		newId = randomId
	} = opts;

	if (!fetchImpl) return { ok: false, error: GENERIC_ERROR };

	const pageUri =
		opts.pageUri ?? (typeof location !== 'undefined' ? location.href : 'http://localhost/');
	const email = emailOf(answers);
	const labels = planSteps(plans);
	const total = labels.length;
	const headers: Record<string, string> = scenario ? { 'X-Mock-Scenario': scenario } : {};

	const report = (index: number, state: StepState): void => {
		onProgress?.({ index, total, label: labels[index] ?? '', state });
	};
	for (let i = 0; i < total; i++) report(i, 'pending');

	const cache = readCache(storage);
	// Allocated up front so every attempt in this series — including ones that die on an upload —
	// carries the same id, and HubSpot dedupes the retries.
	const id = submissionId(storage, newId);

	async function upload(
		index: number,
		blob: Blob,
		name: string,
		roomId: PlanFileMeta['roomId'],
		cacheKey: string | null
	): Promise<Uploaded | null> {
		if (cacheKey && cache[cacheKey]?.url) {
			report(index, 'done');
			return cache[cacheKey];
		}
		report(index, 'uploading');

		const body = new FormData();
		body.append('file', blob, name);
		body.append('email', email);
		if (roomId) body.append('roomId', roomId);

		try {
			const res = await fetchImpl!('/api/upload', { method: 'POST', body, headers });
			const data: unknown = await res.json().catch(() => null);
			const url =
				data && typeof data === 'object' && typeof (data as { url?: unknown }).url === 'string'
					? (data as { url: string }).url
					: '';
			if (!res.ok || !url) {
				report(index, 'failed');
				return null;
			}
			const entry: Uploaded = { url, name, roomId };
			if (cacheKey) {
				cache[cacheKey] = entry;
				writeCache(storage, cache);
			}
			report(index, 'done');
			return entry;
		} catch (err) {
			console.error('[submit] upload failed:', err);
			report(index, 'failed');
			return null;
		}
	}

	const files: SubmitRequest['files'] = [];
	let index = 0;

	// 1) the plan files the user attached
	for (const meta of plans.files) {
		const cached = cache[meta.id];
		let entry: Uploaded | null = null;
		if (cached?.url) {
			report(index, 'done');
			entry = { ...cached, roomId: meta.roomId };
		} else {
			const blob = await getBlob(meta.id);
			if (!blob) {
				report(index, 'failed');
				return {
					ok: false,
					error: `Nu am găsit fișierul „${meta.name}". Adaugă-l din nou.`,
					step: meta.name
				};
			}
			entry = await upload(index, blob, meta.name, meta.roomId, meta.id);
		}
		if (!entry) {
			return {
				ok: false,
				error: `Nu am putut încărca fișierul „${meta.name}". Încearcă din nou.`,
				step: meta.name
			};
		}
		files.push({ url: entry.url, name: entry.name, roomId: meta.roomId });
		index++;
	}

	// 2) the drawing: a PNG and its JSON snapshot
	let drawing: SubmitRequest['drawing'] = null;
	const d: Drawing | null = plans.drawing;
	if (d) {
		const png = await upload(
			index,
			dataUrlToBlob(d.pngDataUrl),
			'plan-desenat.png',
			null,
			'drawing:png'
		);
		if (!png) {
			return {
				ok: false,
				error: 'Nu am putut încărca planul desenat. Încearcă din nou.',
				step: labels[index]
			};
		}
		index++;

		const jsonBlob = new Blob([JSON.stringify(d.room)], { type: 'application/json' });
		const jsonUp = await upload(index, jsonBlob, 'plan-desenat.json', null, 'drawing:json');
		if (!jsonUp) {
			return {
				ok: false,
				error: 'Nu am putut încărca planul desenat. Încearcă din nou.',
				step: labels[index]
			};
		}
		index++;

		drawing = { pngUrl: png.url, jsonUrl: jsonUp.url, room: d.room };
	}

	// 3) the submission itself
	report(index, 'uploading');
	const request: SubmitRequest = {
		submissionId: id,
		answers,
		readback,
		files,
		drawing,
		pageUri
	};

	try {
		const res = await fetchImpl('/api/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify(request)
		});
		const data: unknown = await res.json().catch(() => null);
		const ok =
			res.ok && !!data && typeof data === 'object' && (data as { ok?: unknown }).ok === true;
		if (!ok) {
			report(index, 'failed');
			const error =
				data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
					? (data as { error: string }).error
					: GENERIC_ERROR;
			return { ok: false, error, step: labels[index] };
		}
		report(index, 'done');
		clearSubmissionState(storage);
		return { ok: true };
	} catch (err) {
		console.error('[submit] submission failed:', err);
		report(index, 'failed');
		return { ok: false, error: GENERIC_ERROR, step: labels[index] };
	}
}
