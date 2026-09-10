import { describe, expect, it } from 'vitest';
import { ROOMS } from './rooms';
import { buildReadback, readbackText } from './readback';
import { middleCase, neverCooks, threeRooms } from './screens.test';

const kitchen = (a = threeRooms) => buildReadback(a).rooms.find((r) => r.roomId === 'bucatarie')!;

describe('readback — household', () => {
	it('names the people, the pets and the stage', () => {
		expect(buildReadback(threeRooms).household).toEqual([
			'Aici vor locui 2 adulți și un copil (sub 3 ani).',
			'Locuința e nouă și goală, deci totul se poate așeza de la zero.'
		]);
	});

	it('a single adult is spelled out, and pets are appended', () => {
		expect(buildReadback(middleCase).household[0]).toBe(
			'Aici vor locui 2 adulți și o persoană în vârstă, plus o pisică.'
		);
	});
});

describe('readback — bucătărie', () => {
	it('calls the never-cooks kitchen a utility space', () => {
		expect(kitchen(neverCooks).portrait).toContain(
			'Bucătăria asta nu e o problemă de gătit — e un spațiu de utilitate, și așa o vom trata.'
		);
	});

	it('describes a side-by-side fridge and what it means for the plan', () => {
		const k = kitchen(middleCase);
		expect(k.portrait).toContain('Frigiderul e un side-by-side, mai adânc decât blatul.');
		expect(k.means).toContain(
			'Side-by-side-ul e mai adânc decât blatul: primește nișa lui, nu intră în coloană, iar frontul de lângă el se planifică pe adâncimea lui.'
		);
	});

	it('lists the small appliances the house already has', () => {
		expect(kitchen(middleCase).portrait).toContain(
			'Prin casă ai 4 aparate mici: robot de bucătărie, blender, mixer și fierbător. Pot sta într-o coloană închisă, cu cele de zi cu zi la îndemână.'
		);
	});

	it('folds an identical week and weekend into one sentence', () => {
		expect(kitchen().portrait[0]).toBe(
			'Într-o seară obișnuită se gătește, la fel și în weekend.'
		);
	});

	it('spells the two out when the week and the weekend differ', () => {
		expect(kitchen(middleCase).portrait[0]).toBe(
			'Într-o seară obișnuită se încălzește ceva gătit de voi dinainte; în weekend se gătește.'
		);
	});

	it('quotes the three free-text answers with their labels', () => {
		expect(kitchen().quotes).toEqual([
			['Ce vrei să faci diferit', 'prea puțin blat'],
			['Nu poate lipsi', 'o masă mare'],
			['Mobilier păstrat', 'masa și scaunele']
		]);
	});
});

describe('readback — living, dormitor and the generated rooms', () => {
	it('lists what happens in the living room, with the seat count', () => {
		const l = buildReadback(threeRooms).rooms.find((r) => r.roomId === 'living')!;
		expect(l.portrait).toEqual([
			'În living vă uitați la filme, luați masa (6 persoane) și se joacă copiii.',
			'Pe canapea și fotolii trebuie să încapă comod 4 persoane.'
		]);
	});

	it('a generated room repeats what the user wrote', () => {
		const c = buildReadback(threeRooms).rooms.find((r) => r.roomId === 'copil')!;
		expect(c.portrait).toEqual([
			'Ce se întâmplă în camera copilului: pat suprapus, doi copii.'
		]);
	});

	it('a bedroom describes the bed and the extras', () => {
		const a = {
			...threeRooms,
			c_rooms: ['dormitor'],
			d1: 'doi',
			d2: { bed: '180', wants: ['dressing', 'tv'] }
		};
		const d = buildReadback(a).rooms.find((r) => r.roomId === 'dormitor')!;
		expect(d.portrait).toEqual([
			'Dormitorul e pentru voi doi.',
			'Patul are 180 cm lățime.',
			'În afară de pat vrei dressing sau dulap mare și televizor.'
		]);
		expect(d.means[0]).toBe('Patul de 180 cm plus 60–70 cm de trecere pe laturile libere.');
	});
});

describe('readbackText', () => {
	const text = readbackText(threeRooms);

	it('names every picked room', () => {
		for (const r of ROOMS.filter((x) => ['bucatarie', 'living', 'copil'].includes(x.id)))
			expect(text).toContain(r.label);
	});

	it('carries the household lines, the quotes and the means', () => {
		expect(text).toContain('Aici vor locui 2 adulți și un copil (sub 3 ani).');
		expect(text).toContain('Ce vrei să faci diferit: „prea puțin blat”');
		expect(text).toContain('Ce înseamnă asta pentru plan:');
		expect(text).toContain('- Sertare adânci lângă plită, pentru oale mari.');
	});

	it('leaves out the rooms that were not picked', () => {
		expect(text).not.toContain('Dormitor');
	});
});
