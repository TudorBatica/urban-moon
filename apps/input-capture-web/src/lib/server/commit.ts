import { z } from 'zod';
import { acceptedTypeOf, sniffContentType, type AcceptedContentType } from '@urban-moon/domain-data';
import {
	MANIFEST_SCHEMA_VERSION,
	ManifestSchema,
	type Manifest,
	type ManifestFile
} from '@urban-moon/domain-data/schema';
import type { Bucket } from './bucket';
import {
	DRAWING_OBJECT,
	MANIFEST_OBJECT,
	fileObject,
	pendingMarker,
	safeFileName,
	submissionPrefix
} from './objects';

/* POST /api/submissions/{id}/commit: the browser says what it sent; the server checks each object
   in the bucket (there, with the declared size, and really a JPEG, PNG or PDF), builds the manifest
   and writes it once, then leaves `pending/<id>` for the PDF worker. The manifest existing is
   what "submitted" means. */

export const CommitRequestSchema = z.object({
	pageUri: z.string().max(2000),
	answers: z.record(z.string(), z.unknown()),
	drawing: z
		.object({ room: z.unknown(), svg: z.string(), updatedAt: z.number() })
		.nullable(),
	files: z
		.array(
			z.object({
				fileId: z.string().regex(/^[A-Za-z0-9-]{1,80}$/),
				kind: z.enum(['plan', 'photo']),
				group: z.enum(['spatiu', 'mobilier']).nullable(),
				roomId: z.string().nullable(),
				name: z.string().min(1).max(500),
				type: z.string().max(200),
				size: z.number().int().positive(),
				addedAt: z.number().int().nonnegative()
			})
		)
		.max(200)
});

export type CommitRequest = z.infer<typeof CommitRequestSchema>;

export type CommitResult =
	| { ok: true; alreadyCommitted: boolean; manifest: Manifest }
	| {
			ok: false;
			status: 400 | 409;
			reason: string;
			error: string;
			/** files (or "drawing") not in the bucket as declared: the browser uploads them again */
			missing?: string[];
			issues?: unknown;
	  };

const HEAD_BYTES = 16;
const PARALLEL = 8;

async function inBatches<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
	const out: R[] = [];
	for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
	return out;
}

interface Check {
	id: string;
	name: string;
	object: string;
	size?: number;
	expect: AcceptedContentType;
}

type Checked =
	| { id: string; ok: true; crc32c?: string }
	| { id: string; ok: false; missing: boolean; name: string };

async function check(bucket: Bucket, prefix: string, c: Check): Promise<Checked> {
	const meta = await bucket.metadata(prefix + c.object);
	if (!meta || (c.size !== undefined && meta.size !== c.size))
		return { id: c.id, ok: false, missing: true, name: c.name };
	const sniffed = sniffContentType(await bucket.readHead(prefix + c.object, HEAD_BYTES));
	if (sniffed !== c.expect) return { id: c.id, ok: false, missing: false, name: c.name };
	return { id: c.id, ok: true, crc32c: meta.crc32c };
}

function identity(answers: Record<string, unknown>): { name: string; email: string } {
	const id = answers.c_identity;
	const rec = id && typeof id === 'object' && !Array.isArray(id) ? (id as Record<string, unknown>) : {};
	const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	return { name: str(rec.name), email: str(rec.email) };
}

export async function commitSubmission(o: {
	bucket: Bucket;
	submissionId: string;
	body: CommitRequest;
	appVersion: string;
	now?: Date;
}): Promise<CommitResult> {
	const { bucket, submissionId, body } = o;
	const prefix = submissionPrefix(submissionId);

	const checks: Check[] = [];
	for (const f of body.files) {
		const type = acceptedTypeOf(f.name, f.type);
		if (!type)
			return { ok: false, status: 400, reason: 'type', error: `Fișierul „${f.name}" nu este PDF, JPG sau PNG.` };
		checks.push({ id: f.fileId, name: f.name, object: fileObject(f.fileId, type), size: f.size, expect: type });
	}
	if (body.drawing)
		checks.push({ id: 'drawing', name: 'Planul desenat', object: DRAWING_OBJECT, expect: 'image/png' });

	const results = await inBatches(checks, PARALLEL, (c) => check(bucket, prefix, c));

	const missing = results.filter((r) => !r.ok && r.missing).map((r) => r.id);
	if (missing.length)
		return {
			ok: false,
			status: 409,
			reason: 'missing',
			missing,
			error: 'Unele fișiere nu au ajuns complet. Încearcă din nou.'
		};
	const wrong = results.find((r): r is Extract<Checked, { ok: false }> => !r.ok);
	if (wrong)
		return {
			ok: false,
			status: 400,
			reason: 'content',
			error: `Fișierul „${wrong.name}" pare stricat sau nu e ce spune extensia. Scoate-l și adaugă-l din nou.`
		};

	const crc = new Map(results.map((r) => [r.id, r.ok ? r.crc32c : undefined]));
	const files: ManifestFile[] = body.files.map((f, i) => ({
		fileId: f.fileId,
		kind: f.kind,
		group: f.group,
		/* Plans carry no room; a tab still running the old app may send one. */
		roomId: f.kind === 'plan' ? null : (f.roomId as ManifestFile['roomId']),
		originalName: safeFileName(f.name),
		contentType: checks[i].expect,
		size: f.size,
		...(crc.get(f.fileId) ? { crc32c: crc.get(f.fileId) } : {}),
		object: checks[i].object,
		addedAt: f.addedAt
	}));

	const draft = {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		submissionId,
		committedAt: (o.now ?? new Date()).toISOString(),
		appVersion: o.appVersion,
		pageUri: body.pageUri,
		locale: 'ro',
		client: identity(body.answers),
		rooms: Array.isArray(body.answers.c_rooms) ? body.answers.c_rooms : [],
		answers: body.answers,
		drawing: body.drawing
			? { room: body.drawing.room, svg: body.drawing.svg, pngObject: DRAWING_OBJECT, updatedAt: body.drawing.updatedAt }
			: null,
		files
	};
	const parsed = ManifestSchema.safeParse(draft);
	if (!parsed.success)
		return {
			ok: false,
			status: 400,
			reason: 'manifest_invalid',
			error: 'Datele trimise nu sunt complete.',
			issues: parsed.error.issues.slice(0, 20)
		};

	/* A retry after a commit that went through (its answer lost on the way). The precondition on
	   the write below is what keeps two racing commits apart; this check spares the write, and
	   the local emulator does not enforce preconditions. */
	const created =
		!(await bucket.metadata(prefix + MANIFEST_OBJECT)) &&
		(await bucket.createOnly(prefix + MANIFEST_OBJECT, JSON.stringify(parsed.data, null, 2), 'application/json'));

	/* Then tell the worker. Written on a repeat commit too, so a marker lost after the manifest
	   (the write failed, the client retried) is put back; the worker skips a submission that
	   already has its PDF. */
	await bucket.put(pendingMarker(submissionId), '', 'application/octet-stream');
	return { ok: true, alreadyCommitted: !created, manifest: parsed.data };
}
