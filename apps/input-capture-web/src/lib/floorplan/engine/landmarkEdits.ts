/**
 * The engine's side of landmarks: what blocks one, what a gap along its wall
 * stops at, whether its wall can hold it right now, where its square sits, and
 * the settling pass every path that moves a wall ends in.
 *
 * `landmarks.ts` owns the rules about one wall; this is what the model does
 * about them.
 */

import { LANDMARK_SIZE_CM, landmarkKindOf, type LandmarkKind } from '@urban-moon/domain-data';
import {
	WALL_THICKNESS_CM,
	findWall,
	landmarksOn,
	r,
	type EditorLandmark,
	type Ids,
	type LandmarkFace,
	type Model,
	type Point,
	type Wall
} from './model';
import { pointAlong, wallDir, wallLen, wallNormal } from './topology';
import { openSpansOf } from './openings';
import {
	marksAsBlockers,
	placeOnWall,
	settleOnWalls,
	showsOnWall,
	type Blocker
} from './landmarks';
import type { ChainObstacle } from './chain';

/**
 * The one wall length everything about a landmark is measured against: where it
 * may sit, how far it may travel, the chain the client reads and the gaps the
 * snapshot carries all use this, so the number in the manifest is the number
 * that was on screen.
 */
export function markWallLengthCm(w: Wall): number {
	return r(wallLen(w));
}

/**
 * What a landmark on this wall may not overlap: a stretch with nothing built,
 * and a landmark already on the same face.
 */
export function blockersFor(model: Model, w: Wall, face: LandmarkFace, exceptId: string | null): Blocker[] {
	return openSpansOf(w).concat(marksAsBlockers(model.landmarks || [], w.id, face, exceptId || null));
}

/** Everything a gap along this wall stops at, whichever face it is on. */
export function landmarkObstacles(model: Model, w: Wall, exceptId: string | null): ChainObstacle[] {
	const out: ChainObstacle[] = [];
	w.segments.forEach((s) => {
		if (s.kind === 'wall') return;
		out.push({ startCm: s.offsetFromStart, endCm: s.offsetFromStart + s.length.value });
	});
	landmarksOn(model, w.id).forEach((m) => {
		if (m.id === exceptId) return;
		out.push({ startCm: m.offsetFromStartCm, endCm: m.offsetFromStartCm + LANDMARK_SIZE_CM });
	});
	return out;
}

/** Whether a landmark's wall can hold it right now: only then is it drawn, touched or reported. */
export function landmarkShows(model: Model, m: EditorLandmark): boolean {
	const w = findWall(model, m.wallId);
	return !!w && showsOnWall({ lengthCm: markWallLengthCm(w), isOpen: !!w.isOpen });
}

/**
 * Every path that moves a wall ends here: a landmark settles back onto what its
 * wall still allows, and goes with a wall that is gone. A wall that no longer
 * holds it — shortened past the square, or turned into a side with nothing
 * built — keeps it: it stops being drawn and stops being reported, and comes
 * back at that wall's start when the wall can hold it again.
 *
 * The answer is whether the landmark in focus has left the canvas, so the
 * caller can end the focus; nothing here reads or writes the focus itself.
 */
export function settleLandmarks(model: Model, focusedId: string | null): boolean {
	const list = model.landmarks || [];
	if (list.length) {
		model.landmarks = settleOnWalls(list, (m) => {
			const w = findWall(model, m.wallId);
			if (!w) return null;
			return { lengthCm: markWallLengthCm(w), blockedSpans: openSpansOf(w) };
		}).map((m) => {
			m.offsetFromStartCm = r(m.offsetFromStartCm);
			return m;
		});
	}
	if (focusedId === null) return false;
	const focused = (model.landmarks || []).find((m) => m.id === focusedId) ?? null;
	return !focused || !landmarkShows(model, focused);
}

/** Where a landmark's square sits, in the world the plan is drawn in. */
export interface LandmarkGeom {
	wall: Wall;
	dir: Point;
	normal: Point;
	/** which side of the wall's normal the square is on */
	sign: 1 | -1;
	half: number;
	centre: Point;
}

export function landmarkGeom(model: Model, m: EditorLandmark): LandmarkGeom | null {
	const w = findWall(model, m.wallId);
	if (!w) return null;
	const d = wallDir(w);
	const n = wallNormal(w);
	const sign = m.face === 'out' ? -1 : 1;
	const half = LANDMARK_SIZE_CM / 2;
	const on = pointAlong(w, m.offsetFromStartCm + half);
	const out = WALL_THICKNESS_CM / 2 + half;
	return {
		wall: w,
		dir: d,
		normal: n,
		sign,
		half,
		centre: { x: on.x + n.x * sign * out, y: on.y + n.y * sign * out }
	};
}

export function landmarkLabel(kind: string): string {
	const entry = landmarkKindOf(kind);
	return entry ? entry.label : kind;
}

/**
 * The landmark a tap on this wall makes: a square on the room side, moved along
 * to the nearest stretch that is free, or nothing where the wall has none. It
 * is not added to the model here — the caller takes its history step first.
 */
export function placeLandmarkAt(
	model: Model,
	ids: Ids,
	kind: LandmarkKind,
	w: Wall,
	alongCm: number
): EditorLandmark | null {
	/* A new landmark goes on the room side, the same side a new door opens into
	   — the wall normal's own positive side. */
	const face: LandmarkFace = 'in';
	const offset = placeOnWall({
		wallLengthCm: markWallLengthCm(w),
		isOpen: !!w.isOpen,
		wantCentreCm: alongCm,
		blockers: blockersFor(model, w, face, null)
	});
	if (offset == null) return null;
	return { id: ids.next('mark'), kind, wallId: w.id, offsetFromStartCm: r(offset), face };
}
