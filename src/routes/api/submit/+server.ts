import { GENERIC_ERROR, submitForm } from '$lib/hubspot/client';
import { buildSubmission } from '$lib/hubspot/mapping';
import type { SubmitRequest } from '$lib/types';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Shape check only — no schema library, per the contract. Returns null when valid. */
function validate(body: unknown): string | null {
	if (!isRecord(body)) return 'Corpul cererii nu este un obiect JSON.';

	if (typeof body.submissionId !== 'string' || !body.submissionId.trim()) {
		return 'submissionId lipsește.';
	}
	if (!isRecord(body.answers)) return 'answers lipsește.';
	if (typeof body.readback !== 'string') return 'readback lipsește.';
	if (typeof body.pageUri !== 'string') return 'pageUri lipsește.';

	if (!Array.isArray(body.files)) return 'files lipsește.';
	for (const f of body.files) {
		if (!isRecord(f)) return 'files conține o intrare invalidă.';
		if (typeof f.url !== 'string' || typeof f.name !== 'string') {
			return 'files conține o intrare invalidă.';
		}
		if (f.roomId !== null && typeof f.roomId !== 'string') {
			return 'files conține o intrare invalidă.';
		}
	}

	const d = body.drawing;
	if (d !== null && d !== undefined) {
		if (!isRecord(d)) return 'drawing este invalid.';
		if (typeof d.jsonUrl !== 'string' || typeof d.pngUrl !== 'string') {
			return 'drawing este invalid.';
		}
		if (!isRecord(d.room)) return 'drawing.room este invalid.';
	}

	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'JSON invalid.' }, { status: 400 });
	}

	const problem = validate(body);
	if (problem) {
		console.error('[api/submit] invalid request:', problem);
		return json({ ok: false, error: 'Datele trimise nu sunt complete.' }, { status: 400 });
	}

	const req = body as unknown as SubmitRequest;
	if (!req.drawing) req.drawing = null;

	const scenario = request.headers.get('X-Mock-Scenario') ?? undefined;
	const result = await submitForm(buildSubmission(req), { scenario });

	if (!result.ok) {
		return json({ ok: false, error: result.error ?? GENERIC_ERROR }, { status: 502 });
	}
	return json({ ok: true, inlineMessage: result.inlineMessage });
};
