import { describe, expect, it } from 'vitest';
import {
	SNAP_PX,
	distPx,
	findCornerSnap,
	findEndpointSnap,
	findPushSnap,
	findStartSnap,
	resizeEndpointSnap
} from './snap';
import type { Model, Segment, SegmentKind, Wall } from './model';
import { reflow } from './openings';

let n = 0;
function seg(kind: SegmentKind, value: number): Segment {
	return {
		id: 'sn' + ++n,
		kind,
		length: { value, source: 'computed' },
		offsetFromStart: 0,
		sill: null,
		hinge: null,
		hingeSource: null,
		swing: null,
		swingSource: null
	};
}
function wall(id: string, from: [number, number], to: [number, number], segs?: Segment[]): Wall {
	const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
	const w: Wall = {
		id,
		from: { x: from[0], y: from[1] },
		to: { x: to[0], y: to[1] },
		lengthSource: 'drawn',
		isOpen: false,
		segments: segs && segs.length ? segs : [seg('wall', len)]
	};
	reflow(w);
	return w;
}
const modelOf = (...walls: Wall[]): Model => ({ walls, landmarks: [] });

describe('distPx', () => {
	it('is the distance on screen, not in the plan', () => {
		expect(distPx({ x: 0, y: 0 }, { x: 100, y: 0 }, 1)).toBe(100);
		expect(distPx({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.25)).toBe(25);
	});
});

describe('findStartSnap', () => {
	const m = modelOf(wall('a', [0, 0], [300, 0]), wall('b', [300, 0], [300, 200]));

	it('welds onto a corner and onto a free end, naming which it is', () => {
		expect(findStartSnap(m, { x: 295, y: 4 }, 1)).toEqual({
			kind: 'corner',
			point: { x: 300, y: 0 },
			weld: true
		});
		expect(findStartSnap(m, { x: 4, y: 4 }, 1)).toMatchObject({ kind: 'end', weld: true });
	});

	it('measures its radius in screen px: what misses close up catches zoomed out', () => {
		expect(findStartSnap(m, { x: 40, y: 0 }, 1).kind).toBe('none');
		expect(findStartSnap(m, { x: 40, y: 0 }, 0.25).kind).toBe('end');
		/* exactly the radius still catches; a hair beyond does not */
		expect(findStartSnap(m, { x: SNAP_PX, y: 0 }, 1).kind).toBe('end');
		expect(findStartSnap(m, { x: SNAP_PX + 0.1, y: 0 }, 1).kind).toBe('none');
	});

	it('rounds the point it hands back where nothing caught', () => {
		expect(findStartSnap(m, { x: 100.4, y: 60.6 }, 1)).toEqual({
			kind: 'none',
			point: { x: 100, y: 61 },
			weld: false
		});
	});
});

describe('findEndpointSnap', () => {
	it('welds onto a vertex, off the stroke´s own axis and all', () => {
		const m = modelOf(wall('a', [400, 6], [400, 300]));
		expect(findEndpointSnap(m, { x: 0, y: 0 }, 'E', 398, 1)).toEqual({
			kind: 'end',
			point: { x: 400, y: 6 },
			weld: true
		});
	});

	it('T-junctions at the exact intersection of the two axes', () => {
		const m = modelOf(wall('a', [400, -200], [400, 200]));
		const snap = findEndpointSnap(m, { x: 0, y: 37 }, 'E', 396, 1);
		expect(snap).toEqual({
			kind: 'tjunction',
			point: { x: 400, y: 37 },
			wallId: 'a',
			weld: true
		});
	});

	it('never T-junctions at a wall´s own ends', () => {
		const m = modelOf(wall('a', [400, 0], [400, 400]));
		/* two per cent in from each end is still the end, not the middle */
		expect(findEndpointSnap(m, { x: 0, y: 4 }, 'E', 400, 1).kind).not.toBe('tjunction');
	});

	it('lines up with a point on the free axis without welding', () => {
		const m = modelOf(wall('a', [400, -300], [700, -300]));
		const snap = findEndpointSnap(m, { x: 0, y: 0 }, 'E', 395, 1);
		expect(snap).toEqual({
			kind: 'align',
			point: { x: 400, y: 0 },
			guideAt: { x: 400, y: -300 },
			weld: false
		});
	});

	it('is nothing at all out of reach, rounded to whole cm', () => {
		const m = modelOf(wall('a', [400, -300], [700, -300]));
		expect(findEndpointSnap(m, { x: 0, y: 0 }, 'E', 200.6, 1)).toEqual({
			kind: 'none',
			point: { x: 201, y: 0 },
			weld: false
		});
	});

	it('takes the same alignment at a quarter of the zoom from four times as far', () => {
		const m = modelOf(wall('a', [400, -300], [700, -300]));
		expect(findEndpointSnap(m, { x: 0, y: 0 }, 'E', 340, 1).kind).toBe('none');
		expect(findEndpointSnap(m, { x: 0, y: 0 }, 'E', 340, 0.25).kind).toBe('align');
	});
});

describe('resizeEndpointSnap', () => {
	it('refuses an off-axis weld and falls back to the plain projection', () => {
		const target = wall('b', [400, 6], [400, 300]);
		const w = wall('a', [0, 0], [300, 0]);
		const m = modelOf(w, target);
		const snap = resizeEndpointSnap(m, w, { fixedEnd: 'from', heading: 'E' }, { x: 398, y: 0 }, 1);
		/* the fallback is the target put back on the axis, not where the pointer was */
		expect(snap).toEqual({ kind: 'none', point: { x: 400, y: 0 }, weld: false });
	});

	it('takes an on-axis weld', () => {
		const target = wall('b', [400, 0], [400, 300]);
		const w = wall('a', [0, 0], [300, 0]);
		const m = modelOf(w, target);
		expect(resizeEndpointSnap(m, w, { fixedEnd: 'from', heading: 'E' }, { x: 396, y: 0 }, 1)).toEqual({
			kind: 'end',
			point: { x: 400, y: 0 },
			weld: true
		});
	});

	it('never pulls the wall under what the openings on it need', () => {
		const w = wall('a', [0, 0], [300, 0], [seg('door', 200), seg('wall', 100)]);
		const m = modelOf(w);
		const snap = resizeEndpointSnap(m, w, { fixedEnd: 'from', heading: 'E' }, { x: 10, y: 0 }, 1);
		expect(snap.point).toEqual({ x: 200, y: 0 });
	});
});

describe('findPushSnap', () => {
	it('catches a free end travelling onto another vertex, and says how far', () => {
		const w = wall('a', [0, 0], [300, 0]);
		const other = wall('b', [0, 100], [300, 100]);
		const m = modelOf(w, other);
		const snap = findPushSnap(m, w, 96, 1);
		/* both free ends reach their own target at the same delta; the last checked wins */
		expect(snap).toEqual({ delta: 100, point: { x: 300, y: 100 }, end: 'to' });
	});

	it('skips a welded end', () => {
		const w = wall('a', [0, 0], [300, 0]);
		const m = modelOf(w, wall('b', [0, 0], [0, -50]), wall('c', [300, 0], [300, -50]));
		expect(findPushSnap(m, w, 96, 1)).toBeNull();
	});

	it('refuses a candidate off the wall´s own axis', () => {
		const w = wall('a', [0, 0], [300, 0]);
		const m = modelOf(w, wall('b', [40, 100], [260, 100]));
		expect(findPushSnap(m, w, 96, 1)).toBeNull();
	});

	it('is never the wall´s own other end', () => {
		const w = wall('a', [0, 0], [0, 300]);
		expect(findPushSnap(modelOf(w), w, 0, 1)).toBeNull();
	});

	it('measures in screen px', () => {
		const w = wall('a', [0, 0], [300, 0]);
		const m = modelOf(w, wall('b', [0, 100], [300, 100]));
		expect(findPushSnap(m, w, 70, 1)).toBeNull();
		expect(findPushSnap(m, w, 70, 0.25)).not.toBeNull();
	});
});

describe('findCornerSnap', () => {
	it('excludes every vertex of the walls the corner itself moves', () => {
		const m = modelOf(wall('a', [0, 0], [300, 0]), wall('b', [300, 0], [300, 200]));
		/* dragging the corner at (300,0) back toward (0,0), a vertex of its own wall */
		expect(findCornerSnap(m, { x: 300, y: 0 }, -298, 0, 1)).toBeNull();
	});

	it('catches a vertex of another piece altogether', () => {
		const m = modelOf(
			wall('a', [0, 0], [300, 0]),
			wall('b', [300, 0], [300, 200]),
			wall('c', [500, 500], [800, 500])
		);
		expect(findCornerSnap(m, { x: 300, y: 0 }, 196, 496, 1)).toEqual({ x: 500, y: 500 });
		expect(findCornerSnap(m, { x: 300, y: 0 }, 150, 400, 1)).toBeNull();
	});
});
