import { describe, expect, it } from 'vitest';
import {
	DOOR_SWING_COMBOS,
	addOpening,
	bestFlexSegmentFor,
	cycleDoorSwing,
	defaultDoorSwing,
	dropZero,
	flexRun,
	mergeAdjacentPlain,
	moveOpeningToWall,
	openSpansOf,
	openingAtFreeEnd,
	reflow,
	removeSegmentToWall,
	resizeSegment,
	resizeWallKeepingSegments,
	setSegHinge,
	setSegSill,
	setSegSwing,
	sliceSegments,
	slideSegment,
	syncSegments,
	type IsFresh
} from './openings';
import {
	Ids,
	findSeg,
	findSegAnywhere,
	type LengthSource,
	type Model,
	type Segment,
	type SegmentKind,
	type Wall
} from './model';
import { segTotal } from './topology';

const NEVER_FRESH: IsFresh = () => false;
const DEFAULTS = { windowWidth: 60, sill: 90 };

let n = 0;
function seg(kind: SegmentKind, value: number, source: LengthSource = 'computed'): Segment {
	return {
		id: 's' + ++n,
		kind,
		length: { value, source },
		offsetFromStart: 0,
		sill: null,
		hinge: null,
		hingeSource: null,
		swing: null,
		swingSource: null
	};
}
function wallOf(segs: Segment[], isOpen = false, id = 'w1'): Wall {
	const total = segs.reduce((a, s) => a + s.length.value, 0);
	const w: Wall = {
		id,
		from: { x: 0, y: 0 },
		to: { x: total, y: 0 },
		lengthSource: 'drawn',
		isOpen,
		segments: segs
	};
	reflow(w);
	return w;
}
const modelOf = (...walls: Wall[]): Model => ({ walls, landmarks: [] });
const shape = (w: Wall) => w.segments.map((s) => s.kind + ':' + s.length.value);

describe('reflow', () => {
	it('lays the offsets back end to end', () => {
		const w = wallOf([seg('wall', 30), seg('door', 90), seg('wall', 40)]);
		expect(w.segments.map((s) => s.offsetFromStart)).toEqual([0, 30, 120]);
	});
});

describe('mergeAdjacentPlain', () => {
	it('fuses two plain pieces of the same kind and keeps a source both agree on', () => {
		const w = wallOf([seg('wall', 30, 'typed'), seg('wall', 40, 'typed')]);
		mergeAdjacentPlain(w, NEVER_FRESH);
		expect(shape(w)).toEqual(['wall:70']);
		expect(w.segments[0].length.source).toBe('typed');
	});

	it('downgrades mixed provenance to computed', () => {
		const w = wallOf([seg('wall', 30, 'typed'), seg('wall', 40, 'drawn')]);
		mergeAdjacentPlain(w, NEVER_FRESH);
		expect(w.segments[0].length.source).toBe('computed');
	});

	it('never merges a fresh piece', () => {
		const a = seg('wall', 30);
		const b = seg('wall', 40);
		const w = wallOf([a, b]);
		mergeAdjacentPlain(w, (s) => s.id === b.id);
		expect(shape(w)).toEqual(['wall:30', 'wall:40']);
	});

	it('leaves a wall and an open stretch apart, and never merges across an opening', () => {
		const w = wallOf([seg('wall', 30), seg('open', 20), seg('wall', 10)]);
		mergeAdjacentPlain(w, NEVER_FRESH);
		expect(shape(w)).toEqual(['wall:30', 'open:20', 'wall:10']);
	});
});

describe('dropZero', () => {
	it('drops the empty pieces and gives a wall with none one of its whole length', () => {
		const w = wallOf([seg('wall', 0), seg('door', 90), seg('wall', 0)]);
		w.to = { x: 90, y: 0 };
		dropZero(new Ids(), w, NEVER_FRESH);
		expect(shape(w)).toEqual(['door:90']);
		const empty = wallOf([seg('wall', 0)]);
		empty.to = { x: 120, y: 0 };
		dropZero(new Ids(), empty, NEVER_FRESH);
		expect(shape(empty)).toEqual(['wall:120']);
	});
});

