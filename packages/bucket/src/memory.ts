import { BucketError, type Bucket } from './index';

/* An in-memory bucket for tests, with Cloud Storage's rules for what the apps use: reads of a
   missing object are 404s, createOnly refuses an existing object, delete says whether it deleted.
   `fault` makes a call fail, e.g. a 503 on the first read. */

export interface StoredObject {
	bytes: Uint8Array;
	contentType: string;
	timeCreated: string;
}

export type Fault = (op: string, object: string) => BucketError | undefined;

export interface MemoryBucket {
	bucket: Bucket;
	objects: Map<string, StoredObject>;
	fault: Fault | undefined;
	/** an object's body as text, undefined when it does not exist */
	text(object: string): string | undefined;
}

export function memoryBucket(opts: { now?: () => Date } = {}): MemoryBucket {
	const now = opts.now ?? (() => new Date());
	const objects = new Map<string, StoredObject>();
	const store = (object: string, body: string | Uint8Array, contentType: string) =>
		void objects.set(object, {
			bytes: typeof body === 'string' ? new TextEncoder().encode(body) : body,
			contentType,
			timeCreated: now().toISOString()
		});

	const mem: MemoryBucket = {
		objects,
		fault: undefined,
		text: (object) => {
			const o = objects.get(object);
			return o ? new TextDecoder().decode(o.bytes) : undefined;
		},
		bucket: undefined as unknown as Bucket
	};
	const check = (op: string, object: string) => {
		const err = mem.fault?.(op, object);
		if (err) throw err;
	};
	const read = (op: string, object: string) => {
		check(op, object);
		const o = objects.get(object);
		if (!o) throw new BucketError(op, 404, `No such object: ${object}`);
		return o.bytes;
	};

	mem.bucket = {
		name: 'memory',
		async startResumableUpload({ object }) {
			check('start_upload', object);
			return `memory://upload/${object}`;
		},
		async metadata(object) {
			check('metadata', object);
			const o = objects.get(object);
			return o ? { size: o.bytes.length, contentType: o.contentType, generation: '1' } : null;
		},
		readHead: async (object, bytes) => read('read_head', object).slice(0, bytes),
		read: async (object) => read('read', object),
		async list(prefix) {
			check('list', prefix);
			return [...objects]
				.filter(([name]) => name.startsWith(prefix))
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([name, o]) => ({ name, size: o.bytes.length, timeCreated: o.timeCreated }));
		},
		async createOnly(object, body, contentType) {
			check('create_only', object);
			if (objects.has(object)) return false;
			store(object, body, contentType);
			return true;
		},
		async put(object, body, contentType) {
			check('put', object);
			store(object, body, contentType);
		},
		async delete(object) {
			check('delete', object);
			return objects.delete(object);
		}
	};
	return mem;
}
