import { describe, expect, it } from 'vitest';
import type { Answers } from '$lib/types';
import { resolveCards, resolveGroups, resolveOptions, visibleScreens } from './screens';
import { activeFollowUp, chapterQuestionCount, chromeFor, continueState } from '$lib/flow/engine';
import { S, screenById } from './screens';
import { ROOMS } from './rooms';

const ids = (a: Answers): string[] => visibleScreens(a).map((s) => s.id);

const common = {
	c_identity: { name: 'Ana Popescu', email: 'ana@exemplu.ro' },
	c_stage: 'renovez',
	c_household: { adults: 2, children: 1, childAges: ['sub3'], elderly: 'nu', pets: ['nu'] }
};

/** 1 — three rooms, keen cook. */
export const threeRooms: Answers = {
	...common,
	c_rooms: ['bucatarie', 'living', 'baie'],
	p_modify: ['pereti', 'instalatii'],
	k1: 'gatim',
	k2: 'gatim',
	k3: 'doi',
	k4: ['lent', 'copt', 'rapide'],
	k3b: ['povesti', 'prieteni'],
	k5_frig: { fridge: true, fridgeType: 'combina', freezer: true },
	k5_gatit: { cook: 'aragaz', aragazPower: 'gaz', gasSource: 'retea' },
	k5_spalat: { dish: true },
	k6a: ['blender', 'mixer', 'fierbator'],
	k7: 'espressor',
	k7_freq: 'zilnic',
	k8: ['debara'],
	k9: 'doua_trei',
	k10: 'zilnic',
	k10_seats: 4,
	k11: { text: 'prea puțin blat' },
	k12: { text: 'o masă mare' },
	k13: { items: [{ name: 'masa', length: '140', width: '80' }] },
	l1: ['tv', 'masa', 'copii'],
	l1_seats: 6,
	l2: { seats: 4 },
	l3: { problem: 'masa nu încape', must: 'un colțar' },
	l4: { items: [] },
	x1_baie: ['cada', 'altceva'],
	x1_baie_other: 'uscător mic',
	x2_baie: { problem: 'nu încape cada', must: 'bideu' }
};

/** 2 — kitchen only, never cooks: k3, k4 and k3b prune away. */
export const neverCooks: Answers = {
	...common,
	c_household: { adults: 1, children: 0, elderly: 'nu', pets: ['nu'] },
	c_rooms: ['bucatarie'],
	k1: 'comandam',
	k2: 'comandam',
	k5_frig: { fridge: true, fridgeType: 'incorporabil' },
	k5_gatit: { cook: 'separate', hob: 'vitro' },
	k5_spalat: { washer: true },
	k5_plasare: { ovenWhere: 'podea' },
	k6a: [],
	k7: 'nu',
	k8: ['nu'],
	k9: 'unul',
	k10: 'nu',
	k11: {},
	k12: {}
};

/** 3 — kitchen only, middle case: ibric (no k7 follow-up) and no baking. */
export const middleCase: Answers = {
	...common,
	c_household: { adults: 2, children: 0, elderly: 'da', pets: ['pisica', 'altceva'], petsOther: 'papagal' },
	c_rooms: ['bucatarie'],
	k1: 'incalzim',
	k2: 'gatim',
	k3: 'una',
	k4: ['tigaie', 'rapide'],
	k3b: [],
	k5_frig: { fridge: true, fridgeType: 'side' },
	k5_gatit: { cook: 'separate', hob: 'inductie' },
	k5_spalat: { dish: true },
	k5_plasare: { ovenWhere: 'oriunde' },
	k6a: ['blender', 'mixer', 'fierbator', 'altii'],
	k6a_other: 'Thermomix',
	k7: 'ibric',
	k8: ['nu'],
	k9: 'unul',
	k10: 'rapid',
	k10_seats: 2,
	k11: { text: 'ne încurcăm unul pe altul' },
	k12: { text: 'un blat liber' }
};

const KITCHEN_FULL = [
	'k_card',
	'k1',
	'k2',
	'k3',
	'k4',
	'k3b',
	'k5_frig',
	'k5_gatit',
	'k5_spalat',
	'k6a',
	'k7',
	'k8',
	'k9',
	'k10',
	'k11',
	'k12',
	'k13'
];
const HEAD = ['c_identity', 'c_rooms', 'p_modify', 'planuri', 'c_stage', 'c_household'];

