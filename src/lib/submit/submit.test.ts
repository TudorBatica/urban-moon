import type { Answers, Drawing, PlanFileMeta, PlansState, RoomSnapshot } from '$lib/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	SUBMISSION_ID_KEY,
	UPLOADED_KEY,
	dataUrlToBlob,
	planSteps,
	runSubmission,
	type SimpleStorage,
	type StepProgress
} from './submit';

/* ---------- fakes ---------- */

function fakeStorage(seed: Record<string, string> = {}): SimpleStorage & {
	data: Record<string, string>;
} {
	const data: Record<string, string> = { ...seed };
	return {
		data,
		getItem: (k) => (k in data ? data[k] : null),
		setItem: (k, v) => {
			data[k] = v;
		},
		removeItem: (k) => {
			delete data[k];
		}
	};
}

interface Call {
	url: string;
	body: unknown;
}

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
	const calls: Call[] = [];
	const impl = vi.fn(async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, body: init?.body });
		return handler(url, init ?? {});
	});
	return { impl: impl as unknown as typeof fetch, calls, mock: impl };
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

let uploadSeq = 0;
function okHandler(url: string): Response {
	if (url === '/api/upload') {
		uploadSeq++;
		return jsonResponse({ ok: true, id: `f${uploadSeq}`, url: `http://mock/${uploadSeq}.bin` });
	}
	if (url === '/api/submit') return jsonResponse({ ok: true, inlineMessage: 'Mulțumim.' });
	return jsonResponse({ ok: false }, 404);
}

const answers: Answers = {
	c_identity: { name: 'Ana Popescu', email: 'ana@example.com' },
	c_rooms: ['bucatarie']
};

function meta(id: string, name: string, roomId: PlanFileMeta['roomId'] = null): PlanFileMeta {
	return { id, name, type: 'application/pdf', size: 10, roomId, addedAt: 1 };
}

const room: RoomSnapshot = {
	unit: 'cm',
	ceilingHeightCm: 260,
	closed: true,
	outline: [],
	walls: [],
	openings: [],
	unanswered: [],
	finished: true
};

const drawing: Drawing = {
	model: null,
	room,
	svg: '<svg/>',
	// "hi" in base64
	pngDataUrl: 'data:image/png;base64,aGk=',
	updatedAt: 1
};

function statePlans(over: Partial<PlansState> = {}): PlansState {
	return { files: [], drawing: null, ...over };
}

const getBlob = async (id: string): Promise<Blob | undefined> =>
	new Blob([`blob-${id}`], { type: 'application/pdf' });

beforeEach(() => {
	uploadSeq = 0;
});

/* ---------- tests ---------- */

describe('dataUrlToBlob', () => {
	it('decodes a base64 data URL and keeps the mime type', async () => {
		const b = dataUrlToBlob('data:image/png;base64,aGk=');
		expect(b.type).toBe('image/png');
		expect(await b.text()).toBe('hi');
	});
});

describe('planSteps', () => {
	it('lists one step per file, two for the drawing, and the submission last', () => {
		expect(planSteps(statePlans({ files: [meta('a', 'plan.pdf')], drawing }))).toEqual([
			'plan.pdf',
			'Planul desenat (imagine)',
			'Planul desenat (date)',
			'Trimit răspunsurile'
		]);
	});
});

