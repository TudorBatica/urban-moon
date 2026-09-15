import type { Answers, PhotoMeta, PlanFileMeta, PlansState } from '$lib/types';
import { SessionGoneError, putResumable } from './resumable';

/**
 * Client-side submit: every file goes straight to the bucket through a resumable session the
 * server opens (`/api/uploads/start`), then the server checks them and writes the manifest
 * (`/api/submissions/{id}/commit`). Pure and injectable: fetch, blob lookup, storage, ids and
 * sleeps arrive as options, so `submit.test.ts` drives it without a browser.
 */

export type StepState = 'pending' | 'uploading' | 'done' | 'failed';

export interface StepProgress {
	index: number;
	total: number;
	label: string;
	state: StepState;
	/** 0–100 while uploading */
	percent: number;
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
	getBlob: (id: string) => Promise<Blob | undefined>;
	/** photos of the space and of the kept furniture */
	photos?: PhotoMeta[];
	getPhotoBlob?: (id: string) => Promise<Blob | undefined>;
	onProgress?: (p: StepProgress) => void;
	fetchImpl?: typeof fetch;
	/** Defaults to `sessionStorage` in the browser; injectable for tests. */
	storage?: SimpleStorage | null;
	/** Defaults to `location.href`. */
	pageUri?: string;
	/** Defaults to `crypto.randomUUID()`. */
	newId?: () => string;
	sleep?: (ms: number) => Promise<void>;
	chunkBytes?: number;
}

export const SUBMISSION_ID_KEY = 'um.submissionId';
export const UPLOADS_KEY = 'um.uploads';

const GENERIC_ERROR = 'Nu am putut trimite răspunsurile. Încearcă din nou.';
const PARALLEL_UPLOADS = 3;
export const COMMIT_LABEL = 'Trimit răspunsurile';

/** A finished upload, remembered across retries and reloads of the tab so it is not sent again. */
interface CachedUpload {
	/** what was uploaded; a changed drawing or file is sent again */
	version: string;
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

function readCache(storage: SimpleStorage | null): Record<string, CachedUpload> {
	try {
		const parsed: unknown = JSON.parse(storage?.getItem(UPLOADS_KEY) ?? '{}');
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, CachedUpload>;
	} catch {
		/* corrupt cache — start clean */
	}
	return {};
}

function writeCache(storage: SimpleStorage | null, cache: Record<string, CachedUpload>): void {
	try {
		storage?.setItem(UPLOADS_KEY, JSON.stringify(cache));
	} catch {
		/* quota — a retry simply uploads again */
	}
}

/** The submission id is kept for the whole attempt series, so a retry writes to the same folder. */
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
		storage.removeItem(UPLOADS_KEY);
	} catch {
		/* ignore */
	}
}

export function dataUrlToBlob(dataUrl: string): Blob {
	const comma = dataUrl.indexOf(',');
	const head = dataUrl.slice(0, comma);
	const body = dataUrl.slice(comma + 1);
	const mime = /:(.*?)[;,]/.exec(head)?.[1] ?? 'application/octet-stream';
	if (!head.includes(';base64')) return new Blob([decodeURIComponent(body)], { type: mime });
	const bin = atob(body);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type: mime });
}

/** The steps a run will report, in order. Used by the panel to render the list up front. */
export function planSteps(plans: PlansState, photos: PhotoMeta[] = []): string[] {
	const labels = plans.files.map((f) => f.name);
	if (plans.drawing) labels.push('Planul desenat');
	for (const p of photos) labels.push(p.name);
	labels.push(COMMIT_LABEL);
	return labels;
}

/** The photos a send includes. Furniture photos of a room that is no longer picked stay in the
 *  browser but are left out: that room's chapter is gone, and the manifest would be refused. */
export function photosToSend(answers: Answers, photos: PhotoMeta[]): PhotoMeta[] {
	const rooms: unknown[] = Array.isArray(answers.c_rooms) ? answers.c_rooms : [];
	return photos.filter((p) => p.group !== 'mobilier' || rooms.includes(p.roomId));
}

interface UploadJob {
	index: number;
	label: string;
	fileId: string;
	kind: 'plan' | 'photo' | 'drawing';
	name: string;
	type: string;
	size: number;
	version: string;
	blob: () => Promise<Blob | undefined>;
	missingMessage: string;
	failedMessage: string;
}

