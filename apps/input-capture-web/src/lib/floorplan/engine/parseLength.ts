/**
 * Reading a length the client typed, in whole centimetres, with the metres
 * trap: `2.5` and `2,5` are almost certainly two and a half metres, so they are
 * asked about rather than taken as two centimetres.
 */

const MAX_METRES_SHORTHAND = /^\d{1,2}\.\d{1,2}$/;

export type ParsedLength =
	| { ok: false }
	| { ok: true; needsConfirm: true; cmIfMetres: number; raw: string }
	| { ok: true; needsConfirm: false; cm: number };

export function parseLengthInput(raw: unknown): ParsedLength {
	const s = String(raw).trim().replace(',', '.');
	if (s === '') return { ok: false };
	if (MAX_METRES_SHORTHAND.test(s)) {
		const metres = parseFloat(s);
		return { ok: true, needsConfirm: true, cmIfMetres: Math.round(metres * 100), raw: s };
	}
	const n = parseFloat(s);
	if (!isFinite(n) || n < 0) return { ok: false };
	return { ok: true, needsConfirm: false, cm: Math.round(n) };
}