describe('resizeWallKeepingSegments', () => {
	it('grows the last plain piece and downgrades what it typed', () => {
		const w = wallOf([seg('door', 90), seg('wall', 40, 'typed')]);
		resizeWallKeepingSegments(new Ids(), w, 180, NEVER_FRESH);
		expect(shape(w)).toEqual(['door:90', 'wall:90']);
		expect(w.segments[1].length.source).toBe('computed');
	});

	it('adds a plain piece where the last one is an opening', () => {
		const w = wallOf([seg('wall', 40), seg('door', 90)]);
		resizeWallKeepingSegments(new Ids(), w, 160, NEVER_FRESH);
		expect(shape(w)).toEqual(['wall:40', 'door:90', 'wall:30']);
	});

	it('shrinks from the far end, taking from each plain piece in turn', () => {
		const w = wallOf([seg('wall', 50), seg('door', 90), seg('wall', 60)]);
		resizeWallKeepingSegments(new Ids(), w, 130, NEVER_FRESH);
		expect(shape(w)).toEqual(['wall:40', 'door:90']);
	});
});

describe('syncSegments', () => {
	it('repartitions only the walls whose geometry no longer matches', () => {
		const a = wallOf([seg('wall', 100)], false, 'a');
		const b = wallOf([seg('wall', 100)], false, 'b');
		a.to = { x: 150, y: 0 };
		syncSegments(new Ids(), modelOf(a, b), NEVER_FRESH);
		expect(segTotal(a)).toBe(150);
		expect(segTotal(b)).toBe(100);
	});
});

describe('flexRun', () => {
	it('walks the unbroken run of plain pieces, and stops at an opening', () => {
		const w = wallOf([seg('wall', 10), seg('open', 20), seg('door', 90), seg('wall', 30)]);
		expect(flexRun(w, 0, 1).map((s) => s.length.value)).toEqual([10, 20]);
		expect(flexRun(w, 2, 1)).toEqual([]);
		expect(flexRun(w, 3, -1).map((s) => s.length.value)).toEqual([30]);
	});
});

describe('resizeSegment', () => {
	it('drains the run after the piece first, then the one before', () => {
		const w = wallOf([seg('wall', 40), seg('door', 90), seg('wall', 30)]);
		const m = modelOf(w);
		const res = resizeSegment(new Ids(), m, 'w1', w.segments[1].id, 140, 'typed', NEVER_FRESH);
		expect(res).toEqual({ ok: true, applied: 140 });
		expect(shape(w)).toEqual(['wall:20', 'door:140']);
		expect(segTotal(w)).toBe(160);
	});

	it('reports the most that fits when both runs are used up', () => {
		const w = wallOf([seg('wall', 10), seg('door', 90), seg('wall', 20)]);
		const m = modelOf(w);
		const res = resizeSegment(new Ids(), m, 'w1', w.segments[1].id, 200, 'typed', NEVER_FRESH);
		expect(res).toEqual({ ok: false, max: 120 });
		expect(segTotal(w)).toBe(120);
	});

	it('gives room back to the piece after it when it shrinks', () => {
		const w = wallOf([seg('wall', 40), seg('door', 90), seg('wall', 30)]);
		const m = modelOf(w);
		resizeSegment(new Ids(), m, 'w1', w.segments[1].id, 60, 'typed', NEVER_FRESH);
		expect(shape(w)).toEqual(['wall:40', 'door:60', 'wall:60']);
	});

	it('never goes under the opening floor, and says nothing about a piece that is not there', () => {
		const w = wallOf([seg('wall', 40), seg('door', 90), seg('wall', 30)]);
		const m = modelOf(w);
		resizeSegment(new Ids(), m, 'w1', w.segments[1].id, 2, 'typed', NEVER_FRESH);
		expect(w.segments[1].length.value).toBe(10);
		expect(resizeSegment(new Ids(), m, 'w1', 'nope', 50, 'typed', NEVER_FRESH)).toEqual({ ok: false });
	});
});

