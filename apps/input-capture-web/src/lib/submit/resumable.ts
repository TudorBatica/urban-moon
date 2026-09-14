/* Sends one file to a Cloud Storage resumable session, in chunks. After a network error it asks
   the session how much arrived and carries on from there. Works the same against the emulator. */

/** 8 MiB: Cloud Storage wants every chunk but the last to be a multiple of 256 KiB. */
export const CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_ATTEMPTS = 5;

/** The session is gone (expired or unknown): a new one is needed. */
export class SessionGoneError extends Error {
	constructor() {
		super('upload session gone');
		this.name = 'SessionGoneError';
	}
}

export interface PutOptions {
	fetchImpl: typeof fetch;
	sessionUri: string;
	blob: Blob;
	/** bytes the session holds so far */
	onBytes?: (sent: number) => void;
	chunkBytes?: number;
	sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "bytes=0-1234" → 1235; no header → 0. */
function persisted(res: Response): number | null {
	const range = res.headers.get('Range');
	if (range === null) return null;
	const m = /bytes=0-(\d+)/.exec(range);
	return m ? Number(m[1]) + 1 : 0;
}

type Status = { done: true } | { done: false; offset: number | null };

async function query(o: PutOptions): Promise<Status> {
	const res = await o.fetchImpl(o.sessionUri, {
		method: 'PUT',
		headers: { 'Content-Range': `bytes */${o.blob.size}` }
	});
	if (res.status === 200 || res.status === 201) return { done: true };
	if (res.status === 308) return { done: false, offset: persisted(res) ?? 0 };
	if (res.status === 404 || res.status === 410) throw new SessionGoneError();
	throw new Error(`status query ${res.status}`);
}

export async function putResumable(o: PutOptions): Promise<void> {
	const size = o.blob.size;
	const chunk = o.chunkBytes ?? CHUNK_BYTES;
	const sleep = o.sleep ?? wait;
	let offset = 0;
	let failures = 0;

	/* A fresh session holds nothing, so there is nothing to ask before the first chunk. (The local
	   emulator also takes a status query as the end of the upload.) */
	for (;;) {
		const end = Math.min(offset + chunk, size);
		try {
			const res = await o.fetchImpl(o.sessionUri, {
				method: 'PUT',
				headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${size}` },
				body: o.blob.slice(offset, end)
			});
			if (res.status === 200 || res.status === 201) {
				o.onBytes?.(size);
				return;
			}
			if (res.status === 404 || res.status === 410) throw new SessionGoneError();
			if (res.status !== 308) throw new Error(`chunk ${res.status}`);
			/* When the Range header cannot be read (CORS), the whole chunk is assumed stored; a
			   wrong guess fails the next chunk, and the status query below puts it right. */
			offset = persisted(res) ?? end;
			failures = 0;
			o.onBytes?.(offset);
		} catch (err) {
			if (err instanceof SessionGoneError) throw err;
			if (++failures >= MAX_ATTEMPTS) throw err;
			await sleep(500 * 2 ** (failures - 1));
			try {
				const s = await query(o);
				if (s.done) {
					o.onBytes?.(size);
					return;
				}
				offset = s.offset ?? 0;
			} catch (e) {
				if (e instanceof SessionGoneError) throw e;
				/* still offline: the next chunk attempt counts as another failure */
			}
		}
	}
}
