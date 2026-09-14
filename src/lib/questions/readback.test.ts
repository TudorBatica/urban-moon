import { describe, expect, it } from 'vitest';
import type { Answers, PhotoMeta } from '$lib/types';
import { answerSections, readbackText, type Uploads } from './readback';
import { middleCase, threeRooms } from './screens.test';

const photo = (group: PhotoMeta['group'], roomId: PhotoMeta['roomId']): PhotoMeta => ({
	id: `${group}-${roomId}`,
	name: 'poza.jpg',
	type: 'image/jpeg',
	size: 1,
	roomId,
	addedAt: 1,
	group
});

const up: Uploads = {
	plans: { files: [{ id: 'f', name: 'plan.pdf', type: 'application/pdf', size: 1, roomId: null, addedAt: 1 }], drawing: null },
	photos: [photo('spatiu', null), photo('spatiu', null), photo('mobilier', 'bucatarie')]
};

/** The answer lines of one question, found by its link. */
const answerOf = (a: Answers, screenId: string, u: Uploads = up): string[] =>
	answerSections(a, u)
		.flatMap((s) => s.rows)
		.find((r) => r.href === `/?s=${screenId}`)!.answer;

describe('answer list — sections', () => {
	it('groups the questions by chapter, the picked rooms in ROOMS order', () => {
		expect(answerSections(threeRooms, up).map((s) => [s.id, s.label])).toEqual([
			['despre_tine', 'Despre tine'],
			['planuri', 'Planuri'],
			['locuinta', 'Locuința'],
			['bucatarie', 'Bucătărie'],
			['living', 'Living'],
			['baie', 'Baie']
		]);
	});

	it('skips the room intro cards and links every question back to its screen', () => {
		const rows = answerSections(threeRooms, up).flatMap((s) => s.rows);
		expect(rows.some((r) => r.href.includes('card'))).toBe(false);
		expect(rows.find((r) => r.href === '/?s=k1')?.question).toBe(
			'Cum arată o cină obișnuită la tine acasă, într-o zi din săptămână?'
		);
	});

	it('the plans chapter lists the modify question, the measuring, the plan and the space photos', () => {
		const plans = answerSections({ ...threeRooms, p_measured: true }, up).find((s) => s.id === 'planuri')!;
		expect(plans.rows.map((r) => [r.href, r.answer])).toEqual([
			['/?s=p_modify', ['Pot modifica pereții, Pot modifica prize / scurgeri']],
			['/planuri', ['Da, am măsurat spațiul']],
			['/planuri', ['plan.pdf']],
			['/planuri', ['2 poze']]
		]);
	});
});

describe('answer list — each kind of question', () => {
	it('compound: one line per field, with its label', () => {
		expect(answerOf(threeRooms, 'c_identity')).toEqual([
			'Prenume și nume: Ana Popescu',
			'Email-ul cu care ai făcut plata: ana@exemplu.ro'
		]);
		expect(answerOf(threeRooms, 'c_household')).toEqual([
			'Adulți: 2',
			'Copii: 1',
			'Ce vârste au copiii: Sub 3 ani',
			'Persoane în vârstă: Nu',
			'Animale de companie: Nu'
		]);
	});

	it('an "Altceva" carries the text the user typed', () => {
		expect(answerOf(middleCase, 'c_household')).toContain('Animale de companie: Pisică, Altceva: papagal');
		expect(answerOf(middleCase, 'k6a')).toEqual(['Blender, Mixer, Fierbător, Alți roboți: Thermomix']);
		expect(answerOf(threeRooms, 'x1_baie')).toEqual(['Cadă, Altceva: uscător mic']);
	});

	it('single: the option, with its follow-up', () => {
		expect(answerOf(threeRooms, 'k7')).toEqual(['Espressor (Cât de des folosești aparatul: Zilnic)']);
		expect(answerOf(threeRooms, 'k10')).toEqual([
			'Da, mesele de zi cu zi (Câte persoane trebuie să încapă la masă: 4)'
		]);
		expect(answerOf(middleCase, 'k7')).toEqual(['La ibric / moka / french press etc.']);
	});

	it('multi: the options on one line, without the leading ellipsis', () => {
		expect(answerOf(threeRooms, 'k3b')).toEqual([
			'stăm la povești în timp ce se gătește, ne strângem cu prietenii din când în când'
		]);
		expect(answerOf(threeRooms, 'l1')).toEqual([
			'Mă uit la TV sau la filme, Luăm masa aici (Câte persoane trebuie să încapă: 6), Se joacă copiii'
		]);
	});

	it('cards: each chosen appliance, with its options', () => {
		const rows = answerSections(threeRooms, up).flatMap((s) => s.rows);
		const frig = rows.find((r) => r.href === '/?s=k5_frig')!;
		expect(frig.question).toBe('Ce electrocasnice mari o să aibă bucătăria? — Refrigerare');
		expect(frig.answer).toEqual(['Frigider: Combină', 'Congelator separat']);
		expect(answerOf(threeRooms, 'k5_gatit')).toEqual(['Aragaz: Gaz, De la rețea']);
		expect(answerOf(middleCase, 'k5_plasare')).toEqual(['Cuptor: Nu știu']);
	});

	it('text: the labelled fields that were filled in', () => {
		expect(answerOf(threeRooms, 'l3')).toEqual(['Problema: masa nu încape', 'Nu poate lipsi: un colțar']);
		expect(answerOf(threeRooms, 'k11')).toEqual(['prea puțin blat']);
	});

	it('furniture: each object with its size, and the photos of that room', () => {
		expect(answerOf(threeRooms, 'k13')).toEqual(['masa — 140 × 80 cm', 'Imagini: o poză']);
		expect(answerOf(threeRooms, 'l4')).toEqual([]);
		expect(
			answerOf({ ...threeRooms, l4: { items: [{ name: 'canapea', length: '240', width: '' }] } }, 'l4')
		).toEqual(['canapea — 240 × ? cm']);
	});
});

describe('readbackText', () => {
	const text = readbackText(threeRooms, up);

	it('writes each chapter, question and answer on its own line', () => {
		expect(text).toContain('BUCĂTĂRIE\nCum arată o cină obișnuită la tine acasă, într-o zi din săptămână?\n- Gătim');
		expect(text).toContain('- masa — 140 × 80 cm');
	});

	it('marks the skipped questions, and leaves out the rooms that were not picked', () => {
		expect(text).toContain('Ai deja mobilier pe care vrei să îl păstrezi în living?\n- fără răspuns');
		expect(text).not.toContain('DORMITOR');
	});
});
