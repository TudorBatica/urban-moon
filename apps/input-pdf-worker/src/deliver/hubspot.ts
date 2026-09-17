/* Delivery to HubSpot. Three calls, in order:

     1. upload the PDF to the Files API, PUBLIC_NOT_INDEXABLE, under one folder
     2. fetch that URL with no credentials — HubSpot's form fetches it the same way, and stores
        whatever comes back without checking it, so a file it cannot read becomes an HTML error
        page saved as a PDF on the contact. This is the only place that failure is catchable.
     3. submit the form: HubSpot creates the contact if the email is new, copies the file into its
        own private storage and points the contact's file property at its copy.

   The uploaded source stays in the folder; HubSpot's copy is what the contact shows. */

import type { Manifest } from '@urban-moon/domain-data/schema';
import type { Deliver, DeliveryInput, DeliveryRecord } from './index';
import { deliveryFileName } from './index';

const FILES_API = 'https://api.hubapi.com/files/v3/files';
const FORMS_API = 'https://api.hsforms.com/submissions/v3/integration/secure/submit';

/** Uploaded so the form's fetch can read it, and unguessable; HubSpot's own copy is private. */
const UPLOAD_OPTIONS = {
	access: 'PUBLIC_NOT_INDEXABLE',
	overwrite: false,
	duplicateValidationStrategy: 'NONE',
	duplicateValidationScope: 'ENTIRE_PORTAL'
} as const;

export interface HubSpotConfig {
	token: string;
	portalId: string;
	formId: string;
	/** where the uploaded PDFs live in the File Manager */
	folderPath: string;
	fetchImpl?: typeof fetch;
	/** attempts per call, including the first; only 429 and 5xx are tried again */
	tries?: number;
	sleep?: (ms: number) => Promise<void>;
}

/** A step of the delivery that did not work. `code` names the step, for the log and failed/<id>. */
export class DeliveryError extends Error {
	constructor(
		readonly code: 'upload_failed' | 'file_not_readable' | 'submit_failed',
		message: string,
		readonly detail?: Record<string, unknown>
	) {
		super(message);
		this.name = 'DeliveryError';
	}
}

/** "Ana Maria Popescu" → first name and the rest; HubSpot keeps them apart. */
export function splitName(full: string): { firstName: string; lastName: string } {
	const parts = full.trim().split(/\s+/);
	return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

export function hubspotDeliver(config: HubSpotConfig): Deliver {
	return async (input) => deliverToHubSpot(config, input);
}

async function deliverToHubSpot(config: HubSpotConfig, { submissionId, manifest, pdf, log }: DeliveryInput): Promise<DeliveryRecord> {
	const fetchImpl = config.fetchImpl ?? fetch;
	const fileName = deliveryFileName(submissionId);

	/* 1. upload */
	const body = new FormData();
	body.set('file', new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), fileName);
	body.set('fileName', fileName);
	body.set('folderPath', config.folderPath);
	body.set('options', JSON.stringify(UPLOAD_OPTIONS));

	const upload = await send(config, fetchImpl, FILES_API, {
		method: 'POST',
		headers: { Authorization: `Bearer ${config.token}` },
		body
	});
	if (!upload.ok) throw new DeliveryError('upload_failed', `the Files API answered ${upload.status}`, { status: upload.status, body: upload.text });
	const file = upload.json as { id?: string; name?: string; url?: string } | null;
	if (!file?.id || !file.url) throw new DeliveryError('upload_failed', 'the Files API returned no file url', { body: upload.text });
	log('INFO', 'hubspot_file_uploaded', { submissionId, fileId: file.id, name: file.name, bytes: pdf.byteLength });

	/* 2. the form's fetch, ahead of the form */
	const readable = await fetchImpl(file.url, { method: 'GET', redirect: 'follow' });
	const length = Number(readable.headers.get('content-length') ?? '0');
	if (!readable.ok || (length > 0 && length !== pdf.byteLength))
		throw new DeliveryError('file_not_readable', `the uploaded file is not readable: ${readable.status}`, {
			status: readable.status,
			expectedBytes: pdf.byteLength,
			gotBytes: length || null,
			fileId: file.id
		});

	/* 3. the form */
	const { firstName, lastName } = splitName(manifest.client.name);
	const submitted = await send(config, fetchImpl, `${FORMS_API}/${config.portalId}/${config.formId}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ fields: formFields(manifest, firstName, lastName, file.url) })
	});
	if (!submitted.ok)
		throw new DeliveryError('submit_failed', `the form answered ${submitted.status}`, {
			status: submitted.status,
			body: submitted.text,
			fileId: file.id
		});

	log('NOTICE', 'hubspot_form_submitted', { submissionId, fileId: file.id, email: manifest.client.email });
	return { hubspot: { fileId: file.id, fileName: file.name ?? fileName, fileUrl: file.url, formId: config.formId, email: manifest.client.email } };
}

function formFields(manifest: Manifest, firstName: string, lastName: string, fileUrl: string): { objectTypeId: string; name: string; value: string }[] {
	const contact = (name: string, value: string) => ({ objectTypeId: '0-1', name, value });
	return [
		contact('email', manifest.client.email),
		contact('firstname', firstName),
		contact('lastname', lastName),
		contact('app_input_capture', fileUrl)
	];
}

interface Sent {
	ok: boolean;
	status: number;
	text: string;
	json: unknown;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One call, tried again after a 429, a 5xx or a dropped connection: HubSpot rate-limits per portal. */
async function send(config: HubSpotConfig, fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Sent> {
	const { tries = 3, sleep = realSleep } = config;
	let last: Sent | undefined;
	for (let attempt = 1; attempt <= tries; attempt++) {
		try {
			const res = await fetchImpl(url, init);
			const text = await res.text();
			let json: unknown = null;
			try {
				json = text ? JSON.parse(text) : null;
			} catch {
				/* an error page, or an empty body */
			}
			last = { ok: res.ok, status: res.status, text: text.slice(0, 500), json };
		} catch (err) {
			last = { ok: false, status: 0, text: err instanceof Error ? err.message : String(err), json: null };
		}
		if (last.ok || (last.status !== 0 && last.status !== 429 && last.status < 500)) return last;
		if (attempt < tries) await sleep(500 * 4 ** (attempt - 1));
	}
	return last as Sent;
}