describe('screen visibility', () => {
	it('three rooms, keen cook — kitchen, living and the bathroom, in ROOMS order', () => {
		expect(ids(threeRooms)).toEqual([
			...HEAD,
			...KITCHEN_FULL,
			'l_card',
			'l1',
			'l2',
			'l3',
			'l4',
			'x_card_baie',
			'x1_baie',
			'x2_baie',
			'x3_baie'
		]);
	});

	it('never cooks — k3, k4 and k3b are pruned', () => {
		expect(ids(neverCooks)).toEqual([
			...HEAD,
			'k_card',
			'k1',
			'k2',
			'k5_frig',
			'k5_gatit',
			'k5_spalat',
			'k6a',
			'k5_plasare',
			'k7',
			'k8',
			'k9',
			'k10',
			'k11',
			'k12',
			'k13'
		]);
	});

	it('middle case — every kitchen screen, the placement section included', () => {
		expect(ids(middleCase)).toEqual([
			...HEAD,
			...KITCHEN_FULL.flatMap((id) => (id === 'k7' ? ['k5_plasare', id] : [id]))
		]);
	});

	it('ibric opens no follow-up; a machine does', () => {
		const k7 = S.find((s) => s.id === 'k7')!;
		expect(activeFollowUp(k7, middleCase)).toBeNull();
		expect(activeFollowUp(k7, threeRooms)?.key).toBe('k7_freq');
	});

	it('the child options in K3B and L1 appear only when children were counted', () => {
		const noKids: Answers = { ...threeRooms, c_household: { adults: 2, children: 0 } };
		const l1 = S.find((s) => s.id === 'l1')!;
		const k3b = S.find((s) => s.id === 'k3b')!;
		expect(resolveOptions(l1, threeRooms).map((o) => o.value)).toContain('copii');
		expect(resolveOptions(l1, noKids).map((o) => o.value)).not.toContain('copii');
		expect(resolveOptions(k3b, threeRooms).map((o) => o.value)).toContain('copii');
		expect(resolveOptions(k3b, noKids).map((o) => o.value)).not.toContain('copii');
	});

	it('the placement section only lists what was actually chosen', () => {
		const s = S.find((x) => x.id === 'k5_plasare')!;
		/* threeRooms: an aragaz, no wine fridge, no microwave — nothing to place. */
		expect(resolveCards(s, threeRooms).map((c) => c.value)).toEqual([]);
		expect(ids(threeRooms)).not.toContain('k5_plasare');
		/* middleCase: a separate oven; add a wine fridge and a microwave and all three show. */
		expect(resolveCards(s, middleCase).map((c) => c.value)).toEqual(['oven']);
		const rich: Answers = {
			...middleCase,
			k5_frig: { fridge: true, fridgeType: 'side', wine: true },
			k6a: [...(middleCase.k6a as string[]), 'micro']
		};
		expect(resolveCards(s, rich).map((c) => c.value)).toEqual(['oven', 'micro', 'wine']);
	});

	it('a card section is complete once every ticked card has picked its option', () => {
		const gatit = S.find((x) => x.id === 'k5_gatit')!;
		const frig = S.find((x) => x.id === 'k5_frig')!;
		/* Gătit needs a pick; Refrigerare may stay empty. */
		expect(continueState(gatit, { ...middleCase, k5_gatit: {} }).enabled).toBe(false);
		expect(continueState(gatit, { ...middleCase, k5_gatit: { cook: 'separate' } }).enabled).toBe(
			false
		);
		expect(continueState(gatit, middleCase).enabled).toBe(true);
		expect(continueState(frig, { ...middleCase, k5_frig: {} }).enabled).toBe(true);
		expect(continueState(frig, { ...middleCase, k5_frig: { fridge: true } }).enabled).toBe(false);
		expect(continueState(frig, { ...middleCase, k5_frig: { freezer: true } }).enabled).toBe(true);
	});

	it('gas source is asked only for a gas or mixed aragaz', () => {
		const card = S.find((x) => x.id === 'k5_gatit')!;
		const aragaz = (card.kind === 'cards' ? card.cards : []).find((c) => c.value === 'aragaz')!;
		expect(resolveGroups(aragaz, { aragazPower: 'electric' }).map((g) => g.key)).toEqual([
			'aragazPower'
		]);
		expect(resolveGroups(aragaz, { aragazPower: 'mixt' }).map((g) => g.key)).toEqual([
			'aragazPower',
			'gasSource'
		]);
	});

	it('reheating what you cooked yourself still counts as cooking', () => {
		/* middleCase reheats on weekdays and cooks at the weekend: k3, k4 and k3b stay. */
		expect(ids(middleCase)).toContain('k3');
		expect(ids({ ...middleCase, k2: 'comandam' })).toContain('k3');
		/* only ordering in on both counts as not cooking */
		expect(ids({ ...middleCase, k1: 'comandam', k2: 'comandam' })).not.toContain('k3');
	});

	it('the kitchen chapter counts 16 questions, 14 when nobody cooks', () => {
		expect(chapterQuestionCount('bucatarie', threeRooms)).toBe(16);
		expect(chapterQuestionCount('bucatarie', neverCooks)).toBe(14);
	});
});

