import { describe, expect, it } from 'vitest';
import type { Model, Wall } from './model';
import {
	collectVertices,
	findClosedRing,
	headingOf,
	headingVec,
	isClosedLoop,
	isFreeEnd,
	neighborAt,
	planBox,
	pointAlong,
	projectOnSegment,
	segPoints,
	segTotal,
	snapHeading,
	traceChain,
	wallDir,
	wallLen,
	wallNormal,
	wallUnderPoint,
	wallsAtPoint
} from './topology';
import { fixture } from './fixtures/load';

function wall(id: string, from: [number, number], to: [number, number], isOpen = false): Wall {
	const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
	return {
		id,
		from: { x: from[0], y: from[1] },
		to: { x: to[0], y: to[1] },
		lengthSource: 'drawn',
		isOpen,
		segments: [
			{
				id: id + '-s',
				kind: isOpen ? 'open' : 'wall',
				length: { value: len, source: 'drawn' },
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
const modelOf = (...walls: Wall[]): Model => ({ walls, landmarks: [] });

describe('one wall on its own', () => {
	const w = wall('a', [0, 0], [300, 0]);

	it('reads its length, its direction and its normal', () => {
		expect(wallLen(w)).toBe(300);
		expect(wallDir(w)).toEqual({ x: 1, y: 0 });
		expect(wallNormal(w)).toEqual({ x: -0, y: 1 });
		expect(segTotal(w)).toBe(300);
	});

	it('names the heading it runs in, and the vector back', () => {
		expect(headingOf(w)).toBe('E');
		expect(headingOf(wall('b', [0, 0], [-10, 0]))).toBe('W');
		expect(headingOf(wall('b', [0, 0], [0, 10]))).toBe('S');
		expect(headingOf(wall('b', [0, 0], [0, -10]))).toBe('N');
		expect(headingVec('N')).toEqual({ x: 0, y: -1 });
		expect(headingVec('W')).toEqual({ x: -1, y: 0 });
	});

	it('a square drag reads as the axis it moved furthest along, east and south on a tie', () => {
		expect(snapHeading(10, 10)).toBe('E');
		expect(snapHeading(-1, 10)).toBe('S');
		expect(snapHeading(0, 0)).toBe('E');
		expect(snapHeading(-1, -10)).toBe('N');
	});

	it('walks along itself in cm, and cuts a segment out of itself', () => {
		expect(pointAlong(w, 120)).toEqual({ x: 120, y: 0 });
		expect(segPoints(w, w.segments[0])).toEqual({ p0: { x: 0, y: 0 }, p1: { x: 300, y: 0 } });
	});

	it('has two free ends and no neighbour', () => {
		const m = modelOf(w);
		expect(isFreeEnd(m, w, 'from')).toBe(true);
		expect(isFreeEnd(m, w, 'to')).toBe(true);
		expect(neighborAt(m, w, 'to')).toBeNull();
	});
});

describe('projectOnSegment', () => {
	it('lands on the nearest point of the segment, clamped to its ends', () => {
		expect(projectOnSegment({ x: 50, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({
			t: 0.5,
			point: { x: 50, y: 0 }
		});
		expect(projectOnSegment({ x: -20, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }).t).toBe(0);
		expect(projectOnSegment({ x: 999, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }).t).toBe(1);
	});

	it('a segment of no length is its own answer', () => {
		expect(projectOnSegment({ x: 9, y: 9 }, { x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({
			t: 0,
			point: { x: 4, y: 4 }
		});
	});
});

describe('vertices', () => {
	it('dedupe by exact point: a corner carries two refs, a free end one', () => {
		const m = modelOf(wall('a', [0, 0], [300, 0]), wall('b', [300, 0], [300, 200]));
		const vs = collectVertices(m);
		expect(vs).toHaveLength(3);
		const corner = vs.find((v) => v.point.x === 300 && v.point.y === 0);
		expect(corner?.refs.map((rf) => rf.wall.id + ':' + rf.end)).toEqual(['a:to', 'b:from']);
		expect(vs.filter((v) => v.refs.length === 1)).toHaveLength(2);
	});

	it('wallsAtPoint leaves out the wall asked about', () => {
		const m = modelOf(wall('a', [0, 0], [300, 0]), wall('b', [300, 0], [300, 200]));
		expect(wallsAtPoint(m, { x: 300, y: 0 }, 'a').map((x) => x.wall.id)).toEqual(['b']);
		expect(wallsAtPoint(m, { x: 300, y: 0 }, null)).toHaveLength(2);
	});
});

describe('traceChain', () => {
	it('is orientation-agnostic: a wall drawn to->from in the ring is still walked', () => {
		/* the third wall is drawn backwards against the ring's direction */
		const m = modelOf(
			wall('a', [0, 0], [100, 0]),
			wall('b', [100, 0], [100, 100]),
			wall('c', [0, 100], [100, 100]),
			wall('d', [0, 100], [0, 0])
		);
		const chain = traceChain(m, m.walls[0], 'from');
		expect(chain.walls.map((e) => e.wall.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(chain.walls.map((e) => e.entry)).toEqual(['from', 'from', 'to', 'from']);
		expect(chain.closed).toBe(true);
		expect(chain.points).toEqual([
			[0, 0],
			[100, 0],
			[100, 100],
			[0, 100],
			[0, 0]
		]);
	});

	it('stops at a free end, and at a T-junction', () => {
		const m: Model = fixture('t-junction').model;
		const chain = traceChain(m, m.walls[0], 'from');
		expect(chain.walls.map((e) => e.wall.id)).toEqual(['wall1']);
		expect(chain.closed).toBe(false);
	});
});

describe('findClosedRing', () => {
	it('is the ring of the closed room, in ring order', () => {
		const m: Model = fixture('closed-room').model;
		const ring = findClosedRing(m);
		expect(ring?.walls.map((e) => e.wall.id)).toEqual(['wall1', 'wall2', 'wall3', 'wall4']);
		expect(isClosedLoop(m)).toBe(true);
	});

	it('is nothing below four walls, however they join', () => {
		const m = modelOf(
			wall('a', [0, 0], [100, 0]),
			wall('b', [100, 0], [100, 100]),
			wall('c', [100, 100], [0, 0])
		);
		expect(findClosedRing(m)).toBeNull();
	});

	it('is nothing for a fold-back that revisits a wall without covering a ring', () => {
		/* four walls, but the fourth doubles back onto the first's own start */
		const m = modelOf(
			wall('a', [0, 0], [100, 0]),
			wall('b', [100, 0], [100, 100]),
			wall('c', [100, 100], [200, 100]),
			wall('d', [200, 100], [200, 200])
		);
		expect(findClosedRing(m)).toBeNull();
		expect(isClosedLoop(m)).toBe(false);
	});

	it('is nothing when a ring does not cover every wall', () => {
		const m: Model = fixture('detached-piece').model;
		expect(findClosedRing(m)).toBeNull();
	});
});

describe('neighbourhood', () => {
	it('a T-junction has no single neighbour on purpose', () => {
		const m: Model = fixture('t-junction').model;
		const w1 = m.walls[0];
		expect(wallsAtPoint(m, w1.to, w1.id)).toHaveLength(2);
		expect(neighborAt(m, w1, 'to')).toBeNull();
		expect(isFreeEnd(m, w1, 'to')).toBe(false);
		expect(isFreeEnd(m, w1, 'from')).toBe(true);
	});

	it('an ordinary corner has exactly one', () => {
		const m: Model = fixture('closed-room').model;
		expect(neighborAt(m, m.walls[0], 'to')?.wall.id).toBe('wall2');
	});
});

describe('planBox', () => {
	it('is the bounding box of every wall end, and nothing on an empty canvas', () => {
		expect(planBox(fixture('closed-room').model)).toEqual({
			minX: 0,
			minY: 0,
			maxX: 400,
			maxY: 300
		});
		expect(planBox(fixture('empty').model)).toBeNull();
	});
});

describe('wallUnderPoint', () => {
	const m = modelOf(
		wall('a', [0, 0], [300, 0]),
		wall('open', [0, 20], [300, 20], true),
		wall('b', [0, 40], [300, 40])
	);

	it('refuses a Fără perete side and takes the nearest across', () => {
		/* the open side is the nearest of the three, and is never the answer */
		expect(wallUnderPoint(m, { x: 150, y: 25 }, 30)?.wall.id).toBe('b');
		expect(wallUnderPoint(m, { x: 150, y: 5 }, 30)?.wall.id).toBe('a');
	});

	it('reads how far along the wall the point is, clamped to it', () => {
		expect(wallUnderPoint(m, { x: 120, y: 5 }, 30)).toMatchObject({ alongCm: 120 });
		expect(wallUnderPoint(m, { x: -10, y: 0 }, 30)).toMatchObject({ alongCm: 0 });
	});

	it('is nothing out of reach of every wall', () => {
		expect(wallUnderPoint(m, { x: 150, y: 400 }, 30)).toBeNull();
		expect(wallUnderPoint(m, { x: -100, y: 0 }, 30)).toBeNull();
	});
});
