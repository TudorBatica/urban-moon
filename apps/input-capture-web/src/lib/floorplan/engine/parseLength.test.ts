import { describe, expect, it } from 'vitest';
import { parseLengthInput } from './parseLength';

describe('parseLengthInput', () => {
	it('asks about metres for a one or two digit number with a decimal part', () => {
		expect(parseLengthInput('2.5')).toEqual({ ok: true, needsConfirm: true, cmIfMetres: 250, raw: '2.5' });
		expect(parseLengthInput('2,5')).toEqual({ ok: true, needsConfirm: true, cmIfMetres: 250, raw: '2.5' });
		expect(parseLengthInput('12.75')).toEqual({
			ok: true,
			needsConfirm: true,
			cmIfMetres: 1275,
			raw: '12.75'
		});
	});

	it('does not ask about a plain centimetre number', () => {
		expect(parseLengthInput('250')).toEqual({ ok: true, needsConfirm: false, cm: 250 });
		expect(parseLengthInput(' 90 ')).toEqual({ ok: true, needsConfirm: false, cm: 90 });
		expect(parseLengthInput(0)).toEqual({ ok: true, needsConfirm: false, cm: 0 });
	});

	it('does not ask where the shape is not the shorthand´s', () => {
		expect(parseLengthInput('250.5')).toEqual({ ok: true, needsConfirm: false, cm: 251 });
		expect(parseLengthInput('2.555')).toEqual({ ok: true, needsConfirm: false, cm: 3 });
	});

	it('refuses nothing at all, and anything negative', () => {
		expect(parseLengthInput('')).toEqual({ ok: false });
		expect(parseLengthInput('   ')).toEqual({ ok: false });
		expect(parseLengthInput('-40')).toEqual({ ok: false });
		expect(parseLengthInput('abc')).toEqual({ ok: false });
	});
});
