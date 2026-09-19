import { describe, expect, it } from 'vitest';
import {
	applyLandmarkSlide,
	applyOpeningSlide,
	arcOnRun,
	beginLandmarkRun,
	beginOpeningRun,
	entryFor,
	legAtArc,
	runPoints,
	runWallInputs,
	type OpeningDragState,
	type RunGrab
} from './run';
import { Ids, findSegAnywhere, type EditorLandmark, type Model, type Segment, type SegmentKind, type Wall } from './model';
import { reflow, type IsFresh } from './openings';
import { buildRun } from './slide';
import { wallLen } from './topology';

const NEVER_FRESH: IsFresh = () => false;
let n = 0;
function seg(kind: SegmentKind, value: number): Segment {
	return {
		id: 'rs' + ++n,
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
const modelOf = (walls: Wall[], landmarks: EditorLandmark[] = []): Model => ({ walls, landmarks });

describe('runWallInputs', () => {
	it('gives every wall its two ends as keys that match when the points do', () => {
		const m = modelOf([wall('a', [0, 0], [300, 0]), wall('b', [300, 0], [300, 200])]);
		expect(runWallInputs(m)).toEqual([
			{ id: 'a', lengthCm: 300, open: false, fromKey: '0,0', toKey: '300,0' },
			{ id: 'b', lengthCm: 200, open: false, fromKey: '300,0', toKey: '300,200' }
		]);
	});
});

describe('runPoints', () => {
	it('is the run´s corners in run order, whichever way each wall was drawn', () => {
		const m = modelOf([wall('a', [0, 0], [300, 0]), wall('b', [300, 200], [300, 0])]);
		const run = buildRun('a', runWallInputs(m));
		expect(run).not.toBeNull();
		expect(runPoints(m, run!)).toEqual([
			{ x: 0, y: 0 },
			{ x: 300, y: 0 },
			{ x: 300, y: 200 }
		]);
	});
});

describe('legAtArc and arcOnRun', () => {
	const pts = [
		{ x: 0, y: 0 },
		{ x: 300, y: 0 },
		{ x: 300, y: 200 }
	];

	it('names the leg an arc falls on', () => {
		expect(legAtArc(pts, 100)).toBe(0);
		expect(legAtArc(pts, 350)).toBe(1);
		expect(legAtArc(pts, 9999)).toBe(1);
	});

	it('with no previous answer the whole run is open to the search', () => {
		expect(arcOnRun(pts, { x: 300, y: 150 }, null, false)).toBe(450);
	});

	it('stays on the leg the drag was on and its neighbours', () => {
		/* four legs; a pointer over the far one is not reachable from the first */
		const square = [
			{ x: 0, y: 0 },
			{ x: 300, y: 0 },
			{ x: 300, y: 300 },
			{ x: 0, y: 300 },
			{ x: 0, y: 0 }
		];
		expect(arcOnRun(square, { x: 150, y: 300 }, 1150, false)).toBe(750);
		/* asking from the first leg, the same point is read as the nearest place on
		   the legs within reach — the far one is not one of them */
		expect(arcOnRun(square, { x: 150, y: 300 }, 10, false)).toBe(600);
	});

	it('wraps round a closed run, so the last leg neighbours the first', () => {
		const ring = [
			{ x: 0, y: 0 },
			{ x: 300, y: 0 },
			{ x: 300, y: 300 },
			{ x: 0, y: 300 },
			{ x: 0, y: 0 }
		];
		expect(arcOnRun(ring, { x: 0, y: 150 }, 10, true)).toBe(1050);
	});

	it('reads past either outer end of an open run, which is how a piece gets past a free end', () => {
		expect(arcOnRun(pts, { x: -40, y: 0 }, 10, false)).toBe(-40);
		expect(arcOnRun(pts, { x: 300, y: 260 }, 450, false)).toBe(560);
	});

	it('keeps the answer it had where no leg is within reach', () => {
		expect(arcOnRun([{ x: 0, y: 0 }], { x: 5, y: 5 }, 123, false)).toBe(0);
	});
});

describe('entryFor', () => {
	it('finds the wall in the run, or nothing', () => {
		const m = modelOf([wall('a', [0, 0], [300, 0]), wall('b', [300, 0], [300, 200])]);
		const run = buildRun('a', runWallInputs(m))!;
		expect(entryFor(run, 'b')?.forward).toBe(true);
		expect(entryFor(run, 'nope')).toBeNull();
	});
});

describe('beginOpeningRun', () => {
	it('fixes the run, the grab and the piece´s own middle', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 100), seg('door', 90), seg('wall', 210)])]);
		const grab = beginOpeningRun(m, 'a', m.walls[0].segments[1].id, { x: 140, y: 5 });
		expect(grab?.grabArc).toBe(140);
		expect(grab?.centreArc0).toBe(145);
		expect(grab?.lastArc).toBe(140);
		expect(grab?.run?.walls.map((w) => w.id)).toEqual(['a']);
	});

	it('is nothing where the piece or its wall is gone', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0])]);
		expect(beginOpeningRun(m, 'a', 'nope', { x: 0, y: 0 })).toBeNull();
		expect(beginOpeningRun(m, 'gone', 'nope', { x: 0, y: 0 })).toBeNull();
	});
});