describe('slideSegment', () => {
	it('conserves the wall´s total', () => {
		const w = wallOf([seg('wall', 40), seg('door', 90), seg('wall', 30)]);
		const m = modelOf(w);
		const before = segTotal(w);
		slideSegment(new Ids(), m, 'w1', w.segments[1].id, 60, 'drawn', NEVER_FRESH);
		expect(segTotal(w)).toBe(before);
		expect(shape(w)).toEqual(['wall:60', 'door:90', 'wall:10']);
	});

	it('stops at the room there is, on either side', () => {
		const w = wallOf([seg('wall', 40), seg('door', 90), seg('wall', 30)]);
		const m = modelOf(w);
		slideSegment(new Ids(), m, 'w1', w.segments[1].id, 999, 'drawn', NEVER_FRESH);
		expect(shape(w)).toEqual(['wall:70', 'door:90']);
		slideSegment(new Ids(), m, 'w1', w.segments[1].id, 0, 'drawn', NEVER_FRESH);
		expect(shape(w)).toEqual(['door:90', 'wall:70']);
	});
});

describe('addOpening', () => {
	it('picks the plain piece nearest the tap and centres the opening on it', () => {
		const w = wallOf([seg('wall', 100), seg('door', 90), seg('wall', 100)]);
		const m = modelOf(w);
		const id = addOpening(new Ids(), m, 'w1', 'window', 250, DEFAULTS);
		expect(id).not.toBeNull();
		expect(shape(w)).toEqual(['wall:100', 'door:90', 'wall:30', 'window:60', 'wall:10']);
	});

	it('applies the carried width and sill', () => {
		const w = wallOf([seg('wall', 300)]);
		const m = modelOf(w);
		const id = addOpening(new Ids(), m, 'w1', 'window', 150, { windowWidth: 140, sill: 75 });
		const found = findSegAnywhere(m, id);
		expect(found?.seg.length.value).toBe(140);
		expect(found?.seg.sill).toEqual({ value: 75, source: 'computed' });
	});

	it('clamps the width to the piece it lands on', () => {
		const w = wallOf([seg('wall', 40), seg('door', 90), seg('wall', 200)]);
		const m = modelOf(w);
		addOpening(new Ids(), m, 'w1', 'window', 20, DEFAULTS);
		expect(shape(w)).toEqual(['window:40', 'door:90', 'wall:200']);
	});

	it('refuses where the nearest piece is under the opening floor', () => {
		const w = wallOf([seg('wall', 8)]);
		const m = modelOf(w);
		expect(addOpening(new Ids(), m, 'w1', 'door', 4, DEFAULTS)).toBeNull();
		expect(addOpening(new Ids(), m, 'nope', 'door', 4, DEFAULTS)).toBeNull();
	});

	it('names the pieces in the order they lie along the wall', () => {
		/* ids persist in the saved plan and the markup names every target by them,
		   so which piece gets which id is part of the model, not an accident */
		const w = wallOf([seg('wall', 300)]);
		const m = modelOf(w);
		const ids = new Ids();
		addOpening(ids, m, 'w1', 'door', 150, DEFAULTS);
		expect(w.segments.map((s) => s.kind + ':' + s.id)).toEqual([
			'wall:seg1',
			'door:seg2',
			'wall:seg3'
		]);
	});

	it('gives the opening the first id where nothing is left before it', () => {
		const w = wallOf([seg('wall', 90)]);
		const m = modelOf(w);
		const ids = new Ids();
		addOpening(ids, m, 'w1', 'door', 45, DEFAULTS);
		expect(w.segments.map((s) => s.kind + ':' + s.id)).toEqual(['door:seg1']);
	});

	it('hangs a new door on the first combo, as a guess', () => {
		const w = wallOf([seg('wall', 300)]);
		const m = modelOf(w);
		const id = addOpening(new Ids(), m, 'w1', 'door', 150, DEFAULTS);
		expect(findSegAnywhere(m, id)?.seg).toMatchObject({
			hinge: 'start',
			hingeSource: 'computed',
			swing: 'in',
			swingSource: 'computed'
		});
	});
});

