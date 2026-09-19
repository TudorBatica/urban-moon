import { describe, expect, it, vi } from 'vitest';
import {
	cleanupOutline,
	commitWallPieceLength,
	commitWallTotal,
	deleteSelection,
	dragCornerAtPoint,
	dragPushWall,
	extendWallAtEnd,
	forceSnapWeld,
	pushWallByRef,
	roundAllEndpoints,
	setWallLengthExact,
	splitWallAtPoint
} from './walls';
import {
	Ids,
	findSegAnywhere,
	findWall,
	type EditorLandmark,
	type Model,
	type Segment,
	type SegmentKind,
	type Wall
} from './model';
import { reflow, type IsFresh } from './openings';
import { wallLen } from './topology';

const NEVER_FRESH: IsFresh = () => false;
let n = 0;
function seg(kind: SegmentKind, value: number): Segment {
	return {
		id: 'sg' + ++n,
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
const shape = (m: Model) =>
	m.walls.map((w) => w.id + ':' + Math.round(wallLen(w)));

/** a room 400 x 300, drawn clockwise from the origin */
function room(): Model {
	return modelOf([
		wall('w1', [0, 0], [400, 0]),
		wall('w2', [400, 0], [400, 300]),
		wall('w3', [400, 300], [0, 300]),
		wall('w4', [0, 300], [0, 0])
	]);
}

describe('pushWallByRef', () => {
	it('moves the wall and takes its two corners with it, one hop and stop', () => {
		const m = room();
		pushWallByRef(m, m.walls[0], 50);
		expect(m.walls[0].from).toEqual({ x: 0, y: 50 });
		expect(m.walls[3].from).toEqual({ x: 0, y: 300 });
		expect(m.walls[3].to).toEqual({ x: 0, y: 50 });
		expect(Math.round(wallLen(m.walls[1]))).toBe(250);
	});

	it('does nothing at all for no movement', () => {
		const m = room();
		pushWallByRef(m, m.walls[0], 0);
		expect(m.walls[0].from).toEqual({ x: 0, y: 0 });
	});
});

describe('dragPushWall', () => {
	it('marks the neighbours it stretched as drawn, and repartitions them', () => {
		const m = room();
		dragPushWall(new Ids(), m, 'w1', 50, NEVER_FRESH);
		expect(m.walls[1].lengthSource).toBe('drawn');
		expect(m.walls[1].segments[0].length.value).toBe(250);
	});
});

describe('dragCornerAtPoint', () => {
	it('moves both walls of the corner, each along its own normal', () => {
		const m = room();
		dragCornerAtPoint(new Ids(), m, { x: 400, y: 0 }, -50, 20, NEVER_FRESH);
		expect(m.walls[0].to).toEqual({ x: 350, y: 20 });
		expect(m.walls[1].from).toEqual({ x: 350, y: 20 });
		expect(shape(m)).toEqual(['w1:350', 'w2:280', 'w3:350', 'w4:280']);
	});
});

describe('cleanupOutline', () => {
	it('drops a zero-length wall and heals the gap behind it', () => {
		const m = modelOf([
			wall('a', [0, 0], [100, 0]),
			wall('zero', [100, 0], [100, 0]),
			wall('b', [100, 0], [100, 100])
		]);
		cleanupOutline(new Ids(), m, NEVER_FRESH);
		expect(m.walls.map((w) => w.id)).toEqual(['a', 'b']);
	});

	it('takes the landmarks of a wall that goes with it', () => {
		const m = modelOf(
			[wall('a', [0, 0], [100, 0]), wall('zero', [100, 0], [100, 0])],
			[{ id: 'm1', kind: 'radiator', wallId: 'zero', offsetFromStartCm: 0, face: 'in' }]
		);
		cleanupOutline(new Ids(), m, NEVER_FRESH);
		expect(m.landmarks).toEqual([]);
	});

	it('merges two collinear walls, re-basing the landmarks of the one that goes', () => {
		const m = modelOf(
			[
				wall('a', [0, 0], [100, 0], [seg('wall', 100)]),
				wall('b', [100, 0], [250, 0], [seg('wall', 60), seg('window', 90)])
			],
			[{ id: 'm1', kind: 'radiator', wallId: 'b', offsetFromStartCm: 10, face: 'in' }]
		);
		cleanupOutline(new Ids(), m, NEVER_FRESH);
		expect(m.walls).toHaveLength(1);
		expect(m.walls[0].id).toBe('a');
		expect(m.walls[0].to).toEqual({ x: 250, y: 0 });
		/* the seam between two plain pieces is fused, so one straight run reads as one */
		expect(m.walls[0].segments.map((s) => s.kind + ':' + s.length.value)).toEqual([
			'wall:160',
			'window:90'
		]);
		expect(m.walls[0].lengthSource).toBe('computed');
		expect(m.landmarks[0]).toMatchObject({ wallId: 'a', offsetFromStartCm: 110 });
	});

	it('leaves two walls of different headings alone', () => {
		const m = room();
		cleanupOutline(new Ids(), m, NEVER_FRESH);
		expect(m.walls).toHaveLength(4);
	});
});

describe('splitWallAtPoint', () => {
	it('cuts the wall in two at the point, both halves addressable', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 150), seg('door', 90), seg('wall', 160)])]);
		const split = splitWallAtPoint(new Ids(), m, 'a', { x: 200, y: 0 });
		expect(split?.point).toEqual({ x: 200, y: 0 });
		expect(m.walls.map((w) => w.id)).toEqual([split?.leadId, split?.tailId]);
		expect(m.walls[0].segments.map((s) => s.kind + ':' + s.length.value)).toEqual([
			'wall:150',
			'door:50'
		]);
		expect(m.walls[1].segments.map((s) => s.kind + ':' + s.length.value)).toEqual([
			'door:40',
			'wall:160'
		]);
	});

	it('takes the landmarks on it to the piece each one´s middle lands on', () => {
		const m = modelOf(
			[wall('a', [0, 0], [400, 0])],
			[
				{ id: 'm1', kind: 'radiator', wallId: 'a', offsetFromStartCm: 20, face: 'in' },
				{ id: 'm2', kind: 'water', wallId: 'a', offsetFromStartCm: 300, face: 'in' }
			]
		);
		const split = splitWallAtPoint(new Ids(), m, 'a', { x: 200, y: 0 });
		expect(m.landmarks[0]).toMatchObject({ wallId: split?.leadId, offsetFromStartCm: 20 });
		expect(m.landmarks[1]).toMatchObject({ wallId: split?.tailId, offsetFromStartCm: 100 });
	});

	it('says nothing of a wall that is not there', () => {
		expect(splitWallAtPoint(new Ids(), modelOf([]), 'nope', { x: 0, y: 0 })).toBeNull();
	});
});

