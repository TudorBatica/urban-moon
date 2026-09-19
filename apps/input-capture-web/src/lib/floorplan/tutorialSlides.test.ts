import { describe, expect, it } from 'vitest';
import { DRAWING_TOOLS } from './engine/tools';
import {
	DRAWING_SLIDES,
	GOT_IT_LABEL,
	LANDMARK_SLIDES,
	LAST_LABEL,
	NEXT_LABEL,
	slideView
} from './tutorialSlides';

describe('the drawing slides', () => {
	it('are one per tool, in the order the client meets them', () => {
		expect(DRAWING_SLIDES.map((s) => s.id)).toEqual(['wall', 'open', 'window', 'door', 'select']);
		expect(DRAWING_SLIDES.map((s) => s.title)).toEqual([
			'Perete',
			'Fără perete',
			'Fereastră',
			'Ușă',
			'Selectează, mută, mărește'
		]);
	});

	it('are about tools the editor has', () => {
		const ids = DRAWING_TOOLS.map((t) => t.id);
		for (const slide of DRAWING_SLIDES) expect(ids).toContain(slide.id);
	});

	it('say it in both the touch words and the mouse words', () => {
		for (const slide of DRAWING_SLIDES) {
			expect(slide.phone.length).toBeGreaterThan(0);
			expect(slide.desktop.length).toBeGreaterThan(0);
		}
		expect(DRAWING_SLIDES[0].phone).toContain('degetul');
		expect(DRAWING_SLIDES[2].desktop).toContain('dă clic');
	});
});

describe('the landmark slide', () => {
	it('is one, about the mechanic rather than a tool', () => {
		expect(LANDMARK_SLIDES).toHaveLength(1);
		expect(LANDMARK_SLIDES[0].id).toBe('landmark');
		expect(LANDMARK_SLIDES[0].title).toBe('Arată unde se află');
	});

	it('says it in both the touch words and the mouse words', () => {
		expect(LANDMARK_SLIDES[0].phone).toContain('Atinge');
		expect(LANDMARK_SLIDES[0].desktop).toContain('Dă clic');
	});

	it('has nothing to go back to, and closes on "Am înțeles"', () => {
		const v = slideView(LANDMARK_SLIDES, 0, 'phone', GOT_IT_LABEL);
		expect(v.showBack).toBe(false);
		expect(v.nextLabel).toBe(GOT_IT_LABEL);
	});
});

describe('one step of a set of slides', () => {
	it('counts from one and says how many there are', () => {
		expect(slideView(DRAWING_SLIDES, 0, 'phone').position).toBe('1 / 5');
		expect(slideView(DRAWING_SLIDES, 4, 'phone').position).toBe('5 / 5');
	});

	it('has nothing to go back to on the first', () => {
		expect(slideView(DRAWING_SLIDES, 0, 'phone').showBack).toBe(false);
		expect(slideView(DRAWING_SLIDES, 1, 'phone').showBack).toBe(true);
	});

	it('says what happens next, and on the last what happens after', () => {
		expect(slideView(DRAWING_SLIDES, 0, 'phone').nextLabel).toBe(NEXT_LABEL);
		expect(slideView(DRAWING_SLIDES, 3, 'phone').nextLabel).toBe(NEXT_LABEL);
		expect(slideView(DRAWING_SLIDES, 4, 'phone').nextLabel).toBe(LAST_LABEL);
	});

	it('takes the paragraph of the device in use', () => {
		expect(slideView(DRAWING_SLIDES, 0, 'phone').paragraph).toBe(DRAWING_SLIDES[0].phone);
		expect(slideView(DRAWING_SLIDES, 0, 'desktop').paragraph).toBe(DRAWING_SLIDES[0].desktop);
	});

	it('stays inside the set', () => {
		expect(slideView(DRAWING_SLIDES, -3, 'phone').index).toBe(0);
		expect(slideView(DRAWING_SLIDES, 99, 'phone').index).toBe(4);
	});

	it('works for a set of one', () => {
		const one = [DRAWING_SLIDES[0]];
		const v = slideView(one, 0, 'phone');
		expect(v.position).toBe('1 / 1');
		expect(v.showBack).toBe(false);
		expect(v.nextLabel).toBe(LAST_LABEL);
	});
});
