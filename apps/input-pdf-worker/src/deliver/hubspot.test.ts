import type { Manifest } from '@urban-moon/domain-data/schema';
import { describe, expect, it } from 'vitest';
import type { DeliveryInput } from './index';
import { DeliveryError, hubspotDeliver, splitName, type HubSpotConfig } from './hubspot';

const SUBMISSION = '40f9a5d8-763d-4603-b471-1fbd1d5938ab';
const PDF = new Uint8Array([37, 80, 68, 70, 45]); // "%PDF-"
const FILE_URL = 'https://api-eu1.hubspot.com/filemanager/api/v2/files/99/signed-url-redirect?portalId=1';

const manifest = { client: { name: 'Ana Maria Popescu', email: 'ana@example.com' } } as Manifest;

interface Call {
	url: string;
	init: RequestInit;
}

interface FakeOptions {
	upload?: () => Response;
	readable?: () => Response;
	submit?: () => Response;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fake(o: FakeOptions = {}) {
	const calls: Call[] = [];
	const impl = (async (input: unknown, init: RequestInit = {}) => {
		const url = String(input);
		calls.push({ url, init });
		if (url.startsWith('https://api.hubapi.com/files/v3/files')) return o.upload?.() ?? json({ id: '99', name: 'intake.pdf', url: FILE_URL });
		if (url === FILE_URL)
			return o.readable?.() ?? new Response(PDF, { status: 200, headers: { 'content-length': String(PDF.byteLength) } });
		if (url.startsWith('https://api.hsforms.com/')) return o.submit?.() ?? json({ inlineMessage: '' });
		return new Response('unexpected', { status: 404 });
	}) as unknown as typeof fetch;
	return { impl, calls, urls: () => calls.map((c) => c.url) };
}

function logs() {
	const lines: { event: string; fields: Record<string, unknown> }[] = [];
	return { lines, log: ((_s, event, fields = {}) => void lines.push({ event, fields })) as DeliveryInput['log'] };
}

function deliver(o: FakeOptions = {}, over: Partial<HubSpotConfig> = {}) {
	const server = fake(o);
	const l = logs();
	const run = hubspotDeliver({
		token: 'pat-test',
		portalId: '146798766',
		formId: 'form-guid',
		folderPath: '/app-input-capture',
		fetchImpl: server.impl,
		sleep: async () => {},
		...over
	});
	return { server, l, run: () => run({ bucket: null as never, submissionId: SUBMISSION, manifest, pdf: PDF, log: l.log }) };
}

describe('splitName', () => {
	it('keeps the first word as the first name and the rest as the last', () => {
		expect(splitName('Ana Maria Popescu')).toEqual({ firstName: 'Ana', lastName: 'Maria Popescu' });
		expect(splitName('  Ana  ')).toEqual({ firstName: 'Ana', lastName: '' });
	});
});

describe('hubspotDeliver', () => {
	it('uploads the PDF, checks it can be read, then submits the form', async () => {
		const { server, l, run } = deliver();
		const record = await run();

		expect(server.urls()).toEqual([
			'https://api.hubapi.com/files/v3/files',
			FILE_URL,
			'https://api.hsforms.com/submissions/v3/integration/secure/submit/146798766/form-guid'
		]);
		expect(record).toEqual({
			hubspot: { fileId: '99', fileName: 'intake.pdf', fileUrl: FILE_URL, formId: 'form-guid', email: 'ana@example.com' }
		});
		expect(l.lines.map((line) => line.event)).toEqual(['hubspot_file_uploaded', 'hubspot_form_submitted']);
	});

	it('names the file after the submission and uploads it unguessable but readable', async () => {
		const { server, run } = deliver();
		await run();
		const body = server.calls[0].init.body as FormData;
		expect(body.get('fileName')).toBe(`intake-${SUBMISSION}.pdf`);
		expect(body.get('folderPath')).toBe('/app-input-capture');
		expect(JSON.parse(String(body.get('options')))).toMatchObject({ access: 'PUBLIC_NOT_INDEXABLE' });
	});

	it('sends the contact fields and the file url to the form', async () => {
		const { server, run } = deliver();
		await run();
		const sent = JSON.parse(String(server.calls[2].init.body));
		expect(sent.fields).toEqual([
			{ objectTypeId: '0-1', name: 'email', value: 'ana@example.com' },
			{ objectTypeId: '0-1', name: 'firstname', value: 'Ana' },
			{ objectTypeId: '0-1', name: 'lastname', value: 'Maria Popescu' },
			{ objectTypeId: '0-1', name: 'app_input_capture', value: FILE_URL }
		]);
		expect(String(server.calls[2].init.headers ? (server.calls[2].init.headers as Record<string, string>).Authorization : '')).toBe(
			'Bearer pat-test'
		);
	});

	it('gives up when the token may not upload', async () => {
		const { server, run } = deliver({ upload: () => json({ message: 'scope missing' }, 403) });
		await expect(run()).rejects.toMatchObject({ code: 'upload_failed' });
		expect(server.urls()).toHaveLength(1);
	});

	it('refuses to submit a file the form could not fetch', async () => {
		/* what a PRIVATE upload does: HubSpot would store its own error page as the client's PDF */
		const { server, run } = deliver({ readable: () => new Response('<html>signed url required</html>', { status: 401 }) });
		await expect(run()).rejects.toMatchObject({ code: 'file_not_readable' });
		expect(server.urls()).toHaveLength(2);
	});

	it('refuses to submit a file that came back the wrong size', async () => {
		const { run } = deliver({
			readable: () => new Response('short', { status: 200, headers: { 'content-length': '5000' } })
		});
		await expect(run()).rejects.toMatchObject({ code: 'file_not_readable' });
	});

	it('reports a form that refused the submission', async () => {
		const { run } = deliver({ submit: () => json({ errors: [{ message: 'unknown field' }] }, 400) });
		const err = await run().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(DeliveryError);
		expect(err).toMatchObject({ code: 'submit_failed', detail: { status: 400, fileId: '99' } });
	});

	it('tries again after a rate limit, and after a 5xx', async () => {
		let uploads = 0;
		const { server, run } = deliver({
			upload: () => (++uploads < 3 ? json({ message: 'slow down' }, 429) : json({ id: '99', name: 'n', url: FILE_URL }))
		});
		await run();
		expect(uploads).toBe(3);
		expect(server.urls()).toHaveLength(5);
	});

	it('stops trying after the last attempt', async () => {
		const { run } = deliver({ upload: () => json({ message: 'boom' }, 503) }, { tries: 2 });
		await expect(run()).rejects.toMatchObject({ code: 'upload_failed', detail: { status: 503 } });
	});
});
