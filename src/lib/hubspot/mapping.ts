import type { Answers, SubmitRequest } from '$lib/types';

/**
 * Pure mapping from our `SubmitRequest` to the HubSpot v3 form submission body.
 * No SvelteKit imports here — unit-tested in `mapping.test.ts`.
 *
 * Verified (docs/hubspot-forms-v3-auth.txt, legacydocs.hubspot.com, archived 2024):
 *   - body = { submittedAt?, fields: [{ objectTypeId, name, value }], context?, legalConsentOptions? }
 *   - contact `objectTypeId` is "0-1"; `name` must match the contact property name
 *   - context accepts { hutk, ipAddress, pageName, pageUri, pageId }
 *   - `legalConsentOptions` is REQUIRED only if the form was created on a portal with GDPR
 *     functionality enabled and consent notice information was added to the form.
 *
 * NOT VERIFIED — how a form field of type *file* takes its value through this API.
 * See the FILE FIELDS note at the bottom of this file. We therefore do not depend on a
 * file-typed form field: uploaded file URLs go into the multi-line text property
 * `um_plan_files`, one `url | name | room` per line.
 */

export interface HubSpotField {
	objectTypeId: '0-1';
	name: string;
	value: string;
}

export interface HubSpotSubmission {
	submittedAt?: number;
	fields: HubSpotField[];
	context: { pageUri: string; pageName: string; hutk?: string };
	legalConsentOptions?: unknown;
}

export const PAGE_NAME = 'Configurează-ți proiectul';

/** Multi-line values are cut at 65,000 characters with a trailing "…". */
export const MAX_FIELD_CHARS = 65000;

const OBJECT_TYPE_ID = '0-1' as const;

/** Cut to MAX_FIELD_CHARS characters; the last character of an over-long value is "…". */
export function truncate(value: string, max: number = MAX_FIELD_CHARS): string {
	if (value.length <= max) return value;
	return value.slice(0, max - 1) + '…';
}

/**
 * Split a full name on the LAST space: everything before is the first name, the last token
 * is the last name. A single word (or a name with only trailing/leading spaces) yields a
 * first name and no last name.
 */
export function splitName(full: string): { firstname: string; lastname: string } {
	const name = (full ?? '').trim().replace(/\s+/g, ' ');
	if (!name) return { firstname: '', lastname: '' };
	const i = name.lastIndexOf(' ');
	if (i < 0) return { firstname: name, lastname: '' };
	return { firstname: name.slice(0, i), lastname: name.slice(i + 1) };
}

function str(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	return '';
}

function list(v: unknown): string {
	if (!Array.isArray(v)) return '';
	return v
		.map(str)
		.map((s) => s.trim())
		.filter(Boolean)
		.join(';');
}