describe('setWallLengthExact', () => {
	it('extends a free end on its own, changing nothing else', () => {
		const m = modelOf([wall('a', [0, 0], [300, 0])]);
		setWallLengthExact(new Ids(), m, 'a', 400, 'typed', NEVER_FRESH);
		expect(m.walls[0].to).toEqual({ x: 400, y: 0 });
		expect(m.walls[0].segments[0].length.value).toBe(400);
	});

	it('pushes the neighbour one hop where the far end is welded', () => {
		const m = room();
		setWallLengthExact(new Ids(), m, 'w1', 500, 'typed', NEVER_FRESH);
		expect(m.walls[0].to).toEqual({ x: 500, y: 0 });
		expect(m.walls[1].from).toEqual({ x: 500, y: 0 });
		expect(m.walls[1].to).toEqual({ x: 500, y: 300 });
		expect(Math.round(wallLen(m.walls[2]))).toBe(500);
	});

	it('leaves the outline alone for the length it already has', () => {
		const m = room();
		setWallLengthExact(new Ids(), m, 'w1', 400, 'typed', NEVER_FRESH);
		expect(m.walls[0].to).toEqual({ x: 400, y: 0 });
		expect(m.walls[0].lengthSource).toBe('typed');
	});
});

describe('commitWallPieceLength and commitWallTotal', () => {
	it('a piece´s own number grows the wall', () => {
		const m = room();
		const pieceId = m.walls[0].segments[0].id;
		const res = commitWallPieceLength(new Ids(), m, pieceId, 500, 'typed', NEVER_FRESH, () => {});
		expect(res).toEqual({ ok: true });
		expect(Math.round(wallLen(m.walls[0]))).toBe(500);
	});

	it('takes no step and reports nothing for the number it already says', () => {
		const m = room();
		const before = vi.fn();
		const res = commitWallPieceLength(new Ids(), m, m.walls[0].segments[0].id, 400, 'typed', NEVER_FRESH, before);
		expect(res).toEqual({ ok: true });
		expect(before).not.toHaveBeenCalled();
		expect(m.walls[0].segments[0].length.source).toBe('typed');
	});

	it('says the piece is not there rather than changing anything', () => {
		const m = room();
		expect(commitWallPieceLength(new Ids(), m, 'nope', 100, 'typed', NEVER_FRESH, () => {})).toEqual({
			ok: true,
			missing: true
		});
	});

	it('the wall total is refused below what the openings on it need', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 150), seg('door', 90), seg('wall', 160)])]);
		const before = vi.fn();
		const res = commitWallTotal(new Ids(), m, 'sg' + n, 50, 'typed', NEVER_FRESH, before);
		expect(res).toEqual({ ok: false, max: 90 });
		expect(before).not.toHaveBeenCalled();
	});
});

