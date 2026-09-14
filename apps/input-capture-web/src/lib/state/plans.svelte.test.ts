import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Drawing, PlanFileMeta, PlansState } from '$lib/types';

/* The store runs browser-only code paths; give it a browser flag, a localStorage and an
   in-memory IndexedDB before the module under test is imported. */
vi.mock('$app/environment', () => ({ browser: true }));

const idb = vi.hoisted(() => new Map<string, unknown>());

vi.mock('idb-keyval', () => ({
	set: async (k: string, v: unknown): Promise<void> => {
		idb.set(k, v);
	},
	get: async (k: string): Promise<unknown> => idb.get(k),
	del: async (k: string): Promise<void> => {
		idb.delete(k);
	}
}));

const ls = vi.hoisted(() => {
	const store = new Map<string, string>();
	const shim = {
		getItem: (k: string): string | null => (store.has(k) ? (store.get(k) as string) : null),
		setItem: (k: string, v: string): void => void store.set(k, String(v)),
		removeItem: (k: string): void => void store.delete(k),
		clear: (): void => store.clear(),
		key: (i: number): string | null => [...store.keys()][i] ?? null,
		get length(): number {
			return store.size;
		}
	};
	if (!('localStorage' in globalThis)) {
		Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
	}
	/* One picked room, so addFiles can auto-tag. */
	globalThis.localStorage.setItem('um.answers', JSON.stringify({ c_rooms: ['bucatarie'] }));
	return store;
});

const {
	ACCEPTED_TYPES,
	MAX_FILE_BYTES,
	addFiles,
	getFileBlob,
	isPlansComplete,
	maxFiles,
	plans,
	removeFile,
	resetPlans,
	setDrawing,
	setFileRoom
} = await import('./plans.svelte');

const meta = (id: string): PlanFileMeta => ({
	id,
	name: `${id}.pdf`,
	type: 'application/pdf',
	size: 1024,
	roomId: null,
	addedAt: 0
});

function mk(name: string, type: string, size = 1024): File {
	const f = new File([new Uint8Array(8)], name, { type });
	Object.defineProperty(f, 'size', { value: size, configurable: true });
	return f;
}

const REASON_TYPE = 'Tipul de fișier nu e acceptat (PDF, JPG, PNG, WEBP, HEIC, DWG, DXF).';
const REASON_SIZE = 'Fișierul are peste 25 MB.';
const REASON_DUP = 'Fișierul e deja adăugat.';

beforeEach(async () => {
	await resetPlans();
	idb.clear();
	ls.delete('um.plans');
});

describe('maxFiles', () => {
	it('gives two files per room', () => {
		expect(maxFiles(1)).toBe(2);
		expect(maxFiles(3)).toBe(6);
		expect(maxFiles(8)).toBe(16);
	});

	it('never drops below two', () => {
		expect(maxFiles(0)).toBe(2);
		expect(maxFiles(-1)).toBe(2);
	});
});

describe('isPlansComplete', () => {
	const empty: PlansState = { files: [], drawing: null };

	it('is false with no files and no drawing', () => {
		expect(isPlansComplete(empty)).toBe(false);
	});

	it('is true with at least one file', () => {
		expect(isPlansComplete({ files: [meta('a')], drawing: null })).toBe(true);
	});

	it('is true with a drawing alone', () => {
		const drawing = {
			model: null,
			room: null,
			svg: '',
			pngDataUrl: '',
			updatedAt: 0
		} as unknown as Drawing;
		expect(isPlansComplete({ files: [], drawing })).toBe(true);
	});
});

