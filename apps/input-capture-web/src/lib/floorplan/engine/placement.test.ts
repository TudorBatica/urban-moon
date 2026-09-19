import { describe, expect, it } from 'vitest';
import { placeClear, type Obstacle } from './placement';

const STAGE = { width: 400, height: 800 };

function place(pos: { x: number; y: number }, obstacles: Obstacle[] = [], w = 80, h = 44) {
	return placeClear({ pos, w, h, stage: STAGE, obstacles });
}

describe('placeClear', () => {
	it('leaves an anchor with room around it where it is', () => {
		expect(place({ x: 200, y: 400 })).toEqual({ x: 200, y: 400, remaining: 0 });
	});

	it('pulls a centre back so the whole element stays on the stage', () => {
		expect(place({ x: 2, y: 400 }).x).toBe(44);
		expect(place({ x: 398, y: 400 }).x).toBe(356);
		expect(place({ x: 200, y: -50 }).y).toBe(26);
		expect(place({ x: 200, y: 900 }).y).toBe(774);
	});

	it('puts an element wider than the stage at the floor of its own range', () => {
		const wide = placeClear({
			pos: { x: 200, y: 400 },
			w: 500,
			h: 44,
			stage: STAGE,
			obstacles: []
		});
		expect(wide.x).toBe(254);
	});

	it('pushes clear of one obstacle on the shortest axis', () => {
		const obstacle = { l: 160, t: 380, r: 240, b: 420 };
		const out = place({ x: 200, y: 400 }, [obstacle]);
		/* The element is 44 tall and 80 wide: 48px down is the shortest way off a
		   box that overlaps it on both axes, and 86px sideways the longest. */
		expect(out.y).toBe(420 + 22 + 6);
		expect(out.x).toBe(200);
		expect(out.remaining).toBe(0);
	});

	it('takes two rounds when clearing one obstacle reveals another', () => {
		const obstacles = [
			{ l: 160, t: 380, r: 240, b: 420 },
			{ l: 160, t: 300, r: 240, b: 340 }
		];
		const out = place({ x: 200, y: 400 }, obstacles);
		expect(out.remaining).toBe(0);
		for (const o of obstacles) {
			const clearOfIt = out.x - 40 >= o.r || out.x + 40 <= o.l || out.y - 22 >= o.b || out.y + 22 <= o.t;
			expect(clearOfIt).toBe(true);
		}
	});

	it('prefers the option that clears everything over a shorter push that does not', () => {
		/* Only the first box overlaps to begin with. Both ways off it along the
		   short axis land on a box just beyond, so the longer push sideways — the
		   one that actually clears everything — wins. */
		const obstacles = [
			{ l: 160, t: 380, r: 240, b: 420 },
			{ l: 100, t: 430, r: 300, b: 470 },
			{ l: 100, t: 330, r: 300, b: 376 }
		];
		const out = place({ x: 200, y: 400 }, obstacles);
		expect(out).toEqual({ x: 240 + 40 + 6, y: 400, remaining: 0 });
	});

	it('reports what is left when the stage has no clear spot at all', () => {
		const wall: Obstacle = { l: -100, t: -100, r: 500, b: 900 };
		const out = place({ x: 200, y: 400 }, [wall]);
		expect(out.remaining).toBe(1);
		expect(out.x).toBeGreaterThanOrEqual(44);
		expect(out.x).toBeLessThanOrEqual(356);
	});

	it('ignores an obstacle it does not overlap', () => {
		const out = place({ x: 200, y: 400 }, [{ l: 0, t: 0, r: 40, b: 40 }]);
		expect(out).toEqual({ x: 200, y: 400, remaining: 0 });
	});
});
