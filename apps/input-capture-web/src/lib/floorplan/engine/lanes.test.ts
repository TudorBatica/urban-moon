import { describe, expect, it } from 'vitest';
import { clearLane, lanesOverlap, type LaneBox } from './lanes';

/** a chip beside a wall running east: out of it is north, along it is east */
const OUT = { x: 0, y: -1 };
const ALONG = { x: 1, y: 0 };
/** the footprint of one chip, the same half extents the numbers use */
const HW = 46;
const HH = 22;
const box = (cx: number, cy: number): LaneBox => ({ cx, cy, hw: HW, hh: HH });

describe('lanesOverlap', () => {
	it('is two footprints sharing ground on both axes', () => {
		expect(lanesOverlap(box(0, 0), box(80, 0))).toBe(true);
		expect(lanesOverlap(box(0, 0), box(2 * HW, 0))).toBe(false);
		expect(lanesOverlap(box(0, 0), box(80, 2 * HH))).toBe(false);
	});
});

describe('clearLane', () => {
	it('leaves a number where it is while its lane is its own', () => {
		expect(clearLane(box(0, 0), OUT, ALONG, 34, [box(200, 0)])).toEqual({ outPx: 0, alongPx: 0 });
	});

	it('steps the second one out a lane, and stops there when that clears it', () => {
		/* the neighbour is far enough across that the outer lane is past it */
		expect(clearLane(box(0, 0), OUT, ALONG, 34, [box(10, 30)])).toEqual({ outPx: 34, alongPx: 0 });
	});

	it('slides it along its own wall when stepping out was not enough', () => {
		/* the neighbour sits where the outer lane is, so the step-out lands on it */
		const move = clearLane(box(0, 0), OUT, ALONG, 34, [box(10, -34)]);
		expect(move.outPx).toBe(34);
		/* back the way it came, which is the shorter of the two moves here */
		expect(move.alongPx).toBe(-(HW + 6 - (10 - HW)));
		expect(lanesOverlap({ ...box(move.alongPx, -34) }, box(10, -34))).toBe(false);
	});

	it('slides whichever way is the shorter move', () => {
		const move = clearLane(box(0, 0), OUT, ALONG, 34, [box(-10, -34)]);
		expect(move.alongPx).toBe(HW + 6 - (10 - HW));
	});

	it('reads the wall´s own directions, not the axes', () => {
		/* a wall running north: out of it is east, along it is north */
		const move = clearLane(box(0, 0), { x: 1, y: 0 }, { x: 0, y: 1 }, 62, [box(0, 10), box(62, 10)]);
		expect(move.outPx).toBe(62);
		expect(move.alongPx).toBe(-(HH + 6 - (10 - HH)));
		expect(lanesOverlap(box(62, move.alongPx), box(62, 10))).toBe(false);
	});
});
