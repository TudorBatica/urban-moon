/* A small client for the Cloud Storage JSON API: what the web app's uploads and commit need, and
   what the PDF worker needs to work through pending/. Plain fetch, so it runs on any runtime and
   talks to Google or the local emulator alike. */

export interface ObjectMetadata {
	size: number;
	contentType: string;
	crc32c?: string;
	generation: string;
}

export interface ListedObject {
	name: string;
	size: number;
	/** RFC 3339 */
	timeCreated: string;
}

export interface Bucket {
	readonly name: string;
	/** Opens a resumable upload for one object and returns its session URI, a bearer secret. */
	startResumableUpload(o: { object: string; contentType: string; size: number; origin?: string }): Promise<string>;
	/** null when the object does not exist */
	metadata(object: string): Promise<ObjectMetadata | null>;
	/** The first `bytes` bytes of an object. */
	readHead(object: string, bytes: number): Promise<Uint8Array>;
	/** The whole object; a BucketError with status 404 when it does not exist. */
	read(object: string): Promise<Uint8Array>;
	/** Every object whose name starts with `prefix`, across all pages. */
	list(prefix: string): Promise<ListedObject[]>;
	/** Writes the object only if it does not exist yet; false when it already did. */
	createOnly(object: string, body: string, contentType: string): Promise<boolean>;
	/** Writes the object, replacing it if it exists. */
	put(object: string, body: string | Uint8Array, contentType: string): Promise<void>;
	/** false when there was nothing to delete */
	delete(object: string): Promise<boolean>;
}

export class BucketError extends Error {
	constructor(
		readonly op: string,
		readonly status: number,
		detail: string
	) {
		super(`bucket ${op} failed (${status}): ${detail}`);
		this.name = 'BucketError';
	}
}

/** Worth trying again: the network (status 0), a timeout, rate limiting or a server error. */
export function isTransientBucketError(err: unknown): boolean {
	return err instanceof BucketError && (err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500);
}

export interface BucketOptions {
	bucket: string;
	/** https://storage.googleapis.com, or the emulator's address */
	baseUrl: string;
	/** A bearer token for Google; null for the emulator. */
	accessToken?: () => Promise<string | null>;
	fetchImpl?: typeof fetch;
}

