import { describe, expect, it } from 'vitest';
import {
	CHIP_HALF_H_PX,
	DIM_LINE_OUT_PX,
	allDims,
	chipAnchor,
	chipAlongPx,
	chipHalfCrossPx,
	dimAnchor,
	dimLineParts,
	liveDim,
	segHitWidthCm,
	wallAxis,
	wallOnScreen
} from './dims';
import type { DragState } from './dragState';
import type { Model, Segment, SegmentKind, Wall } from './model';
import { reflow } from './openings';

let n = 0;
function seg(kind: SegmentKind, value: number): Segment {
	return {
		id: 'dm' + ++n,
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
const BOX = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };

/** a room 400 x 300 with a door on its south wall */
function room(): Model {
	return {
		walls: [
			wall('w1', [0, 0], [400, 0]),
			wall('w2', [400, 0], [400, 300]),
			wall('w3', [400, 300], [0, 300], [seg('wall', 150), seg('door', 90), seg('wall', 160)]),
			wall('w4', [0, 300], [0, 0])
		],
		landmarks: []
	};
}

describe('the chip lane', () => {
	it('reads a wall´s axis, and how much room a chip takes along and across it', () => {
		const h = wall('h', [0, 0], [400, 0]);
		const v = wall('v', [0, 0], [0, 400]);
		expect(wallAxis(h)).toBe('horizontal');
		expect(wallAxis(v)).toBe('vertical');
		expect(chipAlongPx(h)).toBe(80);
		expect(chipAlongPx(v)).toBe(32);
		expect(chipHalfCrossPx(h)).toBe(22);
		expect(chipHalfCrossPx(v)).toBe(46);
	});

	it('a wall´s hit width never goes under 14 cm however close the zoom', () => {
		expect(segHitWidthCm(1)).toBe(48);
		expect(segHitWidthCm(10)).toBe(14);
	});
});

describe('wallOnScreen', () => {
	it('is what the visible area reaches, with the wall´s own thickness of slack', () => {
		const w = wall('a', [500, 0], [900, 0]);
		expect(wallOnScreen(w, { minX: 0, maxX: 400, minY: -100, maxY: 100 })).toBe(false);
		expect(wallOnScreen(w, { minX: 0, maxX: 490, minY: -100, maxY: 100 })).toBe(true);
	});
});

describe('allDims at rest', () => {
	it('is one number per wall on screen, and none for a wall that is not', () => {
		const m = room();
		expect(allDims(m, null, 'plan', 1, BOX).map((d) => d.testid)).toEqual([
			'dim-w1',
			'dim-w2',
			'dim-w3',
			'dim-w4'
		]);
		const narrow = allDims(m, null, 'plan', 1, { minX: -50, maxX: 50, minY: -50, maxY: 500 });
		expect(narrow.map((d) => d.testid)).toEqual(['dim-w1', 'dim-w3', 'dim-w4']);
	});

	it('states the wall´s own length, who said it, and what typing it does', () => {
		const dim = allDims(room(), null, 'plan', 1, BOX)[0];
		expect(dim.value).toBe(400);
		expect(dim.source).toBe('drawn');
		expect(dim.readOnly).toBe(false);
		expect(dim.commit).toEqual({ kind: 'wallTotal', wallId: 'w1' });
		expect(dim.outCm).toBe(10 + DIM_LINE_OUT_PX);
	});

	it('is read-only, with nothing to commit, on the landmark step', () => {
		const dims = allDims(room(), null, 'landmarks', 1, BOX);
		expect(dims.every((d) => d.readOnly && d.commit === null)).toBe(true);
	});

	it('frames the wall of the piece in focus', () => {
		const m = room();
		const dims = allDims(m, { segId: m.walls[0].segments[0].id }, 'plan', 1, BOX);
		expect(dims.find((d) => d.testid === 'dim-w1')?.tone).toBe('primary');
		expect(dims.find((d) => d.testid === 'dim-w2')?.tone).toBe('side');
	});
});

describe('allDims with a chain', () => {
	it('the chain replaces the focused wall´s own number', () => {
		const m = room();
		const door = m.walls[2].segments[1].id;
		const dims = allDims(m, { segId: door }, 'plan', 1, BOX);
		expect(dims.map((d) => d.testid)).toEqual([
			'dim-w1',
			'dim-w2',
			'chain-gap-before',
			'chain-piece',
			'chain-gap-after',
			'dim-w4'
		]);
	});

	it('only the piece carries a commit; the gaps are what the drawing says', () => {
		const m = room();
		const door = m.walls[2].segments[1].id;
		const chain = allDims(m, { segId: door }, 'plan', 1, BOX).filter((d) => d.inChain);
		expect(chain.map((d) => d.value)).toEqual([150, 90, 160]);
		expect(chain.map((d) => d.readOnly)).toEqual([true, false, true]);
		expect(chain[1].commit).toEqual({ kind: 'segment', wallId: 'w3', segId: door });
		expect(chain[1].label).toBe('lățime');
		expect(chain[0].commit).toBeNull();
	});

	it('a landmark´s own piece carries no number at all', () => {
		const m = room();
		m.landmarks = [
			{ id: 'm1', kind: 'radiator', wallId: 'w1', offsetFromStartCm: 100, face: 'in' }
		];
		const chain = allDims(m, { landmarkId: 'm1' }, 'plan', 1, BOX).filter((d) => d.inChain);
		expect(chain.map((d) => d.value)).toEqual([100, null, 270]);
		expect(chain.every((d) => d.commit === null)).toBe(true);
	});
});

describe('liveDim', () => {
	const m = room();
	const base = {
		committed: true,
		startClientX: 0,
		startClientY: 0,
		startCm: { x: 0, y: 0 }
	};

	it('rides a draw stroke', () => {
		const drag = {
			...base,
			kind: 'draw',
			tool: 'wall',
			startPt: { x: 0, y: 0 },
			startSnap: null,
			endPoint: { x: 250, y: 0 }
		} as DragState;
		expect(liveDim(m, drag, 1)?.value).toBe(250);
	});

	it('rides a free-end resize, reading the wall itself', () => {
		const drag = {
			...base,
			kind: 'resize',
			wallId: 'w1',
			movingEnd: 'to',
			fixedEnd: 'from',
			heading: 'E',
			startPt: { x: 400, y: 0 }
		} as DragState;
		expect(liveDim(m, drag, 1)?.value).toBe(400);
	});

	it('rides a jamb drag, reading that one piece´s own two edges', () => {
		const drag = {
			...base,
			kind: 'openingEdge',
			wallId: 'w3',
			segId: m.walls[2].segments[1].id,
			edge: 'end'
		} as DragState;
		expect(liveDim(m, drag, 1)?.value).toBe(90);
	});

	it('is nothing for any other gesture, or before one commits', () => {
		expect(liveDim(m, null, 1)).toBeNull();
		expect(liveDim(m, { ...base, kind: 'pan', lastClientX: 0, lastClientY: 0 } as DragState, 1)).toBeNull();
		expect(
			liveDim(
				m,
				{ ...base, committed: false, kind: 'draw', tool: 'wall', startPt: { x: 0, y: 0 }, startSnap: null, endPoint: { x: 9, y: 0 } } as DragState,
				1
			)
		).toBeNull();
	});
});

describe('the anchors', () => {
	const dim = {
		a: { x: 0, y: 0 },
		b: { x: 400, y: 0 },
		normal: { x: 0, y: -1 },
		outCm: 24
	};

	it('the line sits over the middle of what it measures', () => {
		expect(dimAnchor(dim)).toEqual({ x: 200, y: -24 });
	});

	it('the chip takes its own lane where it has one, and the line´s where it has not', () => {
		expect(chipAnchor(dim)).toEqual({ x: 200, y: -24 });
		expect(chipAnchor({ ...dim, chipOutCm: 60 })).toEqual({ x: 200, y: -60 });
	});

	it('a chip pushed along the wall moves with it', () => {
		expect(chipAnchor({ ...dim, chipOutCm: 60, chipShiftCm: 30 })).toEqual({ x: 230, y: -60 });
	});
});

describe('dimLineParts', () => {
	it('draws the two extension lines, the run and a tick at each end', () => {
		const parts = dimLineParts(
			{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, normal: { x: 0, y: -1 }, outCm: 20 },
			1
		);
		expect(parts.ext).toBe('M0 0 L0 -26 M100 0 L100 -26');
		expect(parts.line).toBe('M0 -20 L100 -20');
		expect(parts.ticks).toContain('M');
	});

	it('the overshoot and the ticks are screen px, so they keep their size at every zoom', () => {
		const at = (scale: number) =>
			dimLineParts({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, normal: { x: 0, y: -1 }, outCm: 20 }, scale);
		expect(at(2).ext).toBe('M0 0 L0 -23 M100 0 L100 -23');
	});
});

describe('the chip size estimates', () => {
	it('count the invisible hit box a chip´s input overflows to', () => {
		expect(CHIP_HALF_H_PX).toBe(22);
	});
});
