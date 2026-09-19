/**
 * Committing a drawn stroke: resolving what each of its ends caught into real
 * geometry, and squaring a weld onto a vertex that sits off the stroke's own
 * axis, because a wall is never stored diagonal.
 *
 * Nothing here shows anything: the walls a squaring changed are returned and
 * the caller says so. `beforeChange` is the caller's history step, taken at the
 * moment the model is about to change and not before, so a stroke that comes to
 * nothing leaves no step.
 */

import {
	MIN_STROKE_PX,
	MIN_WALL,
	dist,
	makeWall,
	pointsEqual,
	r,
	type Heading,
	type Ids,
	type Model,
	type Point,
	type SegmentKind,
	type Wall
} from './model';
import { headingOf, headingVec, wallLen, wallsAtPoint } from './topology';
import { openingsTotalCm, syncSegments, type IsFresh } from './openings';
import { cleanupOutline, splitWallAtPoint, type BeforeChange } from './walls';

/** What one end of a stroke caught, as far as committing it cares. */
export interface StrokeEnd {
	kind: 'none' | 'end' | 'corner' | 'tjunction' | 'align';
	wallId?: string;
}

/** One wall a squaring changed, as the toast reads it. */
export interface SquareChange {
	wallId: string;
	heading: Heading;
	before: number;
	after: number;
}

export interface DrawStrokeResult {
	made: boolean;
	newSegId?: string;
	squareChanges: SquareChange[];
}

export type SquareWeld =
	| { ok: true; point: Point; changed: { wall: Wall; before: number; after: number }[] }
	| { ok: false; reason: 'structural' }
	| { ok: false; reason: 'openings'; wall: Wall; needed: number; got: number };

/**
 * Squares a weld onto an existing vertex that sits off the drawn stroke's own
 * axis. Every wall touching that vertex must run perpendicular to the stroke's
 * heading — only then does moving the shared endpoint change that wall's
 * length, rather than making it diagonal too — and none of them may be left
 * shorter than the openings on it need. Otherwise refuse: the caller leaves the
 * ends unjoined rather than force a diagonal or an impossible wall.
 */
export function squareWeldToVertex(model: Model, vertexPoint: Point, startPt: Point, heading: Heading): SquareWeld {
	const axisIsY = heading === 'E' || heading === 'W'; // the stroke runs horizontally: correct the vertex's Y
	const corrected = axisIsY
		? { x: r(vertexPoint.x), y: r(startPt.y) }
		: { x: r(startPt.x), y: r(vertexPoint.y) };
	if (pointsEqual(vertexPoint, corrected)) {
		return { ok: true, point: { x: r(vertexPoint.x), y: r(vertexPoint.y) }, changed: [] };
	}
	const touches = wallsAtPoint(model, vertexPoint, null);
	const safe = touches.every((t) => {
		const h = headingOf(t.wall);
		return axisIsY ? h === 'N' || h === 'S' : h === 'E' || h === 'W';
	});
	if (!safe) return { ok: false, reason: 'structural' };
	for (const touch of touches) {
		const tw = touch.wall;
		const otherEnd = touch.end === 'from' ? tw.to : tw.from;
		const newLen = dist(otherEnd, corrected);
		const floor = Math.max(MIN_WALL, openingsTotalCm(tw));
		if (newLen < floor) {
			return { ok: false, reason: 'openings', wall: tw, needed: floor, got: r(newLen) };
		}
	}
	const changed: { wall: Wall; before: number; after: number }[] = [];
	touches.forEach((t) => {
		const tw = t.wall;
		const before = r(wallLen(tw));
		tw[t.end].x = corrected.x; tw[t.end].y = corrected.y;
		const after = r(wallLen(tw));
		if (after !== before) changed.push({ wall: tw, before, after });
	});
	return { ok: true, point: corrected, changed };
}

export interface DrawStroke {
	startPt: Point;
	startSnap: StrokeEnd | null;
	endPt: Point;
	endSnap: StrokeEnd | null;
	heading: Heading | null;
	/** screen px per cm at the moment of release, or null where there is no view */
	scale: number | null;
	kind: SegmentKind | null;
}