function record(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** One `url | name | roomId-or-"-"` per line. */
export function planFilesValue(files: SubmitRequest['files']): string {
	return (files ?? [])
		.map((f) => `${str(f?.url)} | ${str(f?.name)} | ${str(f?.roomId) || '-'}`)
		.join('\n');
}

/** One `url | name | roomId-or-"-" | group` per line. */
export function photoFilesValue(photos: SubmitRequest['photos']): string {
	return (photos ?? [])
		.map((f) => `${str(f?.url)} | ${str(f?.name)} | ${str(f?.roomId) || '-'} | ${str(f?.group)}`)
		.join('\n');
}

export function buildSubmission(req: SubmitRequest): HubSpotSubmission {
	const answers: Answers = record(req.answers) as Answers;
	const identity = record(answers.c_identity);
	const household = record(answers.c_household);
	const { firstname, lastname } = splitName(str(identity.name));

	const fields: HubSpotField[] = [];
	const put = (name: string, value: string): void => {
		const v = truncate(value);
		if (v === '') return; // omit fields whose value would be empty
		fields.push({ objectTypeId: OBJECT_TYPE_ID, name, value: v });
	};

	put('firstname', firstname);
	put('lastname', lastname);
	put('email', str(identity.email).trim());

	put('um_rooms', list(answers.c_rooms));
	put('um_stage', str(answers.c_stage));

	put('um_adults', str(household.adults));
	put('um_children', str(household.children));
	put('um_child_ages', list(household.childAges));
	put('um_elderly', str(household.elderly));
	put('um_pets', list(household.pets));

	put('um_readback', str(req.readback));
	put('um_answers_json', JSON.stringify(req.answers ?? {}));
	put('um_plan_files', planFilesValue(req.files));
	put('um_photo_files', photoFilesValue(req.photos));

	if (req.drawing) {
		put('um_plan_drawing_json', JSON.stringify(req.drawing.room ?? null));
		put('um_plan_drawing_png', str(req.drawing.pngUrl));
	}

	put('um_submission_id', str(req.submissionId));

	const context: HubSpotSubmission['context'] = {
		pageUri: str(req.pageUri),
		pageName: PAGE_NAME
	};
	const hutk = str((req as { hutk?: unknown }).hutk).trim();
	if (hutk) context.hutk = hutk;

	// TODO(gdpr): the HubSpot form has no GDPR consent notice configured yet, so we must NOT
	// send `legalConsentOptions` — an unknown/empty value is rejected with
	// INVALID_LEGAL_CONSENT_OPTIONS. Once the notice exists on the form, add, verbatim, the
	// text shown to the visitor in SubmitPanel.svelte:
	//
	//   legalConsentOptions: {
	//     consent: {
	//       consentToProcess: true,
	//       text: 'Sunt de acord ca Urban Moon să prelucreze răspunsurile și planurile trimise pentru pregătirea proiectului meu.',
	//       communications: [
	//         { value: true, subscriptionTypeId: <id from the Email API>, text: '<text shown to the visitor>' }
	//       ]
	//     }
	//   }

	return { fields, context };
}

/*
 * FILE FIELDS — what we could and could not verify (2026-09-08)
 * ------------------------------------------------------------
 * NOT VERIFIED (1): whether a `fields[]` entry can target a file-type form field through the v3
 * submission API, and what shape `value` would take (URL? file id? comma-separated list?).
 * The v3 submission spec defines the field object generically only:
 *   "FormField: type: object properties: objectTypeId: … name: … value: type: string
 *    description: The value for the field"
 *   — https://developers.hubspot.com/docs/api-reference/legacy/marketing/forms/v3-legacy/submit-data-authenticated
 * The inlined OpenAPI spec (specs/legacy/v3/forms-v3-legacy.json) never mentions files, and the
 * `errorType` enum has no file-specific error. The archived legacy submit_form page likewise has
 * zero occurrences of file/upload in the body description.
 *
 * NOT VERIFIED (2): the "upload to the Files API first, then pass the returned url as the field
 * value" flow. The Files API guide documents the upload and the returned `url` —
 *   "Files can be uploaded using a multipart/form-data POST request to files/v3/files"
 *   — https://developers.hubspot.com/docs/api-reference/legacy/files/guide
 * — but never connects it to form submissions; its "attach a file" section covers notes
 * (`hs_attachment_ids`) only. The URL-first flow appears in HubSpot Community posts, not docs.
 *
 * VERIFIED (3): the CRM property type `file`:
 *   "| file | Allows for a file to be uploaded on a record or via a form. Stores a file ID. |"
 *   — https://developers.hubspot.com/docs/api-reference/legacy/crm/properties/guide
 * Retrieval side, in tension with the above:
 *   "For a given file id, return the file associated with that Id. The complete URL required to
 *    fetch the uploaded file can be found in the submitted form metadata, or on an associated
 *    contact record. The name of the property containing this URL will vary depending on the
 *    name given to the file upload."
 *   — https://developers.hubspot.com/docs/api-reference/legacy/marketing/forms/v1/get-form-integrations-v1-uploaded-files-signed-url-redirect-fileId
 *
 * VERIFIED (4), limits: "Each file property can contain up to 10 files." … "When uploaded via a
 * form submission, each file is limited to 100 MB"
 *   — https://knowledge.hubspot.com/properties/property-field-types-in-hubspot
 * and the form definition exposes `allowMultipleFiles` on a `FileField` whose `fieldType` enum
 * is `[file]` — https://developers.hubspot.com/docs/api-reference/legacy/marketing/forms/get-form
 *
 * Consequence, by design: because (1) and (2) are unverified and (3) says a file property
 * "Stores a file ID" (not a URL), we do NOT target a file-typed form field. Files are uploaded
 * with access PUBLIC_NOT_INDEXABLE (Files API v3, verified in CONTRACTS.md) and their URLs are
 * written into the multi-line TEXT property `um_plan_files`, one `url | name | room` per line,
 * which is safe under either answer. If HubSpot later confirms what a file field accepts, add an
 * extra field here — do not remove `um_plan_files`.
 */