describe('runSubmission — happy path', () => {
	it('uploads every file then submits', async () => {
		const f = fakeFetch(okHandler);
		const storage = fakeStorage();
		const progress: StepProgress[] = [];

		const res = await runSubmission({
			answers,
			plans: statePlans({ files: [meta('a', 'plan.pdf', 'bucatarie'), meta('b', 'foto.jpg')] }),
			readback: 'Ce am înțeles.',
			fetchImpl: f.impl,
			getBlob,
			storage,
			pageUri: 'http://localhost:5173/rezumat',
			newId: () => 'uuid-1',
			onProgress: (p) => progress.push(p)
		});

		expect(res).toEqual({ ok: true });
		expect(f.calls.map((c) => c.url)).toEqual(['/api/upload', '/api/upload', '/api/submit']);

		const body = JSON.parse(String(f.calls[2].body));
		expect(body.submissionId).toBe('uuid-1');
		expect(body.pageUri).toBe('http://localhost:5173/rezumat');
		expect(body.files).toEqual([
			{ url: 'http://mock/1.bin', name: 'plan.pdf', roomId: 'bucatarie' },
			{ url: 'http://mock/2.bin', name: 'foto.jpg', roomId: null }
		]);
		expect(body.drawing).toBeNull();
		expect(body.readback).toBe('Ce am înțeles.');

		// the upload FormData carried the email and the room tag
		const first = f.calls[0].body as FormData;
		expect(first.get('email')).toBe('ana@example.com');
		expect(first.get('roomId')).toBe('bucatarie');
		expect((f.calls[1].body as FormData).get('roomId')).toBeNull();

		// progress reported every step, ending in done
		expect(progress.filter((p) => p.state === 'done')).toHaveLength(3);
		expect(progress.every((p) => p.total === 3)).toBe(true);

		// a successful submit clears the attempt state
		expect(storage.data[SUBMISSION_ID_KEY]).toBeUndefined();
		expect(storage.data[UPLOADED_KEY]).toBeUndefined();
	});

	it('adds two uploads for a drawing and sends both urls', async () => {
		const f = fakeFetch(okHandler);
		const res = await runSubmission({
			answers,
			plans: statePlans({ files: [meta('a', 'plan.pdf')], drawing }),
			readback: '',
			fetchImpl: f.impl,
			getBlob,
			storage: fakeStorage(),
			pageUri: 'http://x/',
			newId: () => 'uuid-2'
		});

		expect(res.ok).toBe(true);
		expect(f.calls.map((c) => c.url)).toEqual([
			'/api/upload',
			'/api/upload',
			'/api/upload',
			'/api/submit'
		]);

		const pngForm = f.calls[1].body as FormData;
		const jsonForm = f.calls[2].body as FormData;
		expect((pngForm.get('file') as File).name).toBe('plan-desenat.png');
		expect((jsonForm.get('file') as File).name).toBe('plan-desenat.json');

		const body = JSON.parse(String(f.calls[3].body));
		expect(body.drawing).toEqual({
			pngUrl: 'http://mock/2.bin',
			jsonUrl: 'http://mock/3.bin',
			room
		});
	});
});

describe('runSubmission — failures', () => {
	it('stops at the failing upload and reports the step', async () => {
		const f = fakeFetch((url) => {
			if (url === '/api/upload') {
				uploadSeq++;
				if (uploadSeq === 2) return jsonResponse({ ok: false, error: 'nope' }, 502);
				return jsonResponse({ ok: true, id: 'f1', url: 'http://mock/1.bin' });
			}
			return okHandler(url);
		});
		const progress: StepProgress[] = [];

		const res = await runSubmission({
			answers,
			plans: statePlans({
				files: [meta('a', 'plan.pdf'), meta('b', 'foto.jpg'), meta('c', 'schita.pdf')]
			}),
			readback: '',
			fetchImpl: f.impl,
			getBlob,
			storage: fakeStorage(),
			pageUri: 'http://x/',
			newId: () => 'uuid-3',
			onProgress: (p) => progress.push(p)
		});

		expect(res.ok).toBe(false);
		expect(res.step).toBe('foto.jpg');
		expect(res.error).toContain('foto.jpg');
		// no third upload, no submit
		expect(f.calls.map((c) => c.url)).toEqual(['/api/upload', '/api/upload']);
		expect(progress.some((p) => p.state === 'failed' && p.label === 'foto.jpg')).toBe(true);
	});

	it('reports a failing submission with the server error', async () => {
		const f = fakeFetch((url) => {
			if (url === '/api/upload') return okHandler(url);
			return jsonResponse(
				{ ok: false, error: 'Nu am putut trimite răspunsurile. Încearcă din nou.' },
				502
			);
		});

		const res = await runSubmission({
			answers,
			plans: statePlans(),
			readback: '',
			fetchImpl: f.impl,
			getBlob,
			storage: fakeStorage(),
			pageUri: 'http://x/',
			newId: () => 'uuid-4'
		});

		expect(res.ok).toBe(false);
		expect(res.error).toBe('Nu am putut trimite răspunsurile. Încearcă din nou.');
		expect(res.step).toBe('Trimit răspunsurile');
	});

	it('reports a missing blob without calling the API', async () => {
		const f = fakeFetch(okHandler);
		const res = await runSubmission({
			answers,
			plans: statePlans({ files: [meta('gone', 'lipsa.pdf')] }),
			readback: '',
			fetchImpl: f.impl,
			getBlob: async () => undefined,
			storage: fakeStorage(),
			pageUri: 'http://x/',
			newId: () => 'uuid-5'
		});
		expect(res.ok).toBe(false);
		expect(res.step).toBe('lipsa.pdf');
		expect(f.calls).toHaveLength(0);
	});
});

