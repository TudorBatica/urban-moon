import { json } from '@sveltejs/kit';
import { SubmissionIdSchema } from '@urban-moon/domain-data/schema';
import { CommitRequestSchema, commitSubmission } from '$lib/server/commit';
import { appVersion, bucketFromEnv } from '$lib/server/config';
import { log } from '$lib/server/log';
import type { RequestHandler } from './$types';

const GENERIC = 'Nu am putut trimite răspunsurile. Încearcă din nou.';

export const POST: RequestHandler = async ({ request, params }) => {
	const bucket = bucketFromEnv();
	if (!bucket) {
		log('ERROR', 'storage_not_configured', { route: 'commit' });
		return json({ ok: false, error: GENERIC }, { status: 503 });
	}

	const id = SubmissionIdSchema.safeParse(params.id);
	const body = CommitRequestSchema.safeParse(await request.json().catch(() => null));
	if (!id.success || !body.success) {
		log('WARNING', 'commit_rejected', {
			submissionId: params.id,
			reason: 'invalid_request',
			issues: body.success ? undefined : body.error.issues.slice(0, 10)
		});
		return json({ ok: false, error: 'Datele trimise nu sunt complete.' }, { status: 400 });
	}

	try {
		const res = await commitSubmission({ bucket, submissionId: id.data, body: body.data, appVersion: appVersion() });
		if (!res.ok) {
			log('WARNING', 'commit_rejected', {
				submissionId: id.data,
				reason: res.reason,
				missing: res.missing,
				issues: res.issues
			});
			return json({ ok: false, error: res.error, missing: res.missing }, { status: res.status });
		}
		const m = res.manifest;
		log(res.alreadyCommitted ? 'INFO' : 'NOTICE', res.alreadyCommitted ? 'submission_already_committed' : 'submission_committed', {
			submissionId: m.submissionId,
			files: m.files.length,
			totalBytes: m.files.reduce((s, f) => s + f.size, 0),
			rooms: m.rooms,
			drawing: m.drawing !== null
		});
		return json({ ok: true, submissionId: m.submissionId });
	} catch (err) {
		log('ERROR', 'commit_failed', { submissionId: id.data, error: { message: (err as Error).message } });
		return json({ ok: false, error: GENERIC }, { status: 502 });
	}
};
