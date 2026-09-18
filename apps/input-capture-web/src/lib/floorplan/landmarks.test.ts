import { describe, expect, it } from 'vitest';
import { LANDMARK_SIZE_CM } from '@urban-moon/domain-data';
import { RoomSnapshotSchema } from '@urban-moon/domain-data/schema';
import {
	clampToWall,
	entryOffsetCm,
	faceOfSide,
	fitsAt,
	freeStretches,
	gapsOf,
	landmarksOfModel,
	marksAsBlockers,
	placeOnWall,
	nearestFreeOffset,
	reassignOnMerge,
	reassignOnSplit,
	settleOnWalls,
	showsOnWall,
	slideOnWall,
	snapshotLandmarks,
	spanOf,
	toSnapshotLandmark,
	withoutWall,
	type EditorLandmark
} from './landmarks';

const SIZE = LANDMARK_SIZE_CM;

function mark(id: string, wallId: string, offsetFromStartCm: number, face: 'in' | 'out' = 'in'): EditorLandmark {
	return { id, kind: 'gas', wallId, offsetFromStartCm, face };
}

describe('placing on a wall', () => {
	it('centres the square on the tap', () => {
		expect(placeOnWall({ wallLengthCm: 400, isOpen: false, wantCentreCm: 200, blockers: [] })).toBe(
			200 - SIZE / 2
		);
	});

	it('moves it along just enough to fit when the tap lands near a corner', () => {
		expect(placeOnWall({ wallLengthCm: 400, isOpen: false, wantCentreCm: 5, blockers: [] })).toBe(0);
		expect(placeOnWall({ wallLengthCm: 400, isOpen: false, wantCentreCm: 398, blockers: [] })).toBe(
			400 - SIZE
		);
	});

	it('refuses a Fără perete side', () => {
		expect(placeOnWall({ wallLengthCm: 400, isOpen: true, wantCentreCm: 200, blockers: [] })).toBe(
			null
		);
	});

	it('moves along to the nearest free stretch when it would land on a landmark', () => {
		const there = spanOf(180); // 180..210
		const at = placeOnWall({
			wallLengthCm: 400,
			isOpen: false,
			wantCentreCm: 200,
			blockers: [there]
		});
		// edge to edge, on the side the tap was nearest to
		expect(at).toBe(210);
	});

	it('refuses when nothing on the wall is free', () => {
		const full = [{ startCm: 0, endCm: 400 }];
		expect(
			placeOnWall({ wallLengthCm: 400, isOpen: false, wantCentreCm: 200, blockers: full })
		).toBe(null);
	});

	it('takes none when the wall is shorter than the square', () => {
		expect(placeOnWall({ wallLengthCm: 20, isOpen: false, wantCentreCm: 10, blockers: [] })).toBe(
			null
		);
	});

	it('lets an opening pass: a radiator sits under a window', () => {
		// a window is never a blocker — only landmarks on the same face and
		// stretches with nothing built are
		const marks = [mark('m1', 'w1', 40, 'out')];
		expect(marksAsBlockers(marks, 'w1', 'in', null)).toEqual([]);
		expect(marksAsBlockers(marks, 'w1', 'out', null)).toEqual([spanOf(40)]);
		expect(marksAsBlockers(marks, 'w1', 'out', 'm1')).toEqual([]);
	});
});

describe('the free stretches of a wall', () => {
	it('is the whole wall less a square when nothing is on it', () => {
		expect(freeStretches(400, [])).toEqual([{ startCm: 0, endCm: 400 - SIZE }]);
	});

	it('leaves the room on each side of a landmark, touching it edge to edge', () => {
		expect(freeStretches(400, [spanOf(180)])).toEqual([
			{ startCm: 0, endCm: 150 },
			{ startCm: 210, endCm: 370 }
		]);
		expect(fitsAt(150, 400, [spanOf(180)])).toBe(true);
		expect(fitsAt(151, 400, [spanOf(180)])).toBe(false);
		expect(fitsAt(210, 400, [spanOf(180)])).toBe(true);
	});

	it('has none on a wall too short to hold one', () => {
		expect(freeStretches(20, [])).toEqual([]);
	});

	it('gives back the nearest offset that is free, or none at all', () => {
		expect(nearestFreeOffset(180, 400, [])).toBe(180);
		// blocked from 170 to 200: 140 leaves the square flush before it, 200 flush after
		expect(nearestFreeOffset(180, 400, [spanOf(170)])).toBe(200);
		expect(nearestFreeOffset(150, 400, [spanOf(170)])).toBe(140);
		expect(nearestFreeOffset(900, 400, [])).toBe(370);
		expect(nearestFreeOffset(180, 400, [{ startCm: 0, endCm: 400 }])).toBe(null);
		expect(nearestFreeOffset(10, 20, [])).toBe(null);
	});
});