describe('extendWallAtEnd', () => {
	it('grows the end asked for, in whole cm, and says the wall was drawn', () => {
		const w = wall('a', [0, 0], [300, 0]);
		extendWallAtEnd(w, 'to', 40.4);
		expect(w.to).toEqual({ x: 340, y: 0 });
		extendWallAtEnd(w, 'from', 10);
		expect(w.from).toEqual({ x: -10, y: 0 });
		expect(w.lengthSource).toBe('drawn');
	});

	it('does nothing for no growth', () => {
		const w = wall('a', [0, 0], [300, 0]);
		extendWallAtEnd(w, 'to', 0);
		expect(w.to).toEqual({ x: 300, y: 0 });
	});
});

describe('deleteSelection', () => {
	it('the far end absorbs the piece removed, so nothing between them moves', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 150), seg('door', 90), seg('wall', 160)])]);
		const last = m.walls[0].segments[2].id;
		expect(deleteSelection(new Ids(), m, { segId: last }, NEVER_FRESH, () => {}, () => {})).toBe(true);
		expect(m.walls[0].to).toEqual({ x: 240, y: 0 });
		expect(m.walls[0].segments.map((s) => s.kind)).toEqual(['wall', 'door']);
	});

	it('removing the first piece moves the wall´s own start', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 150), seg('door', 250)])]);
		expect(deleteSelection(new Ids(), m, { segId: m.walls[0].segments[0].id }, NEVER_FRESH, () => {}, () => {})).toBe(true);
		expect(m.walls[0].from).toEqual({ x: 150, y: 0 });
	});

	it('an opening goes back to plain wall rather than shrinking it', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0], [seg('wall', 150), seg('door', 90), seg('wall', 160)])]);
		deleteSelection(new Ids(), m, { segId: m.walls[0].segments[1].id }, NEVER_FRESH, () => {}, () => {});
		expect(Math.round(wallLen(m.walls[0]))).toBe(400);
		expect(m.walls[0].segments.map((s) => s.kind)).toEqual(['wall']);
	});

	it('a wall´s only piece takes the wall with it', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0]), wall('b', [0, 0], [0, 200])]);
		deleteSelection(new Ids(), m, { segId: m.walls[0].segments[0].id }, NEVER_FRESH, () => {}, () => {});
		expect(m.walls.map((w) => w.id)).toEqual(['b']);
	});

	it('a landmark goes on its own, and nothing else is touched', () => {
		const m = modelOf(
			[wall('a', [0, 0], [400, 0])],
			[{ id: 'm1', kind: 'radiator', wallId: 'a', offsetFromStartCm: 10, face: 'in' }]
		);
		expect(deleteSelection(new Ids(), m, { landmarkId: 'm1' }, NEVER_FRESH, () => {}, () => {})).toBe(true);
		expect(m.landmarks).toEqual([]);
		expect(m.walls).toHaveLength(1);
	});

	it('releases the focus before it cleans up, so the piece the opening became can fuse', () => {
		/* A piece still in focus never merges. The plain piece a removed opening
		   becomes keeps that opening's own id, so the focus has to be gone by the
		   time the cleanup asks what may fuse into what. */
		const window = seg('window', 100);
		const m = modelOf([wall('a', [0, 0], [100, 0], [window]), wall('b', [100, 0], [300, 0])]);
		let focused: string | null = window.id;
		const isFresh: IsFresh = (s) => s.length.source === 'drawn' || s.id === focused;
		const released = deleteSelection(
			new Ids(),
			m,
			{ segId: window.id },
			isFresh,
			() => {},
			() => {
				focused = null;
			}
		);
		expect(released).toBe(true);
		expect(m.walls.map((w) => w.id)).toEqual(['a']);
		expect(m.walls[0].segments).toHaveLength(1);
		expect(Math.round(wallLen(m.walls[0]))).toBe(300);
	});

	it('does nothing, and takes no step, with nothing in focus or nothing there', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0])]);
		const before = vi.fn();
		expect(deleteSelection(new Ids(), m, null, NEVER_FRESH, before, () => {})).toBe(false);
		expect(deleteSelection(new Ids(), m, { segId: 'nope' }, NEVER_FRESH, before, () => {})).toBe(false);
		expect(deleteSelection(new Ids(), m, { landmarkId: 'nope' }, NEVER_FRESH, before, () => {})).toBe(false);
		expect(before).not.toHaveBeenCalled();
	});
});

