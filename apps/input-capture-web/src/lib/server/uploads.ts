import { z } from 'zod';
import { MAX_IMAGE_BYTES, acceptedTypeOf, maxBytesFor, type AcceptedContentType } from '@urban-moon/domain-data';
import { SubmissionIdSchema } from '@urban-moon/domain-data/schema';
import type { Bucket } from './bucket';
import { DRAWING_OBJECT, fileObject, submissionPrefix } from './objects';

/* POST /api/uploads/start: checks what the browser wants to upload, fixes the object name and
   type, and opens a resumable session the browser then sends the bytes to directly. */

export const UploadStartSchema = z.object({
	submissionId: SubmissionIdSchema,
	fileId: z.string().regex(/^[A-Za-z0-9-]{1,80}$/),
	kind: z.enum(['plan', 'photo', 'drawing']),
	name: z.string().min(1).max(500),
	type: z.string().max(200),
	size: z.number().int().positive()
});

export type UploadStart = z.infer<typeof UploadStartSchema>;

export type UploadTarget =
	| { ok: true; object: string; contentType: AcceptedContentType }
	| { ok: false; error: string; reason: string };

const reject = (reason: string, error: string): UploadTarget => ({ ok: false, reason, error });

/** The object and content type for an upload, or why it is refused. */
export function uploadTarget(req: UploadStart): UploadTarget {
	if (req.kind === 'drawing') {
		if (req.fileId !== 'drawing') return reject('drawing_id', 'Planul desenat nu a putut fi trimis.');
		if (req.size > MAX_IMAGE_BYTES) return reject('too_big', 'Planul desenat e prea mare.');
		return { ok: true, object: DRAWING_OBJECT, contentType: 'image/png' };
	}
	if (req.fileId === 'drawing') return reject('reserved_id', 'Fișierul nu a putut fi trimis.');

	const type = acceptedTypeOf(req.name, req.type);
	if (!type || (req.kind === 'photo' && type === 'application/pdf'))
		return reject('type', `Fișierul „${req.name}" nu este ${req.kind === 'photo' ? 'JPG sau PNG' : 'PDF, JPG sau PNG'}.`);
	if (req.size > maxBytesFor(type))
		return reject('too_big', `Fișierul „${req.name}" depășește ${maxBytesFor(type) / 1024 / 1024} MB.`);
	return { ok: true, object: fileObject(req.fileId, type), contentType: type };
}

export async function startUpload(
	bucket: Bucket,
	req: UploadStart,
	origin: string | undefined
): Promise<UploadTarget & { sessionUri?: string }> {
	const target = uploadTarget(req);
	if (!target.ok) return target;
	const sessionUri = await bucket.startResumableUpload({
		object: submissionPrefix(req.submissionId) + target.object,
		contentType: target.contentType,
		size: req.size,
		origin
	});
	return { ...target, sessionUri };
}