async function responseJson(res: Response): Promise<Record<string, unknown>> {
	const data: unknown = await res.json().catch(() => null);
	return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

export async function runSubmission(opts: RunSubmissionOptions): Promise<SubmitResult> {
	const {
		answers,
		plans,
		getBlob,
		photos: allPhotos = [],
		getPhotoBlob = async () => undefined,
		onProgress,
		fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
		storage = defaultStorage(),
		newId = randomId
	} = opts;
	if (!fetchImpl) return { ok: false, error: GENERIC_ERROR };
	const photos = photosToSend(answers, allPhotos);

	const pageUri = opts.pageUri ?? (typeof location !== 'undefined' ? location.href : 'http://localhost/');
	const labels = planSteps(plans, photos);
	const total = labels.length;
	const report = (index: number, state: StepState, percent = state === 'done' ? 100 : 0): void =>
		onProgress?.({ index, total, label: labels[index] ?? '', state, percent });
	for (let i = 0; i < total; i++) report(i, 'pending');

	const id = submissionId(storage, newId);
	const cache = readCache(storage);

	/* ---------- the jobs ---------- */

	const jobs: UploadJob[] = [];
	const planJob = (m: PlanFileMeta, index: number): UploadJob => ({
		index,
		label: m.name,
		fileId: m.id,
		kind: 'plan',
		name: m.name,
		type: m.type,
		size: m.size,
		version: `${m.size}`,
		blob: () => getBlob(m.id),
		missingMessage: `Nu am găsit fișierul „${m.name}". Adaugă-l din nou.`,
		failedMessage: `Nu am putut încărca fișierul „${m.name}". Încearcă din nou.`
	});
	plans.files.forEach((m, i) => jobs.push(planJob(m, i)));

	let index = plans.files.length;
	const d = plans.drawing;
	if (d) {
		const png = dataUrlToBlob(d.pngDataUrl);
		jobs.push({
			index: index++,
			label: 'Planul desenat',
			fileId: 'drawing',
			kind: 'drawing',
			name: 'plan-desenat.png',
			type: 'image/png',
			size: png.size,
			version: `${d.updatedAt}:${png.size}`,
			blob: async () => png,
			missingMessage: 'Nu am găsit planul desenat. Desenează-l din nou.',
			failedMessage: 'Nu am putut încărca planul desenat. Încearcă din nou.'
		});
	}
	for (const p of photos)
		jobs.push({
			index: index++,
			label: p.name,
			fileId: p.id,
			kind: 'photo',
			name: p.name,
			type: p.type,
			size: p.size,
			version: `${p.size}`,
			blob: () => getPhotoBlob(p.id),
			missingMessage: `Nu am găsit poza „${p.name}". Adaug-o din nou.`,
			failedMessage: `Nu am putut încărca poza „${p.name}". Încearcă din nou.`
		});
	const commitIndex = index;

	/* ---------- one upload ---------- */

	async function startSession(job: UploadJob): Promise<string> {
		const res = await fetchImpl!('/api/uploads/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				submissionId: id,
				fileId: job.fileId,
				kind: job.kind,
				name: job.name,
				type: job.type,
				size: job.size
			})
		});
		const data = await responseJson(res);
		if (!res.ok || typeof data.sessionUri !== 'string')
			throw new UploadRefused(typeof data.error === 'string' ? data.error : job.failedMessage);
		return data.sessionUri;
	}

	async function upload(job: UploadJob): Promise<SubmitResult> {
		if (cache[job.fileId]?.version === job.version) {
			report(job.index, 'done');
			return { ok: true };
		}
		const blob = await job.blob();
		if (!blob) {
			report(job.index, 'failed');
			return { ok: false, error: job.missingMessage, step: job.label };
		}
		report(job.index, 'uploading');
		const onBytes = (sent: number) => report(job.index, 'uploading', Math.floor((sent / job.size) * 100));

		try {
			/* Each attempt opens its own session; an expired one gets one fresh start. */
			for (let fresh = 0; ; fresh++) {
				try {
					await putResumable({
						fetchImpl: fetchImpl!,
						sessionUri: await startSession(job),
						blob,
						onBytes,
						sleep: opts.sleep,
						chunkBytes: opts.chunkBytes
					});
					break;
				} catch (err) {
					if (!(err instanceof SessionGoneError) || fresh > 0) throw err;
				}
			}
			cache[job.fileId] = { version: job.version };
			writeCache(storage, cache);
			report(job.index, 'done');
			return { ok: true };
		} catch (err) {
			console.error('[submit] upload failed:', err);
			report(job.index, 'failed');
			return {
				ok: false,
				error: err instanceof UploadRefused ? err.message : job.failedMessage,
				step: job.label
			};
		}
	}

	/* ---------- uploads, a few at a time, stopping at the first failure ---------- */

	let failure: SubmitResult | null = null;
	const queue = [...jobs];
	await Promise.all(
		Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, async () => {
			for (let job = queue.shift(); job && !failure; job = queue.shift()) {
				const res = await upload(job);
				if (!res.ok) failure ??= res;
			}
		})
	);
	if (failure) return failure;

	/* ---------- commit ---------- */

	report(commitIndex, 'uploading');
	const fileOf = (
		m: PlanFileMeta,
		kind: 'plan' | 'photo',
		group: PhotoMeta['group'] | null,
		roomId: PhotoMeta['roomId']
	) => ({
		fileId: m.id,
		kind,
		group,
		roomId,
		name: m.name,
		type: m.type,
		size: m.size,
		addedAt: m.addedAt
	});
	const body = {
		pageUri,
		answers,
		drawing: d ? { room: d.room, svg: d.svg, updatedAt: d.updatedAt } : null,
		files: [
			...plans.files.map((m) => fileOf(m, 'plan', null, null)),
			...photos.map((p) => fileOf(p, 'photo', p.group, p.roomId))
		]
	};

	try {
		const res = await fetchImpl(`/api/submissions/${encodeURIComponent(id)}/commit`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await responseJson(res);
		if (!res.ok || data.ok !== true) {
			/* Files the server did not find are uploaded again on the retry. */
			if (Array.isArray(data.missing)) {
				for (const fileId of data.missing) delete cache[String(fileId)];
				writeCache(storage, cache);
			}
			report(commitIndex, 'failed');
			return { ok: false, error: typeof data.error === 'string' ? data.error : GENERIC_ERROR, step: COMMIT_LABEL };
		}
		report(commitIndex, 'done');
		clearSubmissionState(storage);
		return { ok: true };
	} catch (err) {
		console.error('[submit] commit failed:', err);
		report(commitIndex, 'failed');
		return { ok: false, error: GENERIC_ERROR, step: COMMIT_LABEL };
	}
}

/** The server refused to open a session; its message is meant for the user. */
class UploadRefused extends Error {}
