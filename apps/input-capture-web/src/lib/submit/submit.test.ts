import type { Answers, Drawing, PhotoMeta, PlanFileMeta, PlansState, RoomSnapshot } from '$lib/types';
import { describe, expect, it } from 'vitest';
import {
	COMMIT_LABEL,
	SUBMISSION_ID_KEY,
	UPLOADS_KEY,
	dataUrlToBlob,
	planSteps,
	runSubmission,
	type SimpleStorage,
	type StepProgress
} from './submit';

/* ---------- fakes ---------- */

function fakeStorage(seed: Record<string, string> = {}): SimpleStorage & { data: Record<string, string> } {
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

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface ServerOptions {
	start?: (body: Record<string, unknown>) => Response | undefined;
	commit?: (body: Record<string, unknown>) => Response;
	/** session status for PUTs, by file id */
	put?: (fileId: string) => Response | undefined;
}

/* The app server and the bucket sessions, both behind one fetch. */
function fakeServer(o: ServerOptions = {}) {
	const starts: Record<string, unknown>[] = [];
	const puts: string[] = [];
	const commits: { url: string; body: Record<string, unknown> }[] = [];
	const impl = (async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		if (url === '/api/uploads/start') {
			const body = JSON.parse(String(init?.body));
			starts.push(body);
			return o.start?.(body) ?? json({ ok: true, sessionUri: `http://gcs/session/${body.fileId}`, object: 'x' });
		}
		if (url.startsWith('http://gcs/session/')) {
			const fileId = url.slice('http://gcs/session/'.length);
			puts.push(fileId);
			return o.put?.(fileId) ?? new Response('{}', { status: 200 });
		}
		if (/^\/api\/submissions\/[^/]+\/commit$/.test(url)) {
			const body = JSON.parse(String(init?.body));
			commits.push({ url, body });
			return o.commit?.(body) ?? json({ ok: true });
		}
		return json({ ok: false }, 404);
	}) as unknown as typeof fetch;
	return { impl, starts, puts, commits };
}

const answers: Answers = {
	c_identity: { name: 'Ana Popescu', email: 'ana@example.com' },
	c_rooms: ['bucatarie']
};