describe('sliding along the wall', () => {
	it('follows the drag while the wall is clear', () => {
		expect(
			slideOnWall({ wantOffsetCm: 250, fromOffsetCm: 100, wallLengthCm: 400, blockers: [] })
		).toBe(250);
	});

	it('stops at the wall\'s own ends', () => {
		expect(
			slideOnWall({ wantOffsetCm: -50, fromOffsetCm: 100, wallLengthCm: 400, blockers: [] })
		).toBe(0);
		expect(
			slideOnWall({ wantOffsetCm: 900, fromOffsetCm: 100, wallLengthCm: 400, blockers: [] })
		).toBe(400 - SIZE);
	});

	it('stops against a landmark on the same face rather than jumping past it', () => {
		const blockers = [spanOf(200)];
		expect(
			slideOnWall({ wantOffsetCm: 300, fromOffsetCm: 40, wallLengthCm: 400, blockers })
		).toBe(170);
		expect(
			slideOnWall({ wantOffsetCm: 10, fromOffsetCm: 300, wallLengthCm: 400, blockers })
		).toBe(230);
	});
});

describe('coming round a corner', () => {
	it('measures from the end it entered by, whichever way the run reads the wall', () => {
		// a 400 cm wall: entering at its own start puts it at 0, at its own end
		// at the last offset that fits
		expect(entryOffsetCm(SIZE / 2, 400, true)).toBe(0);
		expect(entryOffsetCm(400 - SIZE / 2, 400, true)).toBe(400 - SIZE);
		expect(entryOffsetCm(SIZE / 2, 400, false)).toBe(400 - SIZE);
		expect(entryOffsetCm(400 - SIZE / 2, 400, false)).toBe(0);
	});

	it('still tells the two ends apart on a wall barely wider than the square', () => {
		// 40 cm of wall: the square's near edge only ever reaches 0..10, so the
		// middle is what says which corner it came through
		expect(entryOffsetCm(SIZE / 2, 40, true)).toBe(0);
		expect(entryOffsetCm(40 - SIZE / 2, 40, true)).toBe(10);
	});

	it('names an end it can reach even on a wall exactly one square wide', () => {
		expect(entryOffsetCm(SIZE / 2, SIZE, true)).toBe(0);
		expect(entryOffsetCm(SIZE / 2, SIZE, false)).toBe(0);
	});
});

describe('the face', () => {
	it('is the wall normal\'s own side, the one a door opening in uses', () => {
		expect(faceOfSide(12)).toBe('in');
		expect(faceOfSide(0)).toBe('in');
		expect(faceOfSide(-12)).toBe('out');
	});

	it('takes the other face only where it is free', () => {
		const blockers = [spanOf(200)];
		expect(fitsAt(200, 400, blockers)).toBe(false);
		expect(fitsAt(200, 400, [])).toBe(true);
	});
});

describe('following the wall', () => {
	it('clamps when the wall shortens, and stays put when it grows', () => {
		expect(clampToWall(360, 400)).toBe(360);
		expect(clampToWall(360, 300)).toBe(270);
		expect(clampToWall(-5, 300)).toBe(0);
	});

	it('goes to the piece its middle lands on when the wall is split', () => {
		const marks = [mark('a', 'w1', 20), mark('b', 'w1', 260), mark('c', 'w2', 10)];
		const out = reassignOnSplit(marks, 'w1', 200, { id: 'lead', lengthCm: 200 }, { id: 'tail', lengthCm: 200 });
		expect(out.map((m) => [m.id, m.wallId, m.offsetFromStartCm])).toEqual([
			['a', 'lead', 20],
			['b', 'tail', 60],
			['c', 'w2', 10]
		]);
	});

	it('keeps one whose piece is too short, clamped to its start and hidden', () => {
		// its middle sits past the cut, on a tail too short for a square
		const out = reassignOnSplit(
			[mark('a', 'w1', 195)],
			'w1',
			200,
			{ id: 'lead', lengthCm: 200 },
			{ id: 'tail', lengthCm: 10 }
		);
		expect(out.map((m) => [m.id, m.wallId, m.offsetFromStartCm])).toEqual([['a', 'tail', 0]]);
		expect(showsOnWall({ lengthCm: 10, isOpen: false })).toBe(false);
	});

	it('keeps its place past the seam when two walls merge', () => {
		const out = reassignOnMerge([mark('a', 'w2', 40), mark('b', 'w1', 10)], 'w2', 'w1', 300);
		expect(out.map((m) => [m.wallId, m.offsetFromStartCm])).toEqual([
			['w1', 340],
			['w1', 10]
		]);
	});

	it('goes with a wall that is deleted', () => {
		expect(withoutWall([mark('a', 'w1', 40), mark('b', 'w2', 40)], 'w1').map((m) => m.id)).toEqual([
			'b'
		]);
	});
});