describe('the release weld', () => {
	it('rounds every endpoint to whole cm', () => {
		const m = modelOf([wall('a', [0.4, -0.2], [299.6, 0.3])]);
		roundAllEndpoints(m);
		expect(m.walls[0].from).toEqual({ x: 0, y: -0 });
		expect(m.walls[0].to).toEqual({ x: 300, y: 0 });
	});

	it('puts a caught push end exactly on its target', () => {
		const m = modelOf([wall('a', [0, 0], [300, 0])]);
		forceSnapWeld(m, { kind: 'push', wallId: 'a', point: { x: 300, y: 7 }, end: 'to' });
		expect(m.walls[0].to).toEqual({ x: 300, y: 7 });
	});

	it('puts every wall end of a caught corner on the same point', () => {
		const m = modelOf([wall('a', [0, 0], [100, 0]), wall('b', [100, 0], [100, 100])]);
		forceSnapWeld(m, {
			kind: 'corner',
			point: { x: 120, y: 5 },
			touches: [
				{ wallId: 'a', end: 'to' },
				{ wallId: 'b', end: 'from' }
			]
		});
		expect(m.walls[0].to).toEqual({ x: 120, y: 5 });
		expect(m.walls[1].from).toEqual({ x: 120, y: 5 });
	});

	it('does nothing where no snap caught', () => {
		const m = modelOf([wall('a', [0, 0], [300, 0])]);
		forceSnapWeld(m, null);
		expect(m.walls[0].to).toEqual({ x: 300, y: 0 });
	});
});