describe('the revamped questions', () => {
	const at = (id: string) => screenById(id)!;

	it('the child room is gone: children now sleep in a bedroom', () => {
		expect(ROOMS.map((r) => r.id)).not.toContain('copil');
		expect(resolveOptions(at('d1'), threeRooms).map((o) => o.value)).toContain('copil');
	});

	it('"Altceva" on a single choice asks for the text before continuing', () => {
		expect(continueState(at('c_stage'), { c_stage: 'altceva' }).enabled).toBe(false);
		expect(continueState(at('c_stage'), { c_stage: 'altceva', c_stage_other: '  ' }).enabled).toBe(false);
		expect(continueState(at('c_stage'), { c_stage: 'altceva', c_stage_other: 'mansardă' }).enabled).toBe(true);
		expect(continueState(at('c_stage'), { c_stage: 'mobilier' }).enabled).toBe(true);
	});

	it('"Altceva" on a multi choice and inside a compound screen asks for the text too', () => {
		expect(continueState(at('x1_baie'), { x1_baie: ['altceva'] }).enabled).toBe(false);
		expect(continueState(at('x1_baie'), threeRooms).enabled).toBe(true);
		const d2 = at('d2');
		expect(continueState(d2, { d2: { bed: 'altceva', wants: ['dulap'] } }).enabled).toBe(false);
		expect(
			continueState(d2, { d2: { bed: 'altceva', bedOther: 'pat rotund', wants: ['dulap'] } }).enabled
		).toBe(true);
	});

	it('a furniture screen can be skipped, and says so until an object is written', () => {
		expect(continueState(at('k13'), { ...threeRooms, k13: undefined }).label).toBe('Sar peste');
		expect(continueState(at('k13'), { ...threeRooms, k13: { items: [{ name: '', length: '', width: '' }] } }).label).toBe('Sar peste');
		expect(continueState(at('k13'), threeRooms).label).toBe('Continuă');
		expect(continueState(at('x3_baie'), threeRooms).label).toBe('Sar peste, vezi ce am înțeles');
	});

	it('only an appliance opens the coffee frequency — ibric, moka and french press do not', () => {
		const k7 = at('k7');
		expect(activeFollowUp(k7, { k7: 'ibric' })).toBeNull();
		expect(activeFollowUp(k7, { k7: 'filtru' })?.key).toBe('k7_freq');
	});
});

describe('chrome', () => {
	it('the meter label counts the visible, non-card screens of the chapter', () => {
		const at = (id: string) =>
			chromeFor('flow', S.find((s) => s.id === id)!, threeRooms, true).label;
		expect(at('k1')).toBe('Bucătărie · 1 din 16');
		expect(at('k6a')).toBe('Bucătărie · 9 din 16');
		expect(at('k_card')).toBe('Bucătărie · 16 întrebări');
	});

	it('the rail lists Despre tine · Planuri · Locuința · picked rooms', () => {
		const c = chromeFor('flow', S.find((s) => s.id === 'k1')!, threeRooms, true);
		expect(c.chapters.map((x) => x.id)).toEqual([
			'despre_tine',
			'planuri',
			'locuinta',
			'bucatarie',
			'living',
			'baie'
		]);
		expect(c.chapters.find((x) => x.id === 'bucatarie')?.state).toBe('now');
		expect(c.chapters.find((x) => x.id === 'locuinta')?.state).toBe('done');
		expect(c.chapters.find((x) => x.id === 'living')?.state).toBe('todo');
	});

	it('Planuri is done only when the plans step is complete', () => {
		const k1 = S.find((s) => s.id === 'k1')!;
		expect(chromeFor('flow', k1, threeRooms, false).chapters[1].state).toBe('todo');
		expect(chromeFor('flow', k1, threeRooms, true).chapters[1].state).toBe('done');
	});

	it('the summary marks every chapter done', () => {
		const c = chromeFor('done', null, threeRooms, true);
		expect(c.label).toBe('Ce am înțeles');
		expect(c.progress).toBe(1);
		expect(c.chapters.every((x) => x.state === 'done')).toBe(true);
	});
});
