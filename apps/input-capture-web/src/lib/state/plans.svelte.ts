import { browser } from '$app/environment';
import { del, get, set } from 'idb-keyval';
import { pickedRooms } from './answers.svelte';
import type { Drawing, PlanFileMeta, PlansState, RoomId } from '$lib/types';

const KEY = 'um.plans';
const blobKey = (id: string): string => `plan-file:${id}`;

/** roomCount * 2, never below 2. */
export function maxFiles(roomCount: number): number {
	return Math.max(2, roomCount * 2);
}

export const ACCEPTED_TYPES: string[] = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'application/acad',
	'image/vnd.dwg',
	'image/vnd.dxf',
	'.pdf',
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.heic',
	'.heif',
	'.dwg',
	'.dxf'
];

export const MAX_FILE_BYTES: number = 25 * 1024 * 1024;

const ACCEPTED_MIME = new Set(
	ACCEPTED_TYPES.filter((t) => !t.startsWith('.')).map((t) => t.toLowerCase())
);
const ACCEPTED_EXT = new Set(
	ACCEPTED_TYPES.filter((t) => t.startsWith('.')).map((t) => t.toLowerCase())
);

/** Extra mime spellings browsers and CAD tools use for the same extensions. */
const ALSO_ACCEPTED_MIME = new Set([
	'application/x-pdf',
	'image/jpg',
	'image/x-heic',
	'image/x-heif',
	'application/dwg',
	'application/x-dwg',
	'application/x-acad',
	'application/autocad_dwg',
	'drawing/dwg',
	'application/dxf',
	'application/x-dxf',
	'application/x-autocad',
	'image/x-dwg',
	'image/x-dxf'
]);

export const REASON_TYPE = 'Tipul de fișier nu e acceptat (PDF, JPG, PNG, WEBP, HEIC, DWG, DXF).';
export const REASON_SIZE = 'Fișierul are peste 25 MB.';
export const REASON_DUPLICATE = 'Fișierul e deja adăugat.';
export const reasonLimit = (max: number): string => `Ai atins limita de ${max} fișiere.`;

function extOf(name: string): string {
	const i = name.lastIndexOf('.');
	return i < 0 ? '' : name.slice(i).toLowerCase();
}

/** Accepted by mime OR by extension, case-insensitive. A missing mime is common for DWG/DXF. */
export function isAcceptedFile(name: string, type: string): boolean {
	const mime = (type || '').split(';')[0].trim().toLowerCase();
	if (mime && (ACCEPTED_MIME.has(mime) || ALSO_ACCEPTED_MIME.has(mime))) return true;
	return ACCEPTED_EXT.has(extOf(name));
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
	/* One picked room means every plan can only be that room's. */
	const autoRoom: RoomId | null = roomCount === 1 ? (pickedRooms()[0] ?? null) : null;

	for (const file of files) {
		if (!isAcceptedFile(file.name, file.type)) {
			rejected.push({ name: file.name, reason: REASON_TYPE });
			continue;
		}
		if (file.size > MAX_FILE_BYTES) {
			rejected.push({ name: file.name, reason: REASON_SIZE });
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
			roomId: autoRoom,
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

export function setFileRoom(id: string, roomId: RoomId | null): void {
	const f = plans.files.find((x) => x.id === id);
	if (!f) return;
	f.roomId = roomId;
	persist();
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