function meta(id: string, name: string): PlanFileMeta {
	return { id, name, type: 'application/pdf', size: 7, addedAt: 1 };
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

// "hi" in base64
const drawing: Drawing = { model: null, room, svg: '<svg/>', pngDataUrl: 'data:image/png;base64,aGk=', updatedAt: 5 };

const photo: PhotoMeta = {
	id: 'p1',
	name: 'colt.jpg',
	type: 'image/jpeg',
	size: 3,
	roomId: 'bucatarie',
	addedAt: 2,
	group: 'mobilier'
};

const statePlans = (over: Partial<PlansState> = {}): PlansState => ({ files: [], drawing: null, ...over });
const getBlob = async (id: string) => new Blob([`blob-${id}`], { type: 'application/pdf' });
const getPhotoBlob = async () => new Blob(['abc'], { type: 'image/jpeg' });

function run(server: ReturnType<typeof fakeServer>, over: Partial<Parameters<typeof runSubmission>[0]> = {}) {
	return runSubmission({
		answers,
		plans: statePlans(),
		getBlob,
		getPhotoBlob,
		fetchImpl: server.impl,
		storage: fakeStorage(),
		pageUri: 'http://localhost:5173/rezumat',
		newId: () => 'uuid-1',
		sleep: async () => {},
		...over
	});
}

/* ---------- tests ---------- */

describe('dataUrlToBlob', () => {
	it('decodes a base64 data URL and keeps the mime type', async () => {
		const b = dataUrlToBlob('data:image/png;base64,aGk=');
		expect(b.type).toBe('image/png');
		expect(await b.text()).toBe('hi');
	});
});

describe('planSteps', () => {
	it('lists the files, the drawing, the photos, then the commit', () => {
		expect(planSteps(statePlans({ files: [meta('a', 'plan.pdf')], drawing }), [photo])).toEqual([
			'plan.pdf',
			'Planul desenat',
			'colt.jpg',
			COMMIT_LABEL
		]);
	});
});

describe('runSubmission — happy path', () => {
	it('opens a session per file, sends the bytes to the bucket, then commits', async () => {
		const server = fakeServer();
		const storage = fakeStorage();
		const progress: StepProgress[] = [];

		const res = await run(server, {
			plans: statePlans({ files: [meta('a', 'plan.pdf')], drawing }),
			photos: [photo],
			storage,
			onProgress: (p) => progress.push(p)
		});

		expect(res).toEqual({ ok: true });
		expect(server.starts).toEqual([
			{ submissionId: 'uuid-1', fileId: 'a', kind: 'plan', name: 'plan.pdf', type: 'application/pdf', size: 7 },
			{ submissionId: 'uuid-1', fileId: 'drawing', kind: 'drawing', name: 'plan-desenat.png', type: 'image/png', size: 2 },
			{ submissionId: 'uuid-1', fileId: 'p1', kind: 'photo', name: 'colt.jpg', type: 'image/jpeg', size: 3 }
		]);
		expect(server.puts.sort()).toEqual(['a', 'drawing', 'p1']);

		expect(server.commits).toHaveLength(1);
		expect(server.commits[0].url).toBe('/api/submissions/uuid-1/commit');
		expect(server.commits[0].body).toEqual({
			pageUri: 'http://localhost:5173/rezumat',
			answers,
			drawing: { room, svg: '<svg/>', updatedAt: 5 },
			files: [
				{ fileId: 'a', kind: 'plan', group: null, roomId: null, name: 'plan.pdf', type: 'application/pdf', size: 7, addedAt: 1 },
				{ fileId: 'p1', kind: 'photo', group: 'mobilier', roomId: 'bucatarie', name: 'colt.jpg', type: 'image/jpeg', size: 3, addedAt: 2 }
			]
		});

		const last = new Map(progress.map((p) => [p.index, p.state]));
		expect([...last.values()]).toEqual(['done', 'done', 'done', 'done']);
		expect(storage.data[SUBMISSION_ID_KEY]).toBeUndefined();
		expect(storage.data[UPLOADS_KEY]).toBeUndefined();
	});

	it('leaves out furniture photos of a room that is no longer picked', async () => {
		const server = fakeServer();
		const stale: PhotoMeta = { ...photo, id: 'p2', name: 'dulap.jpg', roomId: 'dormitor' };
		const res = await run(server, { plans: statePlans({ files: [meta('a', 'plan.pdf')] }), photos: [photo, stale] });
		expect(res).toEqual({ ok: true });
		expect(server.puts.sort()).toEqual(['a', 'p1']);
		const { files } = server.commits[0].body as { files: { fileId: string }[] };
		expect(files.map((f) => f.fileId)).toEqual(['a', 'p1']);
	});
});

describe('runSubmission — failures', () => {
	it("shows the server's reason when it refuses a file, and does not commit", async () => {
		const server = fakeServer({
			start: () => json({ ok: false, error: 'Fișierul „plan.pdf" depășește 100 MB.' }, 400)
		});
		const res = await run(server, { plans: statePlans({ files: [meta('a', 'plan.pdf')] }) });
		expect(res).toEqual({ ok: false, error: 'Fișierul „plan.pdf" depășește 100 MB.', step: 'plan.pdf' });
		expect(server.commits).toHaveLength(0);
	});

	it('reports a file gone from the browser without calling the server', async () => {
		const server = fakeServer();
		const res = await run(server, { plans: statePlans({ files: [meta('gone', 'lipsa.pdf')] }), getBlob: async () => undefined });
		expect(res).toMatchObject({ ok: false, step: 'lipsa.pdf' });
		expect(server.starts).toHaveLength(0);
	});

	it('opens a new session once when the first one is gone', async () => {
		let first = true;
		const server = fakeServer({
			put: () => {
				if (!first) return undefined;
				first = false;
				return new Response(null, { status: 404 });
			}
		});
		const res = await run(server, { plans: statePlans({ files: [meta('a', 'plan.pdf')] }) });
		expect(res.ok).toBe(true);
		expect(server.starts).toHaveLength(2);
	});

	it('reports a failed commit with its step and message', async () => {
		const server = fakeServer({ commit: () => json({ ok: false, error: 'Datele trimise nu sunt complete.' }, 400) });
		const res = await run(server, { plans: statePlans({ drawing }) });
		expect(res).toEqual({ ok: false, error: 'Datele trimise nu sunt complete.', step: COMMIT_LABEL });
	});
});

describe('runSubmission — retry', () => {
	it('keeps the submission id and does not send finished uploads again', async () => {
		const storage = fakeStorage();
		const files = [meta('a', 'plan.pdf'), meta('b', 'schita.pdf')];

		const first = fakeServer({ start: (b) => (b.fileId === 'b' ? json({ ok: false }, 502) : undefined) });
		const r1 = await run(first, { plans: statePlans({ files }), storage, newId: () => 'uuid-keep' });
		expect(r1.ok).toBe(false);

		const second = fakeServer();
		const r2 = await run(second, { plans: statePlans({ files }), storage, newId: () => 'uuid-other' });
		expect(r2).toEqual({ ok: true });
		expect(second.starts.map((s) => s.fileId)).toEqual(['b']);
		expect(second.commits[0].url).toBe('/api/submissions/uuid-keep/commit');
	});

	it('sends again the files the commit did not find', async () => {
		const storage = fakeStorage();
		const files = [meta('a', 'plan.pdf'), meta('b', 'schita.pdf')];

		const first = fakeServer({ commit: () => json({ ok: false, error: 'Unele fișiere nu au ajuns complet.', missing: ['b'] }, 409) });
		expect((await run(first, { plans: statePlans({ files }), storage })).ok).toBe(false);

		const second = fakeServer();
		expect((await run(second, { plans: statePlans({ files }), storage })).ok).toBe(true);
		expect(second.starts.map((s) => s.fileId)).toEqual(['b']);
	});

	it('sends a redrawn plan again', async () => {
		const storage = fakeStorage();
		await run(fakeServer({ commit: () => json({ ok: false }, 502) }), { plans: statePlans({ drawing }), storage });
		const second = fakeServer();
		await run(second, { plans: statePlans({ drawing: { ...drawing, updatedAt: 6 } }), storage });
		expect(second.starts.map((s) => s.fileId)).toEqual(['drawing']);
	});
});