function openingDrag(m: Model, wallId: string, segId: string, startCm: { x: number; y: number }) {
	const grab = beginOpeningRun(m, wallId, segId, startCm);
	if (!grab) throw new Error('no run');
	const ds: OpeningDragState = { ...grab, wallId, segId };
	return ds;
}

describe('applyOpeningSlide', () => {
	it('moves the opening along its own wall', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 100), seg('door', 90), seg('wall', 210)])]);
		const door = m.walls[0].segments[1].id;
		const ds = openingDrag(m, 'a', door, { x: 145, y: 0 });
		const out = applyOpeningSlide(new Ids(), m, ds, { x: 245, y: 0 }, NEVER_FRESH);
		expect(out).toEqual({ segId: door, pastFreeEnd: false });
		expect(findSegAnywhere(m, door)?.seg.offsetFromStart).toBe(200);
	});

	it('re-makes the opening on the next wall as its middle passes the corner', () => {
		const m = modelOf([
			wall('a', [0, 0], [400, 0], [seg('wall', 100), seg('door', 90), seg('wall', 210)]),
			wall('b', [400, 0], [400, 400])
		]);
		const door = m.walls[0].segments[1].id;
		const ds = openingDrag(m, 'a', door, { x: 145, y: 0 });
		const out = applyOpeningSlide(new Ids(), m, ds, { x: 400, y: 100 }, NEVER_FRESH);
		expect(out?.segId).not.toBe(door);
		expect(findSegAnywhere(m, out?.segId ?? '')?.wall.id).toBe('b');
		expect(out?.pastFreeEnd).toBe(false);
		/* the wall it left is plain again, and its own length is untouched */
		expect(m.walls[0].segments.map((s) => s.kind)).toEqual(['wall']);
		expect(Math.round(wallLen(m.walls[0]))).toBe(400);
	});

	it('keeps it on its own wall where the neighbour has no room', () => {
		const m = modelOf([
			wall('a', [0, 0], [400, 0], [seg('wall', 100), seg('door', 90), seg('wall', 210)]),
			wall('b', [400, 0], [400, 40])
		]);
		const door = m.walls[0].segments[1].id;
		const ds = openingDrag(m, 'a', door, { x: 145, y: 0 });
		const out = applyOpeningSlide(new Ids(), m, ds, { x: 400, y: 20 }, NEVER_FRESH);
		expect(out?.segId).toBe(door);
		expect(findSegAnywhere(m, door)?.wall.id).toBe('a');
		expect(findSegAnywhere(m, door)?.seg.offsetFromStart).toBe(310);
	});

	it('grows the wall past its free end, by whole cm', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 100), seg('door', 90), seg('wall', 210)])]);
		const door = m.walls[0].segments[1].id;
		const ds = openingDrag(m, 'a', door, { x: 145, y: 0 });
		const out = applyOpeningSlide(new Ids(), m, ds, { x: 450.5, y: 0 }, NEVER_FRESH);
		expect(out?.pastFreeEnd).toBe(true);
		expect(m.walls[0].to.x % 1).toBe(0);
		expect(m.walls[0].to.x).toBeGreaterThan(400);
		/* the opening ends up flush with the end that grew */
		const found = findSegAnywhere(m, out?.segId ?? '');
		expect(found?.seg.offsetFromStart).toBe(Math.round(wallLen(m.walls[0])) - 90);
	});

	it('says nothing where the piece or the run is gone', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 100), seg('door', 90), seg('wall', 210)])]);
		const ds = openingDrag(m, 'a', m.walls[0].segments[1].id, { x: 145, y: 0 });
		const stale: OpeningDragState = { ...ds, segId: 'gone' };
		expect(applyOpeningSlide(new Ids(), m, stale, { x: 200, y: 0 }, NEVER_FRESH)).toBeNull();
	});
});

