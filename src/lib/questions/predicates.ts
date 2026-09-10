import type { Answers, RoomId } from '$lib/types';

/* Ported verbatim from ../index.html ("predicates" block). */

export interface Household {
	adults?: number;
	children?: number;
	childAges?: string[];
	elderly?: 'da' | 'nu';
	pets?: string[];
}

export const picked = (a: Answers, r: RoomId | string): boolean =>
	Array.isArray(a.c_rooms) && (a.c_rooms as string[]).includes(r);

export const hh = (a: Answers): Household => (a.c_household as Household) || {};

export const kids = (a: Answers): boolean => (hh(a).children || 0) > 0;

export const toddlers = (a: Answers): boolean => kids(a) && (hh(a).childAges || []).includes('sub3');

/** Nobody cooks only when neither the week nor the weekend involves a pot.
 *  "Încălzim ceva gătit de noi dinainte" still counts: someone cooked it. */
export const notCooking = (a: Answers): boolean => a.k1 === 'comandam' && a.k2 === 'comandam';

/** Everyone the household screen counted — the seat count starts here. */
export const peopleCount = (a: Answers): number => {
	const d = hh(a);
	return (d.adults ?? 2) + (d.children ?? 0);
};

export const hasMachine = (a: Answers): boolean =>
	['espressor', 'capsule', 'filtru', 'manual'].includes(a.k7 as string);

export const yn = [
	{ value: 'nu', label: 'Nu' },
	{ value: 'da', label: 'Da' }
];