/**
 * Commits a drawn stroke, and says whether it made anything. T-junction splits
 * are resolved first, so the new wall's ends land exactly on the fresh joints;
 * then any vertex weld off the stroke's own axis is squared, because a wall is
 * never stored diagonal; then the wall is added and a collinear neighbour it
 * welded onto absorbs it.
 */
export function commitDrawStroke(
	ids: Ids,
	model: Model,
	stroke: DrawStroke,
	isFresh: IsFresh,
	beforeChange: BeforeChange
): DrawStrokeResult {
	const { startPt, startSnap, endPt, endSnap, heading, scale } = stroke;
	/* Below the structural floor, or too small on screen to have been a
	   deliberate stroke rather than a mis-click: nothing is made, and no history
	   step is taken for a stroke nothing came of. */
	if (
		dist(startPt, endPt) < MIN_WALL ||
		(scale !== null && dist(startPt, endPt) * scale < MIN_STROKE_PX)
	) {
		return { made: false, squareChanges: [] };
	}
	beforeChange();
	if (startSnap && startSnap.kind === 'tjunction' && startSnap.wallId) {
		splitWallAtPoint(ids, model, startSnap.wallId, startPt);
	}
	if (endSnap && endSnap.kind === 'tjunction' && endSnap.wallId) {
		splitWallAtPoint(ids, model, endSnap.wallId, endPt);
	}

	let finalStartPt = startPt;
	let finalEndPt = endPt;
	let squared: { wall: Wall; before: number; after: number }[] | null = null;
	if (endSnap && (endSnap.kind === 'end' || endSnap.kind === 'corner') && heading) {
		const dvec = headingVec(heading);
		const target = { x: r(endPt.x), y: r(endPt.y) };
		const onAxisAlready =
			heading === 'E' || heading === 'W' ? r(startPt.y) === target.y : r(startPt.x) === target.x;
		const startIsFree = !startSnap || startSnap.kind === 'none';
		if (onAxisAlready) {
			finalEndPt = target;
		} else if (startIsFree) {
			/* The fresh stroke is the rough one, so it moves, never the wall the
			   client already measured: its start end is free, so the whole stroke
			   translates perpendicular to its own heading until its far end lands on
			   the target, keeping its length and heading as drawn. */
			const rawLen = Math.max(Math.abs(endPt.x - startPt.x), Math.abs(endPt.y - startPt.y));
			finalEndPt = target;
			finalStartPt = { x: r(target.x - dvec.x * rawLen), y: r(target.y - dvec.y * rawLen) };
		} else {
			/* Welded at both ends, so it cannot be translated without breaking the
			   other weld: move the target vertex instead and absorb the difference
			   into the wall attached to it. */
			const sq = squareWeldToVertex(model, endPt, startPt, heading);
			if (sq.ok) {
				finalEndPt = sq.point;
				if (sq.changed.length) squared = sq.changed;
			} else {
				/* Neither way squares: leave the ends unjoined rather than force a
				   diagonal wall or shrink one past its own openings. */
				const fallbackLen = Math.max(Math.abs(endPt.x - startPt.x), Math.abs(endPt.y - startPt.y));
				finalEndPt = {
					x: r(startPt.x + dvec.x * fallbackLen),
					y: r(startPt.y + dvec.y * fallbackLen)
				};
			}
		}
	}

	const w = makeWall(ids, finalStartPt, finalEndPt, 'drawn', stroke.kind);
	const newSegId = w.segments[0].id;
	model.walls.push(w);
	/* Downgrade provenance on whatever the squaring actually changed before
	   cleanup runs: an untouched wall keeps what it said, and only one whose
	   length changed to make the loop square becomes computed. */
	if (squared) squared.forEach((c) => (c.wall.lengthSource = 'computed'));
	cleanupOutline(ids, model, isFresh);
	syncSegments(ids, model, isFresh);
	return {
		made: true,
		newSegId,
		squareChanges: (squared || []).map((c) => ({
			wallId: c.wall.id,
			heading: headingOf(c.wall),
			before: c.before,
			after: c.after
		}))
	};
}

