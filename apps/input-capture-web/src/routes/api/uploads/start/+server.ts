import { json } from '@sveltejs/kit';
import { bucketFromEnv } from '$lib/server/config';
import { log } from '$lib/server/log';
import { UploadStartSchema, startUpload } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

const GENERIC = 'Nu am putut începe trimiterea fișierului. Încearcă din nou.';

export const POST: RequestHandler = async ({ request, url }) => {
	const bucket = bucketFromEnv();
	if (!bucket) {
		log('ERROR', 'storage_not_configured', { route: 'uploads/start' });
		return json({ ok: false, error: GENERIC }, { status: 503 });
	}

	const parsed = UploadStartSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		log('WARNING', 'upload_start_rejected', { reason: 'invalid_request', issues: parsed.error.issues.slice(0, 10) });
		return json({ ok: false, error: GENERIC }, { status: 400 });
	}
	const req = parsed.data;
	const ids = { submissionId: req.submissionId, fileId: req.fileId, kind: req.kind, size: req.size };

	try {
		const res = await startUpload(bucket, req, request.headers.get('origin') ?? url.origin);
		if (!res.ok) {
			log('WARNING', 'upload_start_rejected', { ...ids, reason: res.reason });
			return json({ ok: false, error: res.error }, { status: 400 });
		}
		log('INFO', 'upload_session_created', { ...ids, contentType: res.contentType });
		return json({ ok: true, sessionUri: res.sessionUri, object: res.object });
	} catch (err) {
		log('ERROR', 'upload_start_failed', { ...ids, error: { message: (err as Error).message } });
		return json({ ok: false, error: GENERIC }, { status: 502 });
	}
};
