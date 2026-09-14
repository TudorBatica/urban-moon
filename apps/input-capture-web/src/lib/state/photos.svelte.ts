import { browser } from '$app/environment';
import { del, get, set } from 'idb-keyval';
import type { PhotoMeta, RoomId } from '$lib/types';
import { MAX_IMAGE_BYTES, MAX_PHOTOS_PER_GROUP, acceptedTypeOf } from '@urban-moon/domain-data';
import { REASON_DUPLICATE, REASON_IMAGE_SIZE, reasonLimit } from './plans.svelte';

/* Photos of the space (plans step) and of the furniture kept in each room. Metadata lives in
   localStorage "um.photos", the blobs in IndexedDB — the same split as the plans store. */

const KEY = 'um.photos';
const blobKey = (id: string): string => `photo-file:${id}`;

/** Per group: the space, or one room's furniture. */
export const MAX_PHOTOS = MAX_PHOTOS_PER_GROUP;

export const PHOTO_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';

export const REASON_PHOTO_TYPE = 'Poți încărca doar poze JPG sau PNG.';

export function isPhoto(name: string, type: string): boolean {
	const t = acceptedTypeOf(name, type);
	return t === 'image/jpeg' || t === 'image/png';
}

function load(): PhotoMeta[] {
	if (!browser) return [];
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(parsed) ? (parsed as PhotoMeta[]) : [];
	} catch {
		return [];
	}
}

function persist(): void {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(photos.list));
	} catch {
		/* quota or private mode — metadata stays in memory */
	}
}

export const photos: { list: PhotoMeta[] } = $state({ list: load() });

export const photosOf = (
	list: PhotoMeta[],
	group: PhotoMeta['group'],
	roomId: RoomId | null
): PhotoMeta[] => list.filter((p) => p.group === group && p.roomId === roomId);

export async function addPhotos(
	files: File[],
	group: PhotoMeta['group'],
	roomId: RoomId | null
): Promise<{ rejected: { name: string; reason: string }[] }> {
	const rejected: { name: string; reason: string }[] = [];
	for (const file of files) {
		const mine = photosOf(photos.list, group, roomId);
		if (!isPhoto(file.name, file.type)) rejected.push({ name: file.name, reason: REASON_PHOTO_TYPE });
		else if (file.size > MAX_IMAGE_BYTES) rejected.push({ name: file.name, reason: REASON_IMAGE_SIZE });
		else if (mine.length >= MAX_PHOTOS)
			rejected.push({ name: file.name, reason: reasonLimit(MAX_PHOTOS) });
		else if (mine.some((f) => f.name === file.name && f.size === file.size))
			rejected.push({ name: file.name, reason: REASON_DUPLICATE });
		else {
			const meta: PhotoMeta = {
				id: crypto.randomUUID(),
				name: file.name,
				type: file.type,
				size: file.size,
				roomId,
				group,
				addedAt: Date.now()
			};
			await set(blobKey(meta.id), file);
			photos.list.push(meta);
			persist();
		}
	}
	return { rejected };
}

export async function removePhoto(id: string): Promise<void> {
	const i = photos.list.findIndex((f) => f.id === id);
	if (i < 0) return;
	photos.list.splice(i, 1);
	persist();
	await del(blobKey(id));
}

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
	return await get<Blob>(blobKey(id));
}

export async function resetPhotos(): Promise<void> {
	const ids = photos.list.map((f) => f.id);
	photos.list = [];
	if (browser) {
		try {
			localStorage.removeItem(KEY);
		} catch {
			/* ignore */
		}
	}
	await Promise.all(ids.map((id) => del(blobKey(id))));
}
