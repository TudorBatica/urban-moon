import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, acceptedTypeOf, maxBytesFor, maxPlanFiles, sniffContentType } from './limits';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('sniffContentType', () => {
	it('reads JPEG, PNG and PDF from their first bytes', () => {
		expect(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
		expect(sniffContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
		expect(sniffContentType(new TextEncoder().encode('%PDF-1.7\n'))).toBe('application/pdf');
	});

	it('refuses anything else, whatever its name', () => {
		expect(sniffContentType(new TextEncoder().encode('RIFF....WEBP'))).toBeNull();
		expect(sniffContentType(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70))).toBeNull(); // HEIC
		expect(sniffContentType(bytes())).toBeNull();
	});
});

describe('acceptedTypeOf', () => {
	it('goes by mime type, then by extension', () => {
		expect(acceptedTypeOf('x', 'image/jpg')).toBe('image/jpeg');
		expect(acceptedTypeOf('plan.PDF', '')).toBe('application/pdf');
		expect(acceptedTypeOf('poza.heic', 'image/heic')).toBeNull();
		expect(acceptedTypeOf('plan.dwg', '')).toBeNull();
	});
});

describe('limits', () => {
	it('allows 10 MB images and 100 MB PDFs', () => {
		expect(maxBytesFor('image/jpeg')).toBe(MAX_IMAGE_BYTES);
		expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
		expect(maxBytesFor('application/pdf')).toBe(MAX_PDF_BYTES);
		expect(MAX_PDF_BYTES).toBe(100 * 1024 * 1024);
	});

	it('gives two plan files per room, never fewer than two', () => {
		expect(maxPlanFiles(0)).toBe(2);
		expect(maxPlanFiles(3)).toBe(6);
	});
});
