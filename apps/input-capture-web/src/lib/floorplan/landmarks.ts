/**
 * Where a landmark sits on a wall, and everything that moves it: placing it
 * under a tap, sliding it along the wall, turning it to the other face, and
 * following its wall when that wall is resized, split, merged or deleted.
 *
 * Pure: cm along one wall in, cm out. The engine owns the model, the geometry
 * of the run and the pointer; it hands over only the wall this answer is about.
 */

import { LANDMARK_SIZE_CM, type LandmarkKind, type RoomLandmark } from '@urban-moon/domain-data';
import { chainOfPiece, type ChainObstacle } from './chain';

export type LandmarkFace = 'in' | 'out';

/** A landmark as the editor's own model holds it. */
export interface EditorLandmark {
	id: string;
	kind: LandmarkKind;
	wallId: string;
	/** from the wall's `from` to the square's near edge */
	offsetFromStartCm: number;
	face: LandmarkFace;
}

/** A stretch of wall a landmark may not overlap, in cm from the wall's start. */
export interface Blocker {
	startCm: number;
	endCm: number;
}

/** The two cm bounds of a landmark placed at `offsetCm`. */
export function spanOf(offsetCm: number): Blocker {
	return { startCm: offsetCm, endCm: offsetCm + LANDMARK_SIZE_CM };
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/** The landmarks of a model, as a model saved before they existed has none. */
export function landmarksOfModel(model: unknown): EditorLandmark[] {
	if (!model || typeof model !== 'object') return [];
	const list = (model as { landmarks?: unknown }).landmarks;
	return Array.isArray(list) ? (list as EditorLandmark[]) : [];
}

/** The landmarks on one face of one wall, as blockers; the one being moved is left out. */
export function marksAsBlockers(
	marks: readonly EditorLandmark[],
	wallId: string,
	face: LandmarkFace,
	exceptId: string | null
): Blocker[] {
	return marks
		.filter((m) => m.wallId === wallId && m.face === face && m.id !== exceptId)
		.map((m) => spanOf(m.offsetFromStartCm));
}

/** A landmark never hangs off its wall: the last offset that still fits. */
export function clampToWall(offsetCm: number, wallLengthCm: number): number {
	return clamp(offsetCm, 0, Math.max(0, wallLengthCm - LANDMARK_SIZE_CM));
}

/**
 * The stretches of the wall a landmark's near edge may sit at: the whole wall
 * less the room each blocker needs, one square wide. Two landmarks that touch
 * edge to edge do not overlap, so the intervals are closed at both ends.
 */
export function freeStretches(wallLengthCm: number, blockers: readonly Blocker[]): Blocker[] {
	const last = wallLengthCm - LANDMARK_SIZE_CM;
	if (last < 0) return [];
	const taken = blockers
		.map((b) => ({ startCm: b.startCm - LANDMARK_SIZE_CM, endCm: b.endCm }))
		.filter((b) => b.endCm > 0 && b.startCm < last)
		.sort((a, b) => a.startCm - b.startCm);
	const out: Blocker[] = [];
	let cursor = 0;
	for (const b of taken) {
		if (b.startCm > cursor) out.push({ startCm: cursor, endCm: Math.min(b.startCm, last) });
		cursor = Math.max(cursor, b.endCm);
		if (cursor > last) break;
	}
	if (cursor <= last) out.push({ startCm: cursor, endCm: last });
	return out;
}

/** The landmark fits at this offset: on the wall, and clear of every blocker. */
export function fitsAt(
	offsetCm: number,
	wallLengthCm: number,
	blockers: readonly Blocker[]
): boolean {
	if (offsetCm < 0 || offsetCm + LANDMARK_SIZE_CM > wallLengthCm) return false;
	return freeStretches(wallLengthCm, blockers).some(
		(s) => offsetCm >= s.startCm && offsetCm <= s.endCm
	);
}

/** The offset nearest the one asked for that is on the wall and clear of every blocker. */
export function nearestFreeOffset(
	offsetCm: number,
	wallLengthCm: number,
	blockers: readonly Blocker[]
): number | null {
	const stretches = freeStretches(wallLengthCm, blockers);
	if (!stretches.length) return null;
	let best: number | null = null;
	let bestD = Infinity;
	for (const s of stretches) {
		const at = clamp(offsetCm, s.startCm, s.endCm);
		const d = Math.abs(at - offsetCm);
		if (d < bestD) {
			bestD = d;
			best = at;
		}
	}
	return best;
}

export interface PlaceInput {
	wallLengthCm: number;
	/** a Fără perete side: a landmark never goes on one */
	isOpen: boolean;
	/** where along the wall the tap landed, in cm from its start */
	wantCentreCm: number;
	blockers: readonly Blocker[];
}

/**
 * Where a tap on a wall puts a new landmark: centred on the tap, moved along
 * just enough to fit the wall, and moved on again to the nearest free stretch
 * when it would land on a landmark already there. A wall with nowhere free
 * takes none.
 */
export function placeOnWall(input: PlaceInput): number | null {
	if (input.isOpen) return null;
	const want = Math.round(input.wantCentreCm - LANDMARK_SIZE_CM / 2);
	return nearestFreeOffset(want, input.wallLengthCm, input.blockers);
}

export interface SlideInput {
	wantOffsetCm: number;
	/** where the landmark is now on this wall, or the end it has just come round */
	fromOffsetCm: number;
	wallLengthCm: number;
	blockers: readonly Blocker[];
}

/**
 * How far a dragged landmark gets: along its own free stretch, stopping
 * against the landmark at either end of it rather than jumping past. The
 * stretch is the one it is already in, so a landmark never crosses another
 * one to reach the room beyond it.
 */
export function slideOnWall(input: SlideInput): number {
	const stretches = freeStretches(input.wallLengthCm, input.blockers);
	if (!stretches.length) return clampToWall(input.wantOffsetCm, input.wallLengthCm);
	const from = clampToWall(input.fromOffsetCm, input.wallLengthCm);
	let home = stretches[0];
	let bestD = Infinity;
	for (const s of stretches) {
		const d = Math.abs(clamp(from, s.startCm, s.endCm) - from);
		if (d < bestD) {
			bestD = d;
			home = s;
		}
	}
	return clamp(input.wantOffsetCm, home.startCm, home.endCm);
}

/**
 * Which face a pointer is asking for: the wall's own normal points at the
 * `in` side, the one a door with `swing: 'in'` opens into.
 */
export function faceOfSide(signedNormalCm: number): LandmarkFace {
	return signedNormalCm >= 0 ? 'in' : 'out';
}

/**
 * Where a landmark that has just come round a corner onto this wall entered
 * it, as the offset its free stretch is measured from. The answer is read off
 * the square's middle rather than its near edge: the edge cannot reach the
 * far half of a wall barely wider than the square, so it would name the same
 * end whichever corner the landmark arrived through. `forward` is whether the
 * run reads this wall from its own start.
 */
export function entryOffsetCm(
	centreInRunOrderCm: number,
	wallLengthCm: number,
	forward: boolean
): number {
	const atRunStart = centreInRunOrderCm < wallLengthCm / 2;
	const atOwnStart = atRunStart === forward;
	return atOwnStart ? 0 : Math.max(0, wallLengthCm - LANDMARK_SIZE_CM);
}

/**
 * The gaps the contract carries: to the first obstacle on each side, zero
 * where there is none. Whole centimetres, like every other number the
 * snapshot reports, so what a reader prints is what the chain showed.
 */
export function gapsOf(
	offsetCm: number,
	wallLengthCm: number,
	obstacles: readonly ChainObstacle[]
): { gapBeforeCm: number; gapAfterCm: number } {
	const items = chainOfPiece({
		wallLengthCm,
		pieceStartCm: offsetCm,
		pieceEndCm: offsetCm + LANDMARK_SIZE_CM,
		obstacles: [...obstacles],
		pieceShowsNumber: false
	});
	const before = items.find((i) => i.kind === 'gap-before');
	const after = items.find((i) => i.kind === 'gap-after');
	return {
		gapBeforeCm: Math.round(before ? before.lengthCm : 0),
		gapAfterCm: Math.round(after ? after.lengthCm : 0)
	};
}

/** A wall as the settling pass reads it. */
export interface SettleWall {
	lengthCm: number;
	/** the wall's own no-go stretches, a Fără perete run inside it above all */
	blockedSpans: Blocker[];
}

/**
 * Puts a list of landmarks back where their walls allow, after something else
 * moved those walls: on the wall, off a stretch with nothing built, and clear
 * of the landmarks that share its face. Clamping alone cannot keep that last
 * rule — two landmarks on a wall that shortens both clamp to the same offset,
 * and a wall cut in two can leave two of them on one short piece — and nowhere
 * else in the system may two landmarks overlap on one face.
 *
 * Each is settled against the ones already settled, so the answer is the same
 * every time it runs; a landmark whose wall is gone goes with it, and one on a
 * wall with no free stretch at all stays where it was clamped.
 */
export function settleOnWalls(
	marks: readonly EditorLandmark[],
	wallOf: (mark: EditorLandmark) => SettleWall | null
): EditorLandmark[] {
	const out: EditorLandmark[] = [];
	for (const mark of marks) {
		const wall = wallOf(mark);
		if (!wall) continue;
		const clamped = clampToWall(mark.offsetFromStartCm, wall.lengthCm);
		if (wall.lengthCm < LANDMARK_SIZE_CM) {
			out.push({ ...mark, offsetFromStartCm: clamped });
			continue;
		}
		const blockers = [
			...wall.blockedSpans,
			...marksAsBlockers(out, mark.wallId, mark.face, mark.id)
		];
		const free = nearestFreeOffset(clamped, wall.lengthCm, blockers);
		out.push({ ...mark, offsetFromStartCm: free ?? clamped });
	}
	return out;
}

/** A wall as a landmark on it has to be read: how long it is, what it is, what is on it. */
export interface LandmarkWall {
	lengthCm: number;
	/** a Fără perete side */
	isOpen: boolean;
	/** everything along it a gap stops at, this landmark excluded */
	obstacles: ChainObstacle[];
}

/**
 * Whether a wall can hold a landmark right now. One shortened past the square,
 * or turned into a side with nothing built, keeps the landmarks already placed
 * on it — an edit elsewhere never throws the client's answer away — but shows
 * and reports none of them until it can hold them again.
 */
export function showsOnWall(wall: { lengthCm: number; isOpen: boolean }): boolean {
	return !wall.isOpen && wall.lengthCm >= LANDMARK_SIZE_CM;
}

/** One landmark in the shape the manifest and the architect's PDF read. */
export function toSnapshotLandmark(
	mark: EditorLandmark,
	wallLengthCm: number,
	obstacles: readonly ChainObstacle[]
): RoomLandmark {
	const gaps = gapsOf(mark.offsetFromStartCm, wallLengthCm, obstacles);
	return {
		id: mark.id,
		kind: mark.kind,
		wallId: mark.wallId,
		offsetFromStartCm: mark.offsetFromStartCm,
		face: mark.face,
		gapBeforeCm: gaps.gapBeforeCm,
		gapAfterCm: gaps.gapAfterCm
	};
}

/**
 * The landmarks the snapshot carries: the ones their wall can still hold, in
 * the contract's shape. A hidden one is left out rather than dropped, so it
 * comes back the moment its wall does — and so a snapshot never states a
 * landmark that does not fit the wall it names.
 */
export function snapshotLandmarks(
	marks: readonly EditorLandmark[],
	wallOf: (mark: EditorLandmark) => LandmarkWall | null
): RoomLandmark[] {
	const out: RoomLandmark[] = [];
	for (const mark of marks) {
		const wall = wallOf(mark);
		if (!wall || !showsOnWall(wall)) continue;
		out.push(toSnapshotLandmark(mark, wall.lengthCm, wall.obstacles));
	}
	return out;
}

export interface WallPiece {
	id: string;
	lengthCm: number;
}

/**
 * A wall cut in two takes its landmarks with it: each goes to the piece its
 * own middle lands on, rebased onto that piece. A piece too short to hold one
 * keeps it all the same, clamped to its start and hidden until the piece grows
 * back — the cut was not an answer about this landmark.
 */
export function reassignOnSplit(
	marks: readonly EditorLandmark[],
	wallId: string,
	splitAtCm: number,
	lead: WallPiece,
	tail: WallPiece
): EditorLandmark[] {
	return marks.map((m) => {
		if (m.wallId !== wallId) return m;
		const onLead = m.offsetFromStartCm + LANDMARK_SIZE_CM / 2 < splitAtCm;
		const piece = onLead ? lead : tail;
		const offset = onLead ? m.offsetFromStartCm : m.offsetFromStartCm - splitAtCm;
		return { ...m, wallId: piece.id, offsetFromStartCm: clampToWall(offset, piece.lengthCm) };
	});
}

/**
 * Two walls fused into one: the landmarks of the wall that went keep their
 * place, measured from the surviving wall's own start.
 */
export function reassignOnMerge(
	marks: readonly EditorLandmark[],
	fromWallId: string,
	intoWallId: string,
	shiftCm: number
): EditorLandmark[] {
	return marks.map((m) =>
		m.wallId === fromWallId
			? { ...m, wallId: intoWallId, offsetFromStartCm: m.offsetFromStartCm + shiftCm }
			: m
	);
}

/** A wall's landmarks go with it, the way its windows and doors do. */
export function withoutWall(
	marks: readonly EditorLandmark[],
	wallId: string
): EditorLandmark[] {
	return marks.filter((m) => m.wallId !== wallId);
}
