/**
 * An opening or a landmark travelling along a run of walls: along the wall,
 * round a joined corner as its middle passes it, and — for an opening — past a
 * free end, the wall growing behind it.
 *
 * `slide.ts` builds the run and says where along it the piece lands; this is
 * the world geometry that goes with it, and writing the answer into the model.
 * The run is taken once, when the drag commits, so a wall growing mid-drag
 * cannot move the ground under the gesture.
 */

import { LANDMARK_SIZE_CM } from '@urban-moon/domain-data';
import {
	clamp,
	dist,
	findLandmark,
	findSeg,
	findWall,
	pointKey,
	r,
	type Ids,
	type Model,
	type Point
} from './model';
import { pointAlong, wallLen, wallNormal } from './topology';
import {
	buildRun,
	extendEndOf,
	ownOffsetOf,
	placeAlongRun,
	type RunWall,
	type RunWallInput,
	type SlideRun
} from './slide';
import { moveOpeningToWall, slideSegment, syncSegments, type IsFresh } from './openings';
import { extendWallAtEnd } from './walls';
import { blockersFor, markWallLengthCm } from './landmarkEdits';
import { clampToWall, entryOffsetCm, faceOfSide, fitsAt, showsOnWall, slideOnWall } from './landmarks';

/** Every wall as slide.ts reads it: two ends that match exactly when the points do. */
export function runWallInputs(model: Model): RunWallInput[] {
	return model.walls.map((w) => ({
		id: w.id,
		lengthCm: r(wallLen(w)),
		open: !!w.isOpen,
		fromKey: pointKey(w.from),
		toKey: pointKey(w.to)
	}));
}

/** The run's corners in run order; a closed run ends back at its first point. */
export function runPoints(model: Model, run: SlideRun): Point[] {
	const pts: Point[] = [];
	run.walls.forEach((e, i) => {
		const w = findWall(model, e.id);
		if (!w) return;
		const a = e.forward ? w.from : w.to;
		const b = e.forward ? w.to : w.from;
		if (i === 0) pts.push({ x: a.x, y: a.y });
		pts.push({ x: b.x, y: b.y });
	});
	return pts;
}

/** Which leg of the run's polyline an arc falls on. */
export function legAtArc(pts: readonly Point[], arc: number): number {
	let acc = 0;
	for (let i = 0; i < pts.length - 2; i++) {
		acc += dist(pts[i], pts[i + 1]);
		if (arc < acc) return i;
	}
	return Math.max(0, pts.length - 2);
}

/**
 * How far along the run the pointer is asking for, in cm from its start. A
 * piece travels continuously, so the answer is looked for on the leg the drag
 * was on and the one either side of it only: in a room the whole ring is one
 * run, and a finger straying toward the far side would otherwise re-match to
 * the wall over there and take the piece with it.
 */
export function arcOnRun(pts: readonly Point[], pt: Point, nearArc: number | null, closed: boolean): number {
	const legs = pts.length - 1;
	if (legs < 1) return 0;
	/* No previous answer (the drag has just begun): the whole run is open to the
	   search, since what is being read off it is already on it. */
	const near = nearArc == null ? null : legAtArc(pts, nearArc);
	let best: { d: number; arc: number } | null = null;
	let arc = 0;
	for (let i = 0; i < legs; i++) {
		const a = pts[i];
		const b = pts[i + 1];
		const len = dist(a, b);
		let step = near == null ? 0 : Math.abs(i - near);
		if (closed && near != null) step = Math.min(step, legs - step);
		if (step <= 1 && len > 1e-9) {
			const raw = ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len);
			let tc = clamp(raw, 0, 1);
			const on = { x: a.x + (b.x - a.x) * tc, y: a.y + (b.y - a.y) * tc };
			const d = dist(pt, on);
			/* Past either outer end of an open run the pointer is still asking for a
			   place on it — which is how an opening gets to travel past a free end. */
			if (!closed && i === 0 && raw < 0) tc = raw;
			if (!closed && i === legs - 1 && raw > 1) tc = raw;
			if (best === null || d < best.d) best = { d, arc: arc + tc * len };
		}
		arc += len;
	}
	return best ? best.arc : nearArc || 0;
}

export function entryFor(run: SlideRun, wallId: string): RunWall | null {
	for (const w of run.walls) if (w.id === wallId) return w;
	return null;
}

/** The run, and where on it the drag began: both fixed at the moment it commits. */
export interface RunGrab {
	run: SlideRun | null;
	runPoints: Point[];
	grabArc: number;
	centreArc0: number;
	lastArc: number;
}

function grabAt(model: Model, wallId: string, centre: Point, startCm: Point): RunGrab {
	const run = buildRun(wallId, runWallInputs(model));
	const pts = run ? runPoints(model, run) : [];
	const closed = !!(run && run.closed);
	/* Both seeds are read off the whole run: the press and the piece's own middle
	   are on it already, so there is no previous answer to stay continuous with. */
	const grabArc = arcOnRun(pts, startCm, null, closed);
	return {
		run,
		runPoints: pts,
		grabArc,
		centreArc0: arcOnRun(pts, centre, null, closed),
		lastArc: grabArc
	};
}

export function beginOpeningRun(model: Model, wallId: string, segId: string, startCm: Point): RunGrab | null {
	const f = findSeg(model, wallId, segId);
	const w = findWall(model, wallId);
	if (!w || !f) return null;
	return grabAt(model, w.id, pointAlong(w, f.seg.offsetFromStart + f.seg.length.value / 2), startCm);
}

