import { describe, expect, it } from 'vitest';
import { LANDMARK_SIZE_CM } from '@urban-moon/domain-data';
import {
	blockersFor,
	landmarkGeom,
	landmarkLabel,
	landmarkObstacles,
	landmarkShows,
	markWallLengthCm,
	placeLandmarkAt,
	settleLandmarks
} from './landmarkEdits';
import {
	Ids,
	type EditorLandmark,
	type LandmarkFace,
	type Model,
	type Segment,
	type SegmentKind,
	type Wall
} from './model';
import { reflow } from './openings';

let n = 0;
function seg(kind: SegmentKind, value: number): Segment {
	return {
		id: 's' + ++n,
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
function wallOf(id: string, segs: Segment[], isOpen = false): Wall {
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
function mark(id: string, wallId: string, offsetFromStartCm: number, face: LandmarkFace = 'in'): EditorLandmark {
	return { id, kind: 'radiator', wallId, offsetFromStartCm, face };
}
const modelOf = (walls: Wall[], landmarks: EditorLandmark[] = []): Model => ({ walls, landmarks });

describe('markWallLengthCm', () => {
	it('is the wall´s own geometric length in whole cm', () => {
		const w = wallOf('a', [seg('wall', 100)]);
		w.to = { x: 100.4, y: 0 };
		expect(markWallLengthCm(w)).toBe(100);
	});
});

describe('blockersFor', () => {
	it('is the Fără perete spans and the landmarks of the same face only', () => {
		const w = wallOf('a', [seg('wall', 50), seg('open', 30), seg('window', 40), seg('wall', 80)]);
		const m = modelOf([w], [mark('m1', 'a', 10, 'in'), mark('m2', 'a', 150, 'out')]);
		expect(blockersFor(m, w, 'in', null)).toEqual([
			{ startCm: 50, endCm: 80 },
			{ startCm: 10, endCm: 10 + LANDMARK_SIZE_CM }
		]);
		expect(blockersFor(m, w, 'out', null)).toEqual([
			{ startCm: 50, endCm: 80 },
			{ startCm: 150, endCm: 150 + LANDMARK_SIZE_CM }
		]);
	});

	it('leaves out the landmark being moved', () => {
		const w = wallOf('a', [seg('wall', 200)]);
		const m = modelOf([w], [mark('m1', 'a', 10)]);
		expect(blockersFor(m, w, 'in', 'm1')).toEqual([]);
	});
});

describe('landmarkObstacles', () => {
	it('is everything but plain wall, on either face, the landmark itself excluded', () => {
		const w = wallOf('a', [seg('wall', 50), seg('window', 40), seg('wall', 110)]);
		const m = modelOf([w], [mark('m1', 'a', 120, 'in'), mark('m2', 'a', 20, 'out')]);
		expect(landmarkObstacles(m, w, 'm1')).toEqual([
			{ startCm: 50, endCm: 90 },
			{ startCm: 20, endCm: 50 }
		]);
	});
});

describe('landmarkShows', () => {
	it('needs a wall that is there, long enough, and not a Fără perete side', () => {
		const ok = wallOf('a', [seg('wall', 60)]);
		const shortWall = wallOf('b', [seg('wall', 20)]);
		const open = wallOf('c', [seg('open', 200)], true);
		const m = modelOf([ok, shortWall, open]);
		expect(landmarkShows(m, mark('m', 'a', 0))).toBe(true);
		expect(landmarkShows(m, mark('m', 'b', 0))).toBe(false);
		expect(landmarkShows(m, mark('m', 'c', 0))).toBe(false);
		expect(landmarkShows(m, mark('m', 'gone', 0))).toBe(false);
	});
});

describe('settleLandmarks', () => {
	it('keeps a hidden landmark, clamped, so it comes back when its wall does', () => {
		const m = modelOf([wallOf('a', [seg('wall', 20)])], [mark('m1', 'a', 15)]);
		expect(settleLandmarks(m, null)).toBe(false);
		expect(m.landmarks).toEqual([mark('m1', 'a', 0)]);
	});

	it('drops one whose wall is gone', () => {
		const m = modelOf([wallOf('a', [seg('wall', 200)])], [mark('m1', 'a', 10), mark('m2', 'gone', 10)]);
		settleLandmarks(m, null);
		expect(m.landmarks.map((x) => x.id)).toEqual(['m1']);
	});

	it('separates two that a shortened wall clamped onto one spot', () => {
		const m = modelOf(
			[wallOf('a', [seg('wall', 200)])],
			[mark('m1', 'a', 190), mark('m2', 'a', 195)]
		);
		settleLandmarks(m, null);
		expect(m.landmarks.map((x) => x.offsetFromStartCm)).toEqual([170, 140]);
	});

	it('moves one off a stretch with nothing built', () => {
		const m = modelOf([wallOf('a', [seg('wall', 60), seg('open', 60), seg('wall', 60)])], [mark('m1', 'a', 70)]);
		settleLandmarks(m, null);
		expect(m.landmarks[0].offsetFromStartCm).toBe(30);
	});

	it('says the focused landmark has left the canvas only when it has', () => {
		const m = modelOf([wallOf('a', [seg('wall', 200)])], [mark('m1', 'a', 10)]);
		expect(settleLandmarks(m, 'm1')).toBe(false);
		expect(settleLandmarks(m, 'gone')).toBe(true);
		const hidden = modelOf([wallOf('a', [seg('wall', 20)])], [mark('m1', 'a', 0)]);
		expect(settleLandmarks(hidden, 'm1')).toBe(true);
		/* it is kept all the same: nothing here throws the client´s answer away */
		expect(hidden.landmarks).toHaveLength(1);
	});

	it('rounds every offset to whole cm', () => {
		const m = modelOf([wallOf('a', [seg('wall', 200)])], [mark('m1', 'a', 10.6)]);
		settleLandmarks(m, null);
		expect(m.landmarks[0].offsetFromStartCm).toBe(11);
	});
});

describe('landmarkGeom', () => {
	it('puts the square against the wall´s band, on the face it is on', () => {
		const m = modelOf([wallOf('a', [seg('wall', 200)])], [mark('m1', 'a', 100)]);
		const inside = landmarkGeom(m, m.landmarks[0]);
		expect(inside?.centre).toEqual({ x: 115, y: 25 });
		expect(inside?.half).toBe(15);
		const outside = landmarkGeom(m, mark('m2', 'a', 100, 'out'));
		expect(outside?.centre).toEqual({ x: 115, y: -25 });
		expect(outside?.sign).toBe(-1);
	});

	it('is nothing without a wall', () => {
		expect(landmarkGeom(modelOf([]), mark('m', 'gone', 0))).toBeNull();
	});
});

describe('landmarkLabel', () => {
	it('is the catalog´s own word, or the kind where there is none', () => {
		expect(landmarkLabel('radiator')).toBe('Calorifer');
		expect(landmarkLabel('nothing')).toBe('nothing');
	});
});

describe('placeLandmarkAt', () => {
	it('centres the square on the tap, on the room side', () => {
		const m = modelOf([wallOf('a', [seg('wall', 200)])]);
		expect(placeLandmarkAt(m, new Ids(), 'water', m.walls[0], 100)).toEqual({
			id: 'mark1',
			kind: 'water',
			wallId: 'a',
			offsetFromStartCm: 85,
			face: 'in'
		});
	});

	it('moves it along to the nearest free stretch, and refuses a wall with none', () => {
		const w = wallOf('a', [seg('wall', 200)]);
		const m = modelOf([w], [mark('m1', 'a', 80)]);
		expect(placeLandmarkAt(m, new Ids(), 'water', w, 100)?.offsetFromStartCm).toBe(110);
		const full = modelOf([wallOf('b', [seg('wall', 35)])], [mark('m1', 'b', 0)]);
		expect(placeLandmarkAt(full, new Ids(), 'water', full.walls[0], 10)).toBeNull();
	});

	it('never puts one on a Fără perete side', () => {
		const m = modelOf([wallOf('a', [seg('open', 200)], true)]);
		expect(placeLandmarkAt(m, new Ids(), 'water', m.walls[0], 100)).toBeNull();
	});

	it('does not add it to the model: the caller takes its history step first', () => {
		const m = modelOf([wallOf('a', [seg('wall', 200)])]);
		placeLandmarkAt(m, new Ids(), 'water', m.walls[0], 100);
		expect(m.landmarks).toEqual([]);
	});
});