describe('removeSegmentToWall', () => {
	it('fuses both sides and forgets everything the opening stated', () => {
		const w = wallOf([seg('wall', 40), seg('window', 90), seg('wall', 30)]);
		w.segments[1].sill = { value: 90, source: 'typed' };
		const m = modelOf(w);
		expect(removeSegmentToWall(m, 'w1', w.segments[1].id, NEVER_FRESH)).toBe(true);
		expect(shape(w)).toEqual(['wall:160']);
		expect(w.segments[0].sill).toBeNull();
	});

	it('turns the piece back into a Fără perete run on an open wall', () => {
		const w = wallOf([seg('open', 40), seg('door', 90)], true);
		const m = modelOf(w);
		removeSegmentToWall(m, 'w1', w.segments[1].id, NEVER_FRESH);
		expect(shape(w)).toEqual(['open:130']);
	});

	it('says nothing of a piece that is not there', () => {
		expect(removeSegmentToWall(modelOf(wallOf([seg('wall', 10)])), 'w1', 'x', NEVER_FRESH)).toBe(false);
	});
});

describe('bestFlexSegmentFor and moveOpeningToWall', () => {
	it('picks the nearest plain piece wide enough', () => {
		const w = wallOf([seg('wall', 30), seg('door', 90), seg('wall', 200)]);
		expect(bestFlexSegmentFor(w, 60, 0)?.length.value).toBe(200);
		expect(bestFlexSegmentFor(w, 300, 0)).toBeNull();
	});

	it('re-makes the opening on the other wall with everything it stated', () => {
		const a = wallOf([seg('wall', 40), seg('window', 90), seg('wall', 40)], false, 'a');
		a.segments[1].sill = { value: 75, source: 'typed' };
		a.segments[1].length.source = 'typed';
		const b = wallOf([seg('wall', 300)], false, 'b');
		const m = modelOf(a, b);
		const moved = moveOpeningToWall(new Ids(), m, 'a', a.segments[1].id, 'b', 150, NEVER_FRESH);
		expect(moved.ok).toBe(true);
		expect(shape(a)).toEqual(['wall:170']);
		const to = findSeg(m, 'b', moved.ok ? moved.newId : '');
		expect(to?.seg).toMatchObject({ kind: 'window', length: { value: 90, source: 'typed' } });
		expect(to?.seg.sill).toEqual({ value: 75, source: 'typed' });
	});

	it('names the re-made pieces in the order they lie along the wall too', () => {
		const a = wallOf([seg('wall', 40), seg('window', 90), seg('wall', 40)], false, 'a');
		const b = wallOf([seg('wall', 300)], false, 'b');
		const m = modelOf(a, b);
		const ids = new Ids();
		const moved = moveOpeningToWall(ids, m, 'a', a.segments[1].id, 'b', 150, NEVER_FRESH);
		expect(b.segments.map((s) => s.kind + ':' + s.id)).toEqual([
			'wall:seg1',
			'window:seg2',
			'wall:seg3'
		]);
		expect(moved.ok && moved.newId).toBe('seg2');
	});

	it('refuses its own wall, a wall that is not there, and one with no room', () => {
		const a = wallOf([seg('window', 90)], false, 'a');
		const b = wallOf([seg('wall', 20)], false, 'b');
		const m = modelOf(a, b);
		expect(moveOpeningToWall(new Ids(), m, 'a', a.segments[0].id, 'a', 0, NEVER_FRESH)).toEqual({ ok: false });
		expect(moveOpeningToWall(new Ids(), m, 'a', a.segments[0].id, 'z', 0, NEVER_FRESH)).toEqual({ ok: false });
		expect(moveOpeningToWall(new Ids(), m, 'a', a.segments[0].id, 'b', 0, NEVER_FRESH)).toEqual({ ok: false });
	});
});