export function beginLandmarkRun(model: Model, landmarkId: string, startCm: Point): RunGrab | null {
	const mk = findLandmark(model, landmarkId);
	const mw = mk ? findWall(model, mk.wallId) : null;
	if (!mk || !mw) return null;
	return grabAt(model, mw.id, pointAlong(mw, mk.offsetFromStartCm + LANDMARK_SIZE_CM / 2), startCm);
}

/** What one move of an opening drag left behind: the piece it is now, and where it stands. */
export interface OpeningSlide {
	segId: string;
	/** the opening has travelled past the run's free end, growing the wall behind it */
	pastFreeEnd: boolean;
}

/** The drag's own record of an opening travelling, as one move reads and updates it. */
export interface OpeningDragState extends RunGrab {
	wallId: string;
	segId: string;
}

/**
 * One move of an opening drag, applied to the model the drag started from (the
 * caller restores it first), so nothing ever compounds and sliding back undoes
 * the wall it grew.
 */
export function applyOpeningSlide(
	ids: Ids,
	model: Model,
	ds: OpeningDragState,
	curCm: Point,
	isFresh: IsFresh
): OpeningSlide | null {
	const f = findSeg(model, ds.wallId, ds.segId);
	if (!ds.run || !f) return null;
	const width = f.seg.length.value;
	const arc = arcOnRun(ds.runPoints, curCm, ds.lastArc, ds.run.closed);
	ds.lastArc = arc;
	let place = placeAlongRun(ds.run, width, ds.centreArc0 + (arc - ds.grabArc));
	if (!place) return null;
	let entry = entryFor(ds.run, place.wallId);
	if (!entry) return null;
	let wallId = place.wallId;
	let segId = ds.segId;
	if (wallId !== ds.wallId) {
		const centreOwn = ownOffsetOf(entry, place, width) + width / 2;
		const moved = moveOpeningToWall(ids, model, ds.wallId, ds.segId, wallId, centreOwn, isFresh);
		if (moved.ok) {
			segId = moved.newId;
		} else {
			/* No room for it on the neighbour: it stays on its own wall, as far along
			   it as it can go. */
			entry = entryFor(ds.run, ds.wallId);
			if (!entry) return null;
			wallId = ds.wallId;
			place = placeAlongRun(
				{ walls: [entry], startFree: false, endFree: false, closed: false },
				width,
				ds.centreArc0 + (arc - ds.grabArc)
			);
			if (!place) return null;
		}
	}
	const w = findWall(model, wallId);
	if (!w) return null;
	/* Whole cm, so the wall's own ends stay on the grid every other gesture reads
	   them off; ownOffsetOf counts the growth in, so both agree. */
	place.extendCm = r(place.extendCm);
	const extendEnd = extendEndOf(entry, place);
	if (extendEnd) {
		extendWallAtEnd(w, extendEnd, place.extendCm);
		syncSegments(ids, model, isFresh);
	}
	slideSegment(ids, model, wallId, segId, ownOffsetOf(entry, place, width), 'drawn', isFresh);
	return { segId, pastFreeEnd: place.extendCm > 0 };
}

/**
 * One move of a landmark drag, on the model the drag began from. It travels the
 * same run an opening does — along the wall and round a joined corner as its
 * middle passes it — but never past a free end: a landmark has to fit inside
 * its wall. Along the way it stops against a landmark on its own face, and it
 * turns onto the other face the moment the finger crosses the wall.
 */
export function applyLandmarkSlide(model: Model, ds: RunGrab & { landmarkId: string }, curCm: Point): void {
	const m = findLandmark(model, ds.landmarkId);
	if (!m || !ds.run) return;
	const arc = arcOnRun(ds.runPoints, curCm, ds.lastArc, ds.run.closed);
	ds.lastArc = arc;
	const run: SlideRun = {
		walls: ds.run.walls,
		startFree: false,
		endFree: false,
		closed: ds.run.closed
	};
	const place = placeAlongRun(run, LANDMARK_SIZE_CM, ds.centreArc0 + (arc - ds.grabArc));
	if (!place) return;
	const entry = entryFor(run, place.wallId);
	const w = findWall(model, place.wallId);
	if (!entry || !w) return;
	const len = markWallLengthCm(w);
	/* A run may carry a wall too short to hold the square. Placing already refuses
	   one; travelling onto it would put the landmark somewhere it cannot be seen
	   or reported, so the drag stops at the wall it is on instead. */
	if (!showsOnWall({ lengthCm: len, isOpen: !!w.isOpen })) return;
	const want = clampToWall(ownOffsetOf(entry, place, LANDMARK_SIZE_CM), len);
	/* Coming round a corner it enters at one of the wall's ends, and that end is
	   where the free stretch it may travel is measured from. */
	const from =
		w.id === m.wallId
			? m.offsetFromStartCm
			: entryOffsetCm(place.offsetCm + LANDMARK_SIZE_CM / 2, len, entry.forward);
	const n = wallNormal(w);
	const across = (curCm.x - w.from.x) * n.x + (curCm.y - w.from.y) * n.y;
	const wanted = faceOfSide(across);
	let face = m.face;
	if (wanted !== face && fitsAt(want, len, blockersFor(model, w, wanted, m.id))) face = wanted;
	m.wallId = w.id;
	m.face = face;
	m.offsetFromStartCm = r(
		slideOnWall({
			wantOffsetCm: want,
			fromOffsetCm: from,
			wallLengthCm: len,
			blockers: blockersFor(model, w, face, m.id)
		})
	);
}