export function createBucket(opts: BucketOptions): Bucket {
	const base = opts.baseUrl.replace(/\/+$/, '');
	const b = encodeURIComponent(opts.bucket);
	const doFetch = opts.fetchImpl ?? fetch;
	const enc = encodeURIComponent;

	async function call(op: string, url: string, init: RequestInit = {}): Promise<Response> {
		const token = opts.accessToken ? await opts.accessToken() : null;
		const headers = new Headers(init.headers);
		if (token) headers.set('Authorization', `Bearer ${token}`);
		try {
			return await doFetch(url, { ...init, headers });
		} catch (err) {
			throw new BucketError(op, 0, (err as Error).message);
		}
	}

	const fail = async (op: string, res: Response) =>
		new BucketError(op, res.status, (await res.text().catch(() => '')).slice(0, 300));

	const read = async (op: string, object: string, headers?: Record<string, string>) => {
		const res = await call(op, `${base}/storage/v1/b/${b}/o/${enc(object)}?alt=media`, { headers });
		if (!res.ok) throw await fail(op, res);
		return new Uint8Array(await res.arrayBuffer());
	};

	return {
		name: opts.bucket,

		async startResumableUpload({ object, contentType, size, origin }) {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json; charset=UTF-8',
				'X-Upload-Content-Type': contentType,
				'X-Upload-Content-Length': String(size)
			};
			if (origin) headers.Origin = origin;
			const res = await call('start_upload', `${base}/upload/storage/v1/b/${b}/o?uploadType=resumable&name=${enc(object)}`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ name: object, contentType })
			});
			const location = res.headers.get('Location');
			if (!res.ok || !location) throw await fail('start_upload', res);
			return location;
		},

		async metadata(object) {
			const res = await call('metadata', `${base}/storage/v1/b/${b}/o/${enc(object)}`);
			if (res.status === 404) return null;
			if (!res.ok) throw await fail('metadata', res);
			const m = (await res.json()) as Record<string, unknown>;
			return {
				size: Number(m.size),
				contentType: String(m.contentType ?? ''),
				crc32c: typeof m.crc32c === 'string' ? m.crc32c : undefined,
				generation: String(m.generation ?? '')
			};
		},

		async readHead(object, bytes) {
			/* A server that ignores Range sends the whole object; only the head is kept. */
			return (await read('read_head', object, { Range: `bytes=0-${bytes - 1}` })).slice(0, bytes);
		},

		read: (object) => read('read', object),

		async list(prefix) {
			const out: ListedObject[] = [];
			let pageToken = '';
			do {
				const page = pageToken ? `&pageToken=${enc(pageToken)}` : '';
				const res = await call('list', `${base}/storage/v1/b/${b}/o?prefix=${enc(prefix)}${page}`);
				if (!res.ok) throw await fail('list', res);
				const body = (await res.json()) as { items?: Record<string, unknown>[]; nextPageToken?: string };
				for (const item of body.items ?? [])
					out.push({ name: String(item.name), size: Number(item.size ?? 0), timeCreated: String(item.timeCreated ?? '') });
				pageToken = body.nextPageToken ?? '';
			} while (pageToken);
			return out;
		},

		async createOnly(object, body, contentType) {
			const res = await call(
				'create_only',
				`${base}/upload/storage/v1/b/${b}/o?uploadType=media&name=${enc(object)}&ifGenerationMatch=0`,
				{ method: 'POST', headers: { 'Content-Type': contentType }, body }
			);
			if (res.status === 412) return false;
			if (!res.ok) throw await fail('create_only', res);
			return true;
		},

		async put(object, body, contentType) {
			const res = await call('put', `${base}/upload/storage/v1/b/${b}/o?uploadType=media&name=${enc(object)}`, {
				method: 'POST',
				headers: { 'Content-Type': contentType },
				body: typeof body === 'string' ? body : new Blob([body as Uint8Array<ArrayBuffer>])
			});
			if (!res.ok) throw await fail('put', res);
		},

		async delete(object) {
			const res = await call('delete', `${base}/storage/v1/b/${b}/o/${enc(object)}`, { method: 'DELETE' });
			if (res.status === 404) return false;
			if (!res.ok) throw await fail('delete', res);
			return true;
		}
	};
}

/** On Cloud Run: the service account's token from the metadata server, cached until near expiry. */
export function metadataServerToken(fetchImpl: typeof fetch = fetch): () => Promise<string> {
	let cached: { token: string; until: number } | null = null;
	return async () => {
		if (cached && Date.now() < cached.until) return cached.token;
		const res = await fetchImpl(
			'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
			{ headers: { 'Metadata-Flavor': 'Google' } }
		);
		if (!res.ok) throw new BucketError('token', res.status, 'metadata server');
		const body = (await res.json()) as { access_token: string; expires_in: number };
		cached = { token: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
		return body.access_token;
	};
}

/* The bucket, from the environment:
   - GCS_BUCKET                 the bucket name; unset means no bucket (null)
   - STORAGE_EMULATOR_HOST      e.g. http://localhost:4443 — the local emulator, no auth
   - GCS_ACCESS_TOKEN           optional, for using a real bucket from a laptop
                                (`gcloud auth print-access-token`); otherwise the Cloud Run
                                service account's token from the metadata server */

let cached: { key: string; bucket: Bucket } | null = null;

export function bucketFromEnv(env: Record<string, string | undefined>): Bucket | null {
	const name = env.GCS_BUCKET?.trim();
	if (!name) return null;
	const emulator = env.STORAGE_EMULATOR_HOST?.trim() ?? '';
	const staticToken = env.GCS_ACCESS_TOKEN?.trim() ?? '';
	const key = `${name}|${emulator}|${staticToken}`;
	if (cached?.key === key) return cached.bucket;

	const bucket = emulator
		? createBucket({ bucket: name, baseUrl: /^https?:\/\//.test(emulator) ? emulator : `http://${emulator}` })
		: createBucket({
				bucket: name,
				baseUrl: 'https://storage.googleapis.com',
				accessToken: staticToken ? async () => staticToken : metadataServerToken()
			});
	cached = { key, bucket };
	return bucket;
}
