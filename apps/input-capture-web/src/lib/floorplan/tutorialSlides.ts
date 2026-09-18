/* The drawing editor's only help: one slide per tool, in the order the
   client meets them. Data, so another screen can hand a different set to the
   same surface. Each slide's id is the id of the tool it is about, so the
   stage can draw that tool's glyph. */

import type { Device } from './device';

export interface SlideDef {
	/** the tool the slide is about */
	id: string;
	title: string;
	/** the paragraph in touch words */
	phone: string;
	/** the paragraph in mouse-and-keyboard words */
	desktop: string;
}

export const SKIP_LABEL = 'Sari peste';
export const BACK_LABEL = 'Înapoi';
export const NEXT_LABEL = 'Mai departe';
export const LAST_LABEL = 'Încep să desenez';

export const DRAWING_SLIDES: SlideDef[] = [
	{
		id: 'wall',
		title: 'Perete',
		phone:
			'Alege Perete din bara de sus, apoi trage cu degetul de la un capăt al peretelui la celălalt. După fiecare perete revii la Selectează, ca să poți muta și mări planul.',
		desktop:
			'Alege Perete (P) din bara de sus, apoi ține apăsat și trage de la un capăt al peretelui la celălalt. După fiecare perete revii la Selectează, ca să poți muta și mări planul.'
	},
	{
		id: 'open',
		title: 'Fără perete',
		phone:
			'Pentru o latură unde camera se deschide spre altă cameră, fără perete între ele. Alege Fără perete și trage pe acolo, la fel ca la un perete.',
		desktop:
			'Pentru o latură unde camera se deschide spre altă cameră, fără perete între ele. Alege Fără perete (L) și trage pe acolo, la fel ca la un perete.'
	},
	{
		id: 'window',
		title: 'Fereastră',
		phone:
			'Alege Fereastră și atinge peretele pe care e fereastra. Apoi o poți trage pe perete, chiar și după colț. Înălțimea pervazului e de la podea până la fereastră; schimb-o dacă nu e 90 cm.',
		desktop:
			'Alege Fereastră (F) și dă clic pe peretele pe care e fereastra. Apoi o poți trage pe perete, chiar și după colț. Înălțimea pervazului e de la podea până la fereastră; schimb-o dacă nu e 90 cm.'
	},
	{
		id: 'door',
		title: 'Ușă',
		phone:
			'Alege Ușă și atinge peretele pe care e ușa. Trage-o unde este, apoi apasă Rotește până se deschide ca la tine acasă.',
		desktop:
			'Alege Ușă (U) și dă clic pe peretele pe care e ușa. Trage-o unde este, apoi apasă Rotește (R) până se deschide ca la tine acasă.'
	},
	{
		id: 'select',
		title: 'Selectează, mută, mărește',
		phone:
			'Cu Selectează atingi ce ai desenat ca să-l muți, să-i scrii lungimea sau să-l ștergi. Cu două degete mărești și muți planul.',
		desktop:
			'Cu Selectează dai clic pe ce ai desenat ca să-l muți, să-i scrii lungimea sau să-l ștergi. Rotița mărește planul; trage de fundal ca să-l muți.'
	}
];

export interface SlideView {
	slide: SlideDef;
	/** where in the set this one is, zero-based and inside the set */
	index: number;
	/** "1 / 5" */
	position: string;
	paragraph: string;
	/** the first slide has nothing to go back to */
	showBack: boolean;
	nextLabel: string;
}

/** What the surface shows for one step of a set, with the step clamped inside it. */
export function slideView(slides: readonly SlideDef[], step: number, device: Device): SlideView {
	const index = Math.min(Math.max(Math.trunc(step), 0), slides.length - 1);
	const slide = slides[index];
	const last = index === slides.length - 1;
	return {
		slide,
		index,
		position: index + 1 + ' / ' + slides.length,
		paragraph: device === 'phone' ? slide.phone : slide.desktop,
		showBack: index > 0,
		nextLabel: last ? LAST_LABEL : NEXT_LABEL
	};
}
