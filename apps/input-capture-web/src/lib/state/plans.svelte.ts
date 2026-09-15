import { browser } from '$app/environment';
import { del, get, set } from 'idb-keyval';
import {
	ACCEPTED_CONTENT_TYPES,
	ACCEPTED_EXTENSIONS,
	MAX_IMAGE_BYTES,
	acceptedTypeOf,
	maxPlanFiles
} from '@urban-moon/domain-data';
import type { Drawing, PlanFileMeta, PlansState } from '$lib/types';

const KEY = 'um.plans';
const blobKey = (id: string): string => `plan-file:${id}`;

/** Two plan files per picked room, never below two — the rule lives in domain-data. */
export const maxFiles = maxPlanFiles;

/** For the file picker's accept attribute: the accepted mime types and their extensions. */
export const ACCEPTED_TYPES: string[] = [
	...ACCEPTED_CONTENT_TYPES,
	...ACCEPTED_CONTENT_TYPES.flatMap((t) => ACCEPTED_EXTENSIONS[t])
];

/** The upload route still passes files through the server (Cloudflare), so plan PDFs stay under
 *  25 MB until uploads go straight to the bucket; images follow domain-data's 10 MB. */
export const MAX_FILE_BYTES: number = 25 * 1024 * 1024;

export const REASON_TYPE = 'Tipul de fișier nu e acceptat (PDF, JPG, PNG).';
export const REASON_SIZE = 'Fișierul are peste 25 MB.';
export const REASON_IMAGE_SIZE = 'Poza are peste 10 MB.';
export const REASON_DUPLICATE = 'Fișierul e deja adăugat.';
export const reasonLimit = (max: number): string => `Ai atins limita de ${max} fișiere.`;

/** Accepted by mime OR by extension, case-insensitive. */
export function isAcceptedFile(name: string, type: string): boolean {
	return acceptedTypeOf(name, type) !== null;
}

function load(): PlansState {
	if (!browser) return { files: [], drawing: null };
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { files: [], drawing: null };
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			const p = parsed as Partial<PlansState>;
			return {
				files: Array.isArray(p.files) ? (p.files as PlanFileMeta[]) : [],
				drawing: (p.drawing as Drawing | null) ?? null
			};
		}
	} catch {
		/* corrupt or unavailable storage — start clean */
	}
	return { files: [], drawing: null };
}

function persist(): void {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify({ files: plans.files, drawing: plans.drawing }));
	} catch {
		/* quota or private mode — metadata stays in memory */
	}
}

export const plans: PlansState = $state(load());

export function isPlansComplete(p: PlansState): boolean {
	return p.files.length > 0 || p.drawing !== null;
}

export async function addFiles(
	files: File[],
	roomCount: number
): Promise<{ added: PlanFileMeta[]; rejected: { name: string; reason: string }[] }> {
	const max = maxFiles(roomCount);
	const added: PlanFileMeta[] = [];
	const rejected: { name: string; reason: string }[] = [];

	for (const file of files) {
		if (!isAcceptedFile(file.name, file.type)) {
			rejected.push({ name: file.name, reason: REASON_TYPE });
			continue;
		}
		if (file.size > MAX_FILE_BYTES) {
			rejected.push({ name: file.name, reason: REASON_SIZE });
			continue;
		}
		if (acceptedTypeOf(file.name, file.type) !== 'application/pdf' && file.size > MAX_IMAGE_BYTES) {
			rejected.push({ name: file.name, reason: REASON_IMAGE_SIZE });
			continue;
		}
		if (plans.files.length >= max) {
			rejected.push({ name: file.name, reason: reasonLimit(max) });
			continue;
		}
		if (plans.files.some((f) => f.name === file.name && f.size === file.size)) {
			rejected.push({ name: file.name, reason: REASON_DUPLICATE });
			continue;
		}

		const meta: PlanFileMeta = {
			id: crypto.randomUUID(),
			name: file.name,
			type: file.type,
			size: file.size,
			addedAt: Date.now()
		};
		await set(blobKey(meta.id), file);
		plans.files.push(meta);
		added.push(meta);
	}

	if (added.length) persist();
	return { added, rejected };
}

export async function removeFile(id: string): Promise<void> {
	const i = plans.files.findIndex((f) => f.id === id);
	if (i < 0) return;
	plans.files.splice(i, 1);
	persist();
	await del(blobKey(id));
}

export async function getFileBlob(id: string): Promise<Blob | undefined> {
	return await get<Blob>(blobKey(id));
}

export function setDrawing(d: Drawing | null): void {
	plans.drawing = d;
	persist();
}

export async function resetPlans(): Promise<void> {
	const ids = plans.files.map((f) => f.id);
	plans.files = [];
	plans.drawing = null;
	if (browser) {
		try {
			localStorage.removeItem(KEY);
		} catch {
			/* ignore */
		}
	}
	await Promise.all(ids.map((id) => del(blobKey(id))));
}
