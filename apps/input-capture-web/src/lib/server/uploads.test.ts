import { describe, expect, it } from 'vitest';
import { uploadTarget, type UploadStart } from './uploads';

const req = (over: Partial<UploadStart>): UploadStart => ({
	submissionId: 'uuid-0000-1111',
	fileId: 'f1',
	kind: 'plan',
	name: 'plan.pdf',
	type: 'application/pdf',
	size: 1000,
	...over
});

describe('uploadTarget', () => {
	it('names the object after the file id and the accepted type, never the client name', () => {
		expect(uploadTarget(req({ name: '../../evil.PDF', type: '' }))).toEqual({
			ok: true,
			object: 'uploads/f1.pdf',
			contentType: 'application/pdf'
		});
		expect(uploadTarget(req({ kind: 'photo', name: 'a.jpeg', type: 'image/jpeg' }))).toMatchObject({
			object: 'uploads/f1.jpg'
		});
	});

	it('refuses other types, PDFs as photos, and files over the limit', () => {
		expect(uploadTarget(req({ name: 'a.heic', type: 'image/heic' }))).toMatchObject({ ok: false, reason: 'type' });
		expect(uploadTarget(req({ kind: 'photo' }))).toMatchObject({ ok: false, reason: 'type' });
		expect(uploadTarget(req({ kind: 'photo', name: 'a.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 }))).toMatchObject({
			ok: false,
			reason: 'too_big'
		});
		expect(uploadTarget(req({ size: 25 * 1024 * 1024 }))).toMatchObject({ ok: true });
		expect(uploadTarget(req({ size: 25 * 1024 * 1024 + 1 }))).toMatchObject({
			ok: false,
			reason: 'too_big',
			error: 'Fișierul „plan.pdf" depășește 25 MB.'
		});
	});

	it('keeps the drawing in its fixed place', () => {
		expect(uploadTarget(req({ kind: 'drawing', fileId: 'drawing', type: 'image/png' }))).toEqual({
			ok: true,
			object: 'uploads/drawing.png',
			contentType: 'image/png'
		});
		expect(uploadTarget(req({ fileId: 'drawing' }))).toMatchObject({ ok: false });
	});
});
