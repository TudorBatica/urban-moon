import { describe, expect, it, vi } from 'vitest';
import { commitDrawStroke, squareWeldToVertex } from './strokes';
import { Ids, findSegAnywhere, findWall, type Model, type Segment, type SegmentKind, type Wall } from './model';
import { reflow, type IsFresh } from './openings';

const NEVER_FRESH: IsFresh = () => false;
let n = 0;
function seg(kind: SegmentKind, value: number): Segment {
	return {
		id: 'st' + ++n,
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
const modelOf = (walls: Wall[]): Model => ({ walls, landmarks: [] });

describe('squareWeldToVertex', () => {
	it('is a no-op when the target is already on the stroke´s axis', () => {
		const m = modelOf([wall('a', [400, 0], [400, 300])]);
		const sq = squareWeldToVertex(m, { x: 400, y: 0 }, { x: 0, y: 0 }, 'E');
		expect(sq).toEqual({ ok: true, point: { x: 400, y: 0 }, changed: [] });
	});

	it('moves the vertex onto the axis and says which walls changed', () => {
		const m = modelOf([wall('a', [400, 6], [400, 300])]);
		const sq = squareWeldToVertex(m, { x: 400, y: 6 }, { x: 0, y: 0 }, 'E');
		expect(sq.ok).toBe(true);
		expect(m.walls[0].from).toEqual({ x: 400, y: 0 });
		expect(sq.ok && sq.changed.map((c) => [c.wall.id, c.before, c.after])).toEqual([['a', 294, 300]]);
	});

	it('refuses where a wall at the vertex runs the wrong way', () => {
		const m = modelOf([wall('a', [400, 6], [700, 6])]);
		expect(squareWeldToVertex(m, { x: 400, y: 6 }, { x: 0, y: 0 }, 'E')).toEqual({
			ok: false,
			reason: 'structural'
		});
	});

	it('refuses where the move would leave a wall shorter than its openings', () => {
		const m = modelOf([wall('a', [400, 95], [400, -200], [seg('door', 250), seg('wall', 45)])]);
		const sq = squareWeldToVertex(m, { x: 400, y: 95 }, { x: 0, y: 0 }, 'E');
		expect(sq.ok).toBe(false);
		expect(sq.ok === false && sq.reason).toBe('openings');
	});
});

describe('commitDrawStroke', () => {
	const stroke = (over: Partial<Parameters<typeof commitDrawStroke>[2]> = {}) => ({
		startPt: { x: 0, y: 0 },
		startSnap: null,
		endPt: { x: 300, y: 0 },
		endSnap: null,
		heading: 'E' as const,
		scale: 1,
		kind: 'wall' as const,
		...over
	});

	it('makes a wall and names the piece it made', () => {
		const m = modelOf([]);
		const before = vi.fn();
		const res = commitDrawStroke(new Ids(), m, stroke(), NEVER_FRESH, before);
		expect(res.made).toBe(true);
		expect(before).toHaveBeenCalledOnce();
		expect(findSegAnywhere(m, res.newSegId ?? null)?.wall.id).toBe(m.walls[0].id);
	});

	it('makes nothing, and takes no history step, below the structural floor', () => {
		const m = modelOf([]);
		const before = vi.fn();
		const res = commitDrawStroke(new Ids(), m, stroke({ endPt: { x: 0.5, y: 0 } }), NEVER_FRESH, before);
		expect(res).toEqual({ made: false, squareChanges: [] });
		expect(before).not.toHaveBeenCalled();
		expect(m.walls).toEqual([]);
	});

	it('makes nothing when the stroke was too small on screen to be deliberate', () => {
		const m = modelOf([]);
		const res = commitDrawStroke(
			new Ids(),
			m,
			stroke({ endPt: { x: 20, y: 0 }, scale: 0.25 }),
			NEVER_FRESH,
			() => {}
		);
		expect(res.made).toBe(false);
		/* the same stroke at a closer zoom is a wall */
		expect(
			commitDrawStroke(new Ids(), m, stroke({ endPt: { x: 20, y: 0 }, scale: 1 }), NEVER_FRESH, () => {})
				.made
		).toBe(true);
	});

	it('splits the wall a T-junction end landed on', () => {
		const m = modelOf([wall('a', [0, 0], [400, 0])]);
		commitDrawStroke(
			new Ids(),
			m,
			stroke({
				startPt: { x: 200, y: 200 },
				endPt: { x: 200, y: 0 },
				heading: 'N',
				endSnap: { kind: 'tjunction', wallId: 'a' }
			}),
			NEVER_FRESH,
			() => {}
		);
		expect(m.walls).toHaveLength(3);
		expect(m.walls.some((w) => w.id === 'a')).toBe(false);
	});

	it('translates a free-start stroke onto an off-axis vertex, keeping its own length', () => {
		const m = modelOf([wall('a', [400, 6], [400, 300])]);
		const res = commitDrawStroke(
			new Ids(),
			m,
			stroke({ endPt: { x: 400, y: 6 }, endSnap: { kind: 'end' } }),
			NEVER_FRESH,
			() => {}
		);
		const made = m.walls[m.walls.length - 1];
		expect(made.from).toEqual({ x: 0, y: 6 });
		expect(made.to).toEqual({ x: 400, y: 6 });
		expect(res.squareChanges).toEqual([]);
	});

	it('squares the target when both ends are welded, and says what it changed', () => {
		const m = modelOf([wall('a', [0, 0], [0, 300]), wall('b', [400, 6], [400, 300])]);
		const res = commitDrawStroke(
			new Ids(),
			m,
			stroke({ endPt: { x: 400, y: 6 }, endSnap: { kind: 'end' }, startSnap: { kind: 'end' } }),
			NEVER_FRESH,
			() => {}
		);
		expect(res.squareChanges).toEqual([{ wallId: 'b', heading: 'S', before: 294, after: 300 }]);
		expect(findWall(m, 'b')?.from).toEqual({ x: 400, y: 0 });
		expect(findWall(m, 'b')?.lengthSource).toBe('computed');
	});

	it('leaves the ends unjoined where neither way squares', () => {
		/* the wall at the target runs the same way as the stroke, so moving the
		   vertex would only make that one crooked instead */
		const m = modelOf([wall('a', [0, 0], [0, 300]), wall('b', [400, 6], [700, 6])]);
		const res = commitDrawStroke(
			new Ids(),
			m,
			stroke({ endPt: { x: 400, y: 6 }, endSnap: { kind: 'end' }, startSnap: { kind: 'end' } }),
			NEVER_FRESH,
			() => {}
		);
		expect(res.squareChanges).toEqual([]);
		const made = m.walls[m.walls.length - 1];
		expect(made.from).toEqual({ x: 0, y: 0 });
		expect(made.to).toEqual({ x: 400, y: 0 });
		expect(findWall(m, 'b')?.from).toEqual({ x: 400, y: 6 });
	});
});