function landmarkDrag(m: Model, landmarkId: string, startCm: { x: number; y: number }) {
	const grab = beginLandmarkRun(m, landmarkId, startCm);
	if (!grab) throw new Error('no run');
	const ds: RunGrab & { landmarkId: string } = { ...grab, landmarkId };
	return ds;
}
const MARK = (wallId: string, offsetFromStartCm: number): EditorLandmark => ({
	id: 'm1',
	kind: 'radiator',
	wallId,
	offsetFromStartCm,
	face: 'in'
});

describe('applyLandmarkSlide', () => {
	it('slides the square along its wall', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0])], [MARK('a', 100)]);
		const ds = landmarkDrag(m, 'm1', { x: 115, y: 5 });
		applyLandmarkSlide(m, ds, { x: 215, y: 5 });
		expect(m.landmarks[0].offsetFromStartCm).toBe(200);
	});

	it('turns onto the other face when the finger crosses the wall', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0])], [MARK('a', 100)]);
		const ds = landmarkDrag(m, 'm1', { x: 115, y: 5 });
		applyLandmarkSlide(m, ds, { x: 115, y: -5 });
		expect(m.landmarks[0].face).toBe('out');
	});

	it('stays on its own face where the other one has no room there', () => {
		const m = modelOf(
			[wall('a', [0, 0], [400, 0])],
			[MARK('a', 100), { id: 'm2', kind: 'water', wallId: 'a', offsetFromStartCm: 90, face: 'out' }]
		);
		const ds = landmarkDrag(m, 'm1', { x: 115, y: 5 });
		applyLandmarkSlide(m, ds, { x: 115, y: -5 });
		expect(m.landmarks[0].face).toBe('in');
	});

	it('refuses to travel onto a wall too short to hold it', () => {
		const m = modelOf(
			[wall('a', [0, 0], [400, 0]), wall('b', [400, 0], [400, 20])],
			[MARK('a', 360)]
		);
		const ds = landmarkDrag(m, 'm1', { x: 375, y: 5 });
		applyLandmarkSlide(m, ds, { x: 400, y: 15 });
		expect(m.landmarks[0].wallId).toBe('a');
	});

	it('travels round a corner onto a wall that can hold it', () => {
		const m = modelOf(
			[wall('a', [0, 0], [400, 0]), wall('b', [400, 0], [400, 400])],
			[MARK('a', 360)]
		);
		const ds = landmarkDrag(m, 'm1', { x: 375, y: 5 });
		applyLandmarkSlide(m, ds, { x: 395, y: 100 });
		expect(m.landmarks[0].wallId).toBe('b');
	});

	it('does nothing where the landmark is gone', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0])], [MARK('a', 100)]);
		const ds = landmarkDrag(m, 'm1', { x: 115, y: 5 });
		applyLandmarkSlide(m, { ...ds, landmarkId: 'gone' }, { x: 215, y: 5 });
		expect(m.landmarks[0].offsetFromStartCm).toBe(100);
	});
});
