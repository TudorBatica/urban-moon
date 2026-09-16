import { isTransientBucketError, type Bucket } from '@urban-moon/bucket';

export interface RetryOptions {
	/** attempts in all, including the first */
	tries?: number;
	/** the wait before the second attempt; each later wait is 4× longer */
	baseMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, and again after a transient bucket error: 3 attempts, 0.5 s then 2 s apart. */
export async function withRetry<T>(fn: () => Promise<T>, { tries = 3, baseMs = 500, sleep = realSleep }: RetryOptions = {}): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= tries || !isTransientBucketError(err)) throw err;
			await sleep(baseMs * 4 ** (attempt - 1));
		}
	}
}

/** The same bucket, with every call retried on transient errors. */
export function retrying(bucket: Bucket, opts: RetryOptions = {}): Bucket {
	const r = <T>(fn: () => Promise<T>) => withRetry(fn, opts);
	return {
		name: bucket.name,
		startResumableUpload: (o) => r(() => bucket.startResumableUpload(o)),
		metadata: (object) => r(() => bucket.metadata(object)),
		readHead: (object, bytes) => r(() => bucket.readHead(object, bytes)),
		read: (object) => r(() => bucket.read(object)),
		list: (prefix) => r(() => bucket.list(prefix)),
		createOnly: (object, body, type) => r(() => bucket.createOnly(object, body, type)),
		put: (object, body, type) => r(() => bucket.put(object, body, type)),
		delete: (object) => r(() => bucket.delete(object))
	};
}
