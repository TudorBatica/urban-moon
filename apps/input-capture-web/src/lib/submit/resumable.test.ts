import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, SessionGoneError, putResumable } from './resumable';

/* A stand-in for one Cloud Storage resumable session. */
function fakeSession(size: number, o: { failCalls?: number[]; status?: number; exposeRange?: boolean } = {}) {
	let stored = 0;
	let call = 0;
	const ranges: string[] = [];
	const r308 = (n: number) =>
		new Response(null, { status: 308, headers: o.exposeRange === false || n === 0 ? {} : { Range: `bytes=0-${n - 1}` } });

	const impl = (async (_url: unknown, init?: RequestInit) => {
		call++;
		const cr = new Headers(init?.headers).get('Content-Range') ?? '';
		ranges.push(cr);
		if (o.failCalls?.includes(call)) throw new TypeError('network down');
		if (o.status) return new Response(null, { status: o.status });
		const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(cr);
		if (!m) return stored === size ? new Response('{}', { status: 200 }) : r308(stored);
		if (Number(m[1]) > stored) return new Response(null, { status: 400 });
		stored = Math.max(stored, Number(m[2]) + 1);
		return stored === size ? new Response('{}', { status: 200 }) : r308(stored);
	}) as unknown as typeof fetch;

	return { impl, ranges, stored: () => stored };
}

const blob = (n: number) => new Blob([new Uint8Array(n)]);
const noSleep = async () => {};

describe('putResumable', () => {
	it('sends the file in chunks and reports the bytes the session holds', async () => {
		const s = fakeSession(10);
		const sent: number[] = [];
		await putResumable({ fetchImpl: s.impl, sessionUri: 'u', blob: blob(10), chunkBytes: 4, onBytes: (n) => sent.push(n) });
		expect(s.ranges).toEqual(['bytes 0-3/10', 'bytes 4-7/10', 'bytes 8-9/10']);
		expect(sent).toEqual([4, 8, 10]);
		expect(s.stored()).toBe(10);
	});

	it('after a network error, asks the session where it is and carries on from there', async () => {
		const s = fakeSession(10, { failCalls: [2] });
		await putResumable({ fetchImpl: s.impl, sessionUri: 'u', blob: blob(10), chunkBytes: 4, sleep: noSleep });
		expect(s.ranges).toEqual(['bytes 0-3/10', 'bytes 4-7/10', 'bytes */10', 'bytes 4-7/10', 'bytes 8-9/10']);
	});

	it('assumes a chunk was stored when the Range header cannot be read', async () => {
		const s = fakeSession(10, { exposeRange: false });
		await putResumable({ fetchImpl: s.impl, sessionUri: 'u', blob: blob(10), chunkBytes: 4 });
		expect(s.ranges).toEqual(['bytes 0-3/10', 'bytes 4-7/10', 'bytes 8-9/10']);
	});

	it('reports a session that is gone', async () => {
		const s = fakeSession(10, { status: 410 });
		await expect(putResumable({ fetchImpl: s.impl, sessionUri: 'u', blob: blob(10) })).rejects.toBeInstanceOf(
			SessionGoneError
		);
	});

	it(`gives up after ${MAX_ATTEMPTS} failures in a row`, async () => {
		const s = fakeSession(10, { failCalls: Array.from({ length: 50 }, (_, i) => i + 1) });
		await expect(
			putResumable({ fetchImpl: s.impl, sessionUri: 'u', blob: blob(10), sleep: noSleep })
		).rejects.toThrow('network down');
	});
});