describe('settling back onto what the walls still allow', () => {
	const plain = (lengthCm: number, blockedSpans: { startCm: number; endCm: number }[] = []) => ({
		lengthCm,
		blockedSpans
	});

	it('leaves alone what is already where it may be', () => {
		const marks = [mark('a', 'w1', 40), mark('b', 'w1', 200)];
		expect(settleOnWalls(marks, () => plain(400))).toEqual(marks);
	});

	it('keeps two on one face apart when their wall shortens under them', () => {
		// both would clamp to 170 on a 200 cm wall and sit on top of each other
		const marks = [mark('a', 'w1', 300), mark('b', 'w1', 340)];
		const out = settleOnWalls(marks, () => plain(200));
		expect(out.map((m) => m.offsetFromStartCm)).toEqual([170, 140]);
		expect(out[0].offsetFromStartCm - out[1].offsetFromStartCm).toBeGreaterThanOrEqual(SIZE);
	});

	it('leaves two on opposite faces where they are: only one face is shared', () => {
		const marks = [mark('a', 'w1', 300, 'in'), mark('b', 'w1', 340, 'out')];
		expect(settleOnWalls(marks, () => plain(200)).map((m) => m.offsetFromStartCm)).toEqual([
			170, 170
		]);
	});

	it('moves one off a stretch with nothing built, to the nearer side of it', () => {
		const open = [{ startCm: 80, endCm: 200 }];
		// sitting at 100, inside it: 50 leaves the square flush against its start
		expect(settleOnWalls([mark('a', 'w1', 100)], () => plain(400, open))[0].offsetFromStartCm).toBe(
			50
		);
		// sitting at 180, nearer its far end: 200 leaves it flush against that
		expect(settleOnWalls([mark('a', 'w1', 180)], () => plain(400, open))[0].offsetFromStartCm).toBe(
			200
		);
		expect(fitsAt(50, 400, open)).toBe(true);
		expect(fitsAt(200, 400, open)).toBe(true);
		expect(fitsAt(100, 400, open)).toBe(false);
	});

	it('settles two that a split left on one short piece', () => {
		const split = reassignOnSplit(
			[mark('a', 'w1', 210), mark('b', 'w1', 260)],
			'w1',
			200,
			{ id: 'lead', lengthCm: 200 },
			{ id: 'tail', lengthCm: 90 }
		);
		expect(split.map((m) => [m.wallId, m.offsetFromStartCm])).toEqual([
			['tail', 10],
			['tail', 60]
		]);
		const out = settleOnWalls(split, () => plain(90));
		expect(out.map((m) => m.offsetFromStartCm)).toEqual([10, 60]);
		expect(out[1].offsetFromStartCm - out[0].offsetFromStartCm).toBeGreaterThanOrEqual(SIZE);
	});

	it('runs to the same answer however many times it runs', () => {
		const once = settleOnWalls([mark('a', 'w1', 300), mark('b', 'w1', 340)], () => plain(200));
		const twice = settleOnWalls(once, () => plain(200));
		expect(twice).toEqual(once);
	});

	it('leaves one where it was clamped when the wall has no free stretch at all', () => {
		const out = settleOnWalls([mark('a', 'w1', 100)], () =>
			plain(400, [{ startCm: 0, endCm: 400 }])
		);
		expect(out[0].offsetFromStartCm).toBe(100);
	});

	it('clamps but does not shuffle a wall too short to hold one', () => {
		const out = settleOnWalls([mark('a', 'w1', 300), mark('b', 'w1', 340)], () => plain(20));
		expect(out.map((m) => m.offsetFromStartCm)).toEqual([0, 0]);
		expect(showsOnWall({ lengthCm: 20, isOpen: false })).toBe(false);
	});

	it('drops one whose wall is gone', () => {
		expect(settleOnWalls([mark('a', 'w1', 40)], () => null)).toEqual([]);
	});
});

