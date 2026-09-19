import { describe, expect, it } from 'vitest';
import { resolveFreeEndDirection } from './dragState';
import type { Model, Wall } from './model';

function wall(id: string, from: [number, number], to: [number, number]): Wall {
	return {
		id,
		from: { x: from[0], y: from[1] },
		to: { x: to[0], y: to[1] },
		lengthSource: 'drawn',
		isOpen: false,
		segments: [
			{
				id: id + '-s',
				kind: 'wall',
				length: { value: Math.hypot(to[0] - from[0], to[1] - from[1]), source: 'drawn' },
				offsetFromStart: 0,
				sill: null,
				hinge: null,
				hingeSource: null,
				swing: null,
				swingSource: null
			}
		]
	};
}
const m: Model = { walls: [wall('a', [0, 0], [300, 0])], landmarks: [] };
const at = (dx: number, dy: number) =>
	resolveFreeEndDirection(m, { wallId: 'a', movingEnd: 'to', startCm: { x: 300, y: 0 } }, {
		x: 300 + dx,
		y: dy
	});

describe('resolveFreeEndDirection', () => {
	it('straight along the wall is a resize, from the other end', () => {
		expect(at(40, 0)).toEqual({ kind: 'resize', fixedEnd: 'from', heading: 'E' });
	});

	it('pulling the wall´s own start reads the heading the other way round', () => {
		expect(
			resolveFreeEndDirection(m, { wallId: 'a', movingEnd: 'from', startCm: { x: 0, y: 0 } }, {
				x: -40,
				y: 0
			})
		).toEqual({ kind: 'resize', fixedEnd: 'to', heading: 'W' });
	});

	it('about 25 degrees either side of the axis is still a resize, and more is a pan', () => {
		/* cos 25° is a hair above the 0.9 the resize needs */
		expect(at(40, 40 * Math.tan((24 * Math.PI) / 180)).kind).toBe('resize');
		expect(at(40, -40 * Math.tan((24 * Math.PI) / 180)).kind).toBe('resize');
		expect(at(40, 40 * Math.tan((27 * Math.PI) / 180)).kind).toBe('pan');
		expect(at(0, 40).kind).toBe('pan');
	});

	it('a wall that is no longer there moves the view', () => {
		expect(
			resolveFreeEndDirection(m, { wallId: 'gone', movingEnd: 'to', startCm: { x: 0, y: 0 } }, {
				x: 40,
				y: 0
			})
		).toEqual({ kind: 'pan' });
	});

	it('a press that has not moved at all moves the view', () => {
		expect(at(0, 0).kind).toBe('pan');
	});
});