describe('sliceSegments', () => {
	it('re-ids a trimmed clone only, and re-bases every offset to zero', () => {
		const ids = new Ids();
		const segs = wallOf([seg('wall', 50), seg('door', 90), seg('wall', 60)]).segments;
		const tail = sliceSegments(ids, segs, 100, 200);
		expect(tail.map((s) => s.kind + ':' + s.length.value + '@' + s.offsetFromStart)).toEqual([
			'door:40@0',
			'wall:60@40'
		]);
		expect(tail[0].id).not.toBe(segs[1].id);
		expect(tail[0].length.source).toBe('computed');
		expect(tail[1].id).toBe(segs[2].id);
	});

	it('gives a plain piece where the cut covers nothing', () => {
		const out = sliceSegments(new Ids(), [], 0, 70);
		expect(out.map((s) => s.kind + ':' + s.length.value)).toEqual(['wall:70']);
	});
});

describe('the door cycle', () => {
	it('walks the four combos from a null pair, and round again', () => {
		const w = wallOf([seg('door', 90)]);
		const m = modelOf(w);
		const seen = [];
		for (let i = 0; i < 5; i++) {
			cycleDoorSwing(m, 'w1', w.segments[0].id);
			seen.push(w.segments[0].hinge + '/' + w.segments[0].swing);
		}
		expect(seen).toEqual([
			'start/in',
			'end/in',
			'end/out',
			'start/out',
			'start/in'
		]);
		expect(w.segments[0].hingeSource).toBe('typed');
		expect(DOOR_SWING_COMBOS).toHaveLength(4);
	});

	it('a door made by the editor starts on the first combo as a guess', () => {
		const s = seg('door', 90);
		defaultDoorSwing(s);
		expect(s).toMatchObject({ hinge: 'start', swing: 'in', hingeSource: 'computed', swingSource: 'computed' });
	});
});

describe('what a piece states', () => {
	it('sills round to whole cm and hinges default to the client´s own word', () => {
		const w = wallOf([seg('window', 90)]);
		const m = modelOf(w);
		setSegSill(m, 'w1', w.segments[0].id, 74.6, 'typed');
		setSegHinge(m, 'w1', w.segments[0].id, 'end');
		setSegSwing(m, 'w1', w.segments[0].id, 'out', 'computed');
		expect(w.segments[0].sill).toEqual({ value: 75, source: 'typed' });
		expect(w.segments[0]).toMatchObject({ hingeSource: 'typed', swingSource: 'computed' });
	});
});

describe('openSpansOf and openingAtFreeEnd', () => {
	it('reports only the stretches with nothing built', () => {
		const w = wallOf([seg('wall', 30), seg('open', 20), seg('window', 50)]);
		expect(openSpansOf(w)).toEqual([{ startCm: 30, endCm: 50 }]);
	});

	it('an opening is at a free end only where its own end of the wall is loose', () => {
		const a = wallOf([seg('door', 90), seg('wall', 60)], false, 'a');
		const b: Wall = { ...wallOf([seg('wall', 60)], false, 'b'), from: { x: 150, y: 0 }, to: { x: 150, y: 60 } };
		const m = modelOf(a, b);
		expect(openingAtFreeEnd(m, a, a.segments[0])).toBe(true);
		/* the other end of a carries b, so the last piece is not at a free end */
		expect(openingAtFreeEnd(m, a, a.segments[1])).toBe(false);
	});
});