describe('runSubmission — retry', () => {
	it('keeps the submission id and skips already-uploaded files', async () => {
		const storage = fakeStorage();
		const files = [meta('a', 'plan.pdf'), meta('b', 'foto.jpg')];

		// first attempt: the second upload fails
		const first = fakeFetch((url) => {
			if (url === '/api/upload') {
				uploadSeq++;
				if (uploadSeq === 2) return jsonResponse({ ok: false }, 502);
				return jsonResponse({ ok: true, id: 'f1', url: 'http://mock/1.bin' });
			}
			return okHandler(url);
		});
		const r1 = await runSubmission({
			answers,
			plans: statePlans({ files }),
			readback: '',
			fetchImpl: first.impl,
			getBlob,
			storage,
			pageUri: 'http://x/',
			newId: () => 'uuid-keep'
		});
		expect(r1.ok).toBe(false);
		expect(JSON.parse(storage.data[UPLOADED_KEY]).a.url).toBe('http://mock/1.bin');

		// second attempt: only the failed file is uploaded again
		uploadSeq = 10;
		const progress: StepProgress[] = [];
		const second = fakeFetch(okHandler);
		const r2 = await runSubmission({
			answers,
			plans: statePlans({ files }),
			readback: '',
			fetchImpl: second.impl,
			getBlob,
			storage,
			pageUri: 'http://x/',
			newId: () => 'uuid-other',
			onProgress: (p) => progress.push(p)
		});

		expect(r2).toEqual({ ok: true });
		expect(second.calls.map((c) => c.url)).toEqual(['/api/upload', '/api/submit']);

		const body = JSON.parse(String(second.calls[1].body));
		// the cached url is reused for file "a", the retried one is fresh for "b"
		expect(body.files[0].url).toBe('http://mock/1.bin');
		expect(body.files[1].url).toBe('http://mock/11.bin');
		// the id from the first attempt is reused so HubSpot can dedupe
		expect(body.submissionId).toBe('uuid-keep');
		// the already-done file was reported done without an upload step
		expect(progress.some((p) => p.index === 0 && p.state === 'uploading')).toBe(false);
	});

	it('forwards the mock scenario header when asked', async () => {
		const f = fakeFetch(okHandler);
		await runSubmission({
			answers,
			plans: statePlans(),
			readback: '',
			fetchImpl: f.impl,
			getBlob,
			storage: fakeStorage(),
			pageUri: 'http://x/',
			newId: () => 'uuid-6',
			scenario: 'fail'
		});
		const init = f.mock.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>)['X-Mock-Scenario']).toBe('fail');
	});
});