describe('a wall that can no longer hold one', () => {
	it('holds one exactly as wide as the square, and nothing narrower', () => {
		expect(showsOnWall({ lengthCm: SIZE, isOpen: false })).toBe(true);
		expect(showsOnWall({ lengthCm: SIZE - 1, isOpen: false })).toBe(false);
	});

	it('holds none at all once it is a side with nothing built', () => {
		expect(showsOnWall({ lengthCm: 400, isOpen: true })).toBe(false);
	});

	it('keeps the landmark, clamped to its start, so shrinking is not an answer', () => {
		expect(clampToWall(180, 20)).toBe(0);
	});

	it('leaves it out of the snapshot while it does not fit, and carries it again after', () => {
		const marks = [mark('m1', 'w1', 180)];
		const snapshotOn = (lengthCm: number, isOpen = false) =>
			snapshotLandmarks(marks, () => ({ lengthCm, isOpen, obstacles: [] }));

		expect(snapshotOn(400).map((l) => [l.id, l.offsetFromStartCm, l.gapBeforeCm])).toEqual([
			['m1', 180, 180]
		]);
		// the wall is typed down past the square: hidden, and the model keeps it
		expect(snapshotOn(20)).toEqual([]);
		expect(marks[0].offsetFromStartCm).toBe(180);
		// turned into a side with nothing built: hidden the same way
		expect(snapshotOn(400, true)).toEqual([]);
		// and back: the client's answer is still there
		expect(snapshotOn(400).map((l) => l.id)).toEqual(['m1']);
	});

	it('leaves out only the one that does not fit', () => {
		const marks = [mark('short', 'w1', 0), mark('long', 'w2', 100)];
		const out = snapshotLandmarks(marks, (m) => ({
			lengthCm: m.wallId === 'w1' ? 20 : 400,
			isOpen: false,
			obstacles: []
		}));
		expect(out.map((l) => l.id)).toEqual(['long']);
	});

	it('leaves out one whose wall is gone', () => {
		expect(snapshotLandmarks([mark('m1', 'w1', 0)], () => null)).toEqual([]);
	});
});

describe('what the contract carries', () => {
	it('measures the gap to the first obstacle on each side', () => {
		// a 400 cm wall, a window from 40 to 100, the square at 200
		expect(gapsOf(200, 400, [{ startCm: 40, endCm: 100 }])).toEqual({
			gapBeforeCm: 100,
			gapAfterCm: 170
		});
	});

	it('reports zero where the square is flush against something', () => {
		expect(gapsOf(0, 400, [])).toEqual({ gapBeforeCm: 0, gapAfterCm: 370 });
	});

	it('stops at the jamb of the window it sits under, on both sides', () => {
		// a 400 cm wall, a 90 cm window from 160 to 250, the square at 170..200
		expect(gapsOf(170, 400, [{ startCm: 160, endCm: 250 }])).toEqual({
			gapBeforeCm: 10,
			gapAfterCm: 50
		});
	});

	it('stops at the one jamb it reaches over when it only half overlaps', () => {
		// the square at 230..260 against the same window
		expect(gapsOf(230, 400, [{ startCm: 160, endCm: 250 }])).toEqual({
			gapBeforeCm: 70,
			gapAfterCm: 140
		});
	});

	it('never reads a gap backwards, wherever the square sits under the window', () => {
		for (let offset = 0; offset <= 400 - SIZE; offset += 5) {
			const gaps = gapsOf(offset, 400, [{ startCm: 160, endCm: 250 }]);
			expect(gaps.gapBeforeCm).toBeGreaterThanOrEqual(0);
			expect(gaps.gapAfterCm).toBeGreaterThanOrEqual(0);
			expect(offset - gaps.gapBeforeCm).toBeGreaterThanOrEqual(0);
			expect(offset + SIZE + gaps.gapAfterCm).toBeLessThanOrEqual(400);
		}
	});

	it('builds a landmark the shared schema accepts', () => {
		const snapshotMark = toSnapshotLandmark(mark('mark1', 'wall1', 200), 400, [
			{ startCm: 40, endCm: 100 }
		]);
		const room = {
			unit: 'cm' as const,
			ceilingHeightCm: 260,
			closed: true,
			outline: [],
			walls: [
				{
					id: 'wall1',
					index: 0,
					from: [0, 0] as [number, number],
					to: [400, 0] as [number, number],
					heading: 'E' as const,
					lengthCm: { value: 400, source: 'typed' as const },
					segments: []
				}
			],
			openings: [],
			landmarks: [snapshotMark],
			unanswered: [],
			finished: true
		};
		expect(RoomSnapshotSchema.safeParse(room).success).toBe(true);
	});
});

describe('a model saved before landmarks existed', () => {
	it('loads with none', () => {
		expect(landmarksOfModel({ walls: [] })).toEqual([]);
		expect(landmarksOfModel(null)).toEqual([]);
		expect(landmarksOfModel({ walls: [], landmarks: [mark('a', 'w1', 10)] })).toHaveLength(1);
	});
});