describe('MAX_FILE_BYTES', () => {
	it('is 25 MB', () => {
		expect(MAX_FILE_BYTES).toBe(26_214_400);
	});

	it('lists every accepted extension', () => {
		for (const ext of ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.dwg', '.dxf'])
			expect(ACCEPTED_TYPES).toContain(ext);
	});
});

describe('addFiles — accepting', () => {
	it('accepts by mime type', async () => {
		const res = await addFiles([mk('plan.pdf', 'application/pdf')], 1);
		expect(res.rejected).toEqual([]);
		expect(res.added).toHaveLength(1);
		expect(plans.files[0].name).toBe('plan.pdf');
	});

	it('accepts by extension when the browser gives no mime (DWG)', async () => {
		const res = await addFiles([mk('parter.DWG', '')], 1);
		expect(res.rejected).toEqual([]);
		expect(plans.files).toHaveLength(1);
		expect(plans.files[0].type).toBe('');
	});

	it('stores the blob in IndexedDB under plan-file:<id>', async () => {
		const { added } = await addFiles([mk('plan.png', 'image/png')], 1);
		const id = added[0].id;
		expect(idb.has(`plan-file:${id}`)).toBe(true);
		expect(await getFileBlob(id)).toBeInstanceOf(File);
	});

	it('persists metadata to localStorage', async () => {
		await addFiles([mk('plan.pdf', 'application/pdf')], 1);
		const raw = ls.get('um.plans');
		expect(raw).toBeTruthy();
		expect(JSON.parse(raw as string).files).toHaveLength(1);
	});
});

describe('addFiles — rejecting', () => {
	it('rejects a type that is not on the list', async () => {
		const res = await addFiles([mk('notes.txt', 'text/plain')], 1);
		expect(res.added).toEqual([]);
		expect(res.rejected).toEqual([{ name: 'notes.txt', reason: REASON_TYPE }]);
		expect(plans.files).toHaveLength(0);
	});

	it('rejects a file over 25 MB', async () => {
		const big = mk('mare.pdf', 'application/pdf', MAX_FILE_BYTES + 1);
		const res = await addFiles([big], 1);
		expect(res.rejected).toEqual([{ name: 'mare.pdf', reason: REASON_SIZE }]);
	});

	it('accepts a file of exactly 25 MB', async () => {
		const res = await addFiles([mk('exact.pdf', 'application/pdf', MAX_FILE_BYTES)], 1);
		expect(res.rejected).toEqual([]);
	});

	it('rejects over the limit with one room (two files)', async () => {
		const res = await addFiles(
			[
				mk('a.pdf', 'application/pdf'),
				mk('b.pdf', 'application/pdf'),
				mk('c.pdf', 'application/pdf')
			],
			1
		);
		expect(res.added).toHaveLength(2);
		expect(res.rejected).toEqual([{ name: 'c.pdf', reason: 'Ai atins limita de 2 fișiere.' }]);
	});

	it('rejects over the limit with three rooms (six files)', async () => {
		const many = Array.from({ length: 7 }, (_, i) => mk(`p${i}.pdf`, 'application/pdf'));
		const res = await addFiles(many, 3);
		expect(res.added).toHaveLength(6);
		expect(res.rejected).toEqual([{ name: 'p6.pdf', reason: 'Ai atins limita de 6 fișiere.' }]);
	});

	it('rejects a duplicate by name and size', async () => {
		await addFiles([mk('plan.pdf', 'application/pdf', 2048)], 3);
		const res = await addFiles([mk('plan.pdf', 'application/pdf', 2048)], 3);
		expect(res.rejected).toEqual([{ name: 'plan.pdf', reason: REASON_DUP }]);
		expect(plans.files).toHaveLength(1);
	});

	it('keeps a same-named file of a different size', async () => {
		await addFiles([mk('plan.pdf', 'application/pdf', 2048)], 3);
		const res = await addFiles([mk('plan.pdf', 'application/pdf', 4096)], 3);
		expect(res.rejected).toEqual([]);
		expect(plans.files).toHaveLength(2);
	});
});

describe('room tagging', () => {
	it('tags the single picked room automatically', async () => {
		const { added } = await addFiles([mk('plan.pdf', 'application/pdf')], 1);
		expect(added[0].roomId).toBe('bucatarie');
		expect(plans.files[0].roomId).toBe('bucatarie');
	});

	it('leaves the tag empty with several rooms', async () => {
		const { added } = await addFiles([mk('plan.pdf', 'application/pdf')], 3);
		expect(added[0].roomId).toBeNull();
	});

	it('setFileRoom sets and clears the tag, and persists', async () => {
		const { added } = await addFiles([mk('plan.pdf', 'application/pdf')], 3);
		setFileRoom(added[0].id, 'living');
		expect(plans.files[0].roomId).toBe('living');
		expect(JSON.parse(ls.get('um.plans') as string).files[0].roomId).toBe('living');
		setFileRoom(added[0].id, null);
		expect(plans.files[0].roomId).toBeNull();
	});
});

describe('removeFile', () => {
	it('drops the metadata and the blob', async () => {
		const { added } = await addFiles(
			[mk('a.pdf', 'application/pdf'), mk('b.pdf', 'application/pdf')],
			3
		);
		await removeFile(added[0].id);
		expect(plans.files.map((f) => f.name)).toEqual(['b.pdf']);
		expect(idb.has(`plan-file:${added[0].id}`)).toBe(false);
		expect(idb.has(`plan-file:${added[1].id}`)).toBe(true);
		expect(await getFileBlob(added[0].id)).toBeUndefined();
	});

	it('ignores an unknown id', async () => {
		await addFiles([mk('a.pdf', 'application/pdf')], 3);
		await removeFile('nope');
		expect(plans.files).toHaveLength(1);
	});
});

describe('resetPlans', () => {
	it('clears files, drawing, blobs and localStorage', async () => {
		await addFiles([mk('a.pdf', 'application/pdf'), mk('b.png', 'image/png')], 3);
		setDrawing({
			model: null,
			room: null,
			svg: '<svg/>',
			pngDataUrl: 'data:,',
			updatedAt: 1
		} as unknown as Drawing);
		expect(isPlansComplete(plans)).toBe(true);

		await resetPlans();

		expect(plans.files).toEqual([]);
		expect(plans.drawing).toBeNull();
		expect(isPlansComplete(plans)).toBe(false);
		expect([...idb.keys()]).toEqual([]);
		expect(ls.get('um.plans')).toBeUndefined();
	});
});
