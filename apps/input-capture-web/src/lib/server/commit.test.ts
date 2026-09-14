import { ManifestSchema } from '@urban-moon/domain-data/schema';
import { describe, expect, it } from 'vitest';
import type { Bucket } from './bucket';
import { commitSubmission, type CommitRequest } from './commit';

/* An in-memory bucket with the same rules as Cloud Storage for what the commit uses. */
function memoryBucket(seed: Record<string, Uint8Array> = {}) {
	const objects = new Map(Object.entries(seed));
	const writes: string[] = [];
	const bucket: Bucket = {
		name: 'test',
		startResumableUpload: async () => 'http://session',
		metadata: async (o) => {
			const b = objects.get(o);
			return b ? { size: b.length, contentType: '', crc32c: 'crc==', generation: '1' } : null;
		},
		readHead: async (o, n) => objects.get(o)!.slice(0, n),
		createOnly: async (o, body) => {
			if (objects.has(o)) return false;
			writes.push(o);
			objects.set(o, new TextEncoder().encode(body));
			return true;
		},
		put: async (o, body) => {
			writes.push(o);
			objects.set(o, new TextEncoder().encode(body));
		}
	};
	return { bucket, objects, writes };
}

const PDF = new TextEncoder().encode('%PDF-1.7 plan');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

const ID = 'uuid-0000-1111';
const at = (o: string) => `submissions/${ID}/${o}`;

const room = {
	unit: 'cm',
	ceilingHeightCm: 260,
	closed: true,
	outline: [],
	walls: [],
	openings: [],
	unanswered: [],
	finished: true
};

const body = (over: Partial<CommitRequest> = {}): CommitRequest => ({
	pageUri: 'http://localhost:5173/rezumat',
	answers: { c_identity: { name: 'Ana Pop', email: 'ana@exemplu.ro' }, c_rooms: ['bucatarie'] },
	drawing: null,
	files: [
		{ fileId: 'f1', kind: 'plan', group: null, roomId: 'bucatarie', name: 'dir/plan.pdf', type: 'application/pdf', size: PDF.length, addedAt: 1 },
		{ fileId: 'p1', kind: 'photo', group: 'spatiu', roomId: null, name: 'IMG.JPG', type: '', size: JPEG.length, addedAt: 2 }
	],
	...over
});

const seeded = () => memoryBucket({ [at('uploads/f1.pdf')]: PDF, [at('uploads/p1.jpg')]: JPEG });
const commit = (bucket: Bucket, b = body()) =>
	commitSubmission({ bucket, submissionId: ID, body: b, appVersion: 'test', now: new Date('2026-09-14T10:00:00Z') });

describe('commitSubmission', () => {
	it('checks every object, writes a valid manifest once, then the pending marker', async () => {
		const { bucket, objects, writes } = seeded();
		const res = await commit(bucket);
		expect(res).toMatchObject({ ok: true, alreadyCommitted: false });
		expect(writes).toEqual([at('manifest.json'), `pending/${ID}`]);
		expect(objects.get(`pending/${ID}`)).toHaveLength(0);

		const stored = JSON.parse(new TextDecoder().decode(objects.get(at('manifest.json'))));
		expect(ManifestSchema.safeParse(stored).success).toBe(true);
		expect(stored).toMatchObject({
			submissionId: ID,
			committedAt: '2026-09-14T10:00:00.000Z',
			appVersion: 'test',
			client: { name: 'Ana Pop', email: 'ana@exemplu.ro' },
			rooms: ['bucatarie']
		});
		expect(stored.files).toEqual([
			expect.objectContaining({ fileId: 'f1', originalName: 'plan.pdf', contentType: 'application/pdf', object: 'uploads/f1.pdf', crc32c: 'crc==' }),
			expect.objectContaining({ fileId: 'p1', contentType: 'image/jpeg', object: 'uploads/p1.jpg' })
		]);
	});

	it('answers a second commit as already done: the manifest is kept, the marker put back', async () => {
		const { bucket, objects, writes } = seeded();
		await commit(bucket);
		objects.delete(`pending/${ID}`); // e.g. the marker write failed the first time
		expect(await commit(bucket)).toMatchObject({ ok: true, alreadyCommitted: true });
		expect(writes).toEqual([at('manifest.json'), `pending/${ID}`, `pending/${ID}`]);
		expect(objects.has(`pending/${ID}`)).toBe(true);
	});

	it('names the files that are not in the bucket, or not whole', async () => {
		const { bucket, writes } = memoryBucket({ [at('uploads/f1.pdf')]: PDF.slice(0, 4) });
		expect(await commit(bucket)).toMatchObject({ ok: false, status: 409, reason: 'missing', missing: ['f1', 'p1'] });
		expect(writes).toEqual([]);
	});

	it('refuses a file whose bytes are not what its name says', async () => {
		const { bucket } = memoryBucket({ [at('uploads/f1.pdf')]: JPEG.slice(0, 7), [at('uploads/p1.jpg')]: JPEG });
		const b = body();
		b.files[0].size = 7;
		expect(await commit(bucket, b)).toMatchObject({ ok: false, status: 400, reason: 'content' });
	});

	it('checks the drawing too', async () => {
		const { bucket } = seeded();
		const b = body({ drawing: { room, svg: '<svg/>', updatedAt: 3 } });
		expect(await commit(bucket, b)).toMatchObject({ ok: false, missing: ['drawing'] });

		const withPng = seeded();
		withPng.objects.set(at('uploads/drawing.png'), PNG);
		expect(await commit(withPng.bucket, b)).toMatchObject({ ok: true });
	});

	it('refuses answers the manifest schema does not accept', async () => {
		const { bucket, writes } = seeded();
		const res = await commit(bucket, body({ answers: { c_rooms: ['bucatarie'] } }));
		expect(res).toMatchObject({ ok: false, status: 400, reason: 'manifest_invalid' });
		expect(writes).toEqual([]);
	});
});
