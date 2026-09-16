import { describe, expect, it } from 'vitest';
import { BucketError, bucketFromEnv, createBucket, isTransientBucketError } from './index';
import { memoryBucket } from './memory';

function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
	const calls: { url: string; method: string; headers: Headers; body: unknown }[] = [];
	const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
		const url = String(input);
		calls.push({ url, method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body });
		return respond(url, init);
	}) as typeof fetch;
	return { impl, calls };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const bucketOn = (f: ReturnType<typeof fakeFetch>) =>
	createBucket({ bucket: 'um', baseUrl: 'http://gcs/', accessToken: async () => 'tok', fetchImpl: f.impl });

describe('createBucket', () => {
	it('lists a prefix across pages, with the token', async () => {
		const f = fakeFetch((url) =>
			url.includes('pageToken=')
				? json({ items: [{ name: 'pending/b', size: '0', timeCreated: '2026-09-15T10:01:00Z' }] })
				: json({ items: [{ name: 'pending/a', size: '0', timeCreated: '2026-09-15T10:00:00Z' }], nextPageToken: 'p/2' })
		);
		expect(await bucketOn(f).list('pending/')).toEqual([
			{ name: 'pending/a', size: 0, timeCreated: '2026-09-15T10:00:00Z' },
			{ name: 'pending/b', size: 0, timeCreated: '2026-09-15T10:01:00Z' }
		]);
		expect(f.calls.map((c) => c.url)).toEqual([
			'http://gcs/storage/v1/b/um/o?prefix=pending%2F',
			'http://gcs/storage/v1/b/um/o?prefix=pending%2F&pageToken=p%2F2'
		]);
		expect(f.calls[0].headers.get('Authorization')).toBe('Bearer tok');
	});

	it('lists nothing when the prefix is empty', async () => {
		expect(await bucketOn(fakeFetch(() => json({ kind: 'storage#objects' }))).list('failed/')).toEqual([]);
	});

	it('reads a whole object, and throws a 404 BucketError when it is missing', async () => {
		const f = fakeFetch((url) => (url.includes('missing') ? new Response('nope', { status: 404 }) : new Response('%PDF')));
		const bucket = bucketOn(f);
		expect(new TextDecoder().decode(await bucket.read('submissions/x/manifest.json'))).toBe('%PDF');
		expect(f.calls[0].url).toBe('http://gcs/storage/v1/b/um/o/submissions%2Fx%2Fmanifest.json?alt=media');
		await expect(bucket.read('missing')).rejects.toMatchObject({ name: 'BucketError', status: 404, op: 'read' });
	});

	it('puts bytes as a media upload with the content type', async () => {
		const f = fakeFetch(() => json({}));
		await bucketOn(f).put('submissions/x/output/raspunsuri.pdf', new Uint8Array([37, 80, 68, 70]), 'application/pdf');
		expect(f.calls[0]).toMatchObject({
			method: 'POST',
			url: 'http://gcs/upload/storage/v1/b/um/o?uploadType=media&name=submissions%2Fx%2Foutput%2Fraspunsuri.pdf'
		});
		expect(f.calls[0].headers.get('Content-Type')).toBe('application/pdf');
		expect((f.calls[0].body as Blob).size).toBe(4);
	});

	it('deletes: true when it did, false when there was nothing, throws otherwise', async () => {
		const status = { current: 204 };
		const bucket = bucketOn(fakeFetch(() => new Response(null, { status: status.current })));
		expect(await bucket.delete('pending/a')).toBe(true);
		status.current = 404;
		expect(await bucket.delete('pending/a')).toBe(false);
		status.current = 503;
		await expect(bucket.delete('pending/a')).rejects.toMatchObject({ status: 503 });
	});

	it('turns a network failure into a BucketError with status 0', async () => {
		const bucket = createBucket({
			bucket: 'um',
			baseUrl: 'http://gcs',
			fetchImpl: (async () => {
				throw new TypeError('fetch failed');
			}) as typeof fetch
		});
		await expect(bucket.list('pending/')).rejects.toMatchObject({ status: 0, op: 'list' });
	});
});

describe('isTransientBucketError', () => {
	it('retries the network, timeouts, rate limits and server errors only', () => {
		for (const s of [0, 408, 429, 500, 503]) expect(isTransientBucketError(new BucketError('read', s, ''))).toBe(true);
		for (const s of [400, 403, 404, 412]) expect(isTransientBucketError(new BucketError('read', s, ''))).toBe(false);
		expect(isTransientBucketError(new Error('boom'))).toBe(false);
	});
});

describe('bucketFromEnv', () => {
	it('is null without GCS_BUCKET, and the same client for the same settings', () => {
		expect(bucketFromEnv({})).toBeNull();
		const env = { GCS_BUCKET: 'um', STORAGE_EMULATOR_HOST: 'localhost:4443' };
		expect(bucketFromEnv(env)?.name).toBe('um');
		expect(bucketFromEnv({ ...env })).toBe(bucketFromEnv(env));
	});
});

describe('memoryBucket', () => {
	it('behaves like the bucket for what the apps use', async () => {
		const { bucket, text } = memoryBucket();
		await bucket.put('pending/a', '', 'application/octet-stream');
		await bucket.put('pending/b', new Uint8Array([1]), 'application/octet-stream');
		await bucket.put('submissions/a/manifest.json', '{}', 'application/json');
		expect((await bucket.list('pending/')).map((o) => o.name)).toEqual(['pending/a', 'pending/b']);
		expect(await bucket.createOnly('pending/a', 'x', 'text/plain')).toBe(false);
		expect(text('submissions/a/manifest.json')).toBe('{}');
		expect(await bucket.delete('pending/a')).toBe(true);
		expect(await bucket.delete('pending/a')).toBe(false);
		await expect(bucket.read('pending/a')).rejects.toMatchObject({ status: 404 });
	});

	it('fails the calls a fault picks', async () => {
		const mem = memoryBucket();
		mem.fault = (op) => (op === 'list' ? new BucketError('list', 503, 'down') : undefined);
		await expect(mem.bucket.list('pending/')).rejects.toMatchObject({ status: 503 });
		expect(await mem.bucket.metadata('pending/a')).toBeNull();
	});
});
