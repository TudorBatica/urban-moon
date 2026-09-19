/**
 * What a committed drag does to the model: what it fixes at the moment it
 * commits, and what one move of it applies. Every kind that mutates the live
 * model restores the base snapshot first and re-applies from there, so nothing
 * ever compounds move over move and sliding back undoes exactly what sliding
 * forward did.
 *
 * The seam with `gestures.ts` is the pointer: nothing here reads an event or an
 * element, only the drag as it stands and the scale it is being read at.
 */

import type { DragState } from './dragState';
import { MIN_OPEN, cloneModel, findLandmark, findSeg, findWall, type Model, type Point } from './model';
import { flexRun, resizeSegment, slideSegment, syncSegments, type IsFresh } from './openings';
import { applyLandmarkSlide, applyOpeningSlide, beginLandmarkRun, beginOpeningRun, type RunGrab } from './run';
import { findCornerSnap, findEndpointSnap, findPushSnap, resizeEndpointSnap } from './snap';
import type { Session } from './session';
import { dragCornerAtPoint, dragPushWall } from './walls';
import { snapHeading, wallDir, wallNormal, wallsAtPoint } from './topology';

export interface DragDeps {
	session: Session;
	isFresh: IsFresh;
	/** puts the model back to a snapshot, in place */
	restoreSnapshot: (snap: Model) => void;
}

/**
 * Whether a piece taken hold of has its run: `beginOpeningRun` answers nothing
 * for a piece that has gone, and a move then has nowhere to travel.
 */
function hasRun<T extends object>(ds: T & Partial<RunGrab>): ds is T & RunGrab {
	return (
		'run' in ds &&
		ds.runPoints !== undefined &&
		ds.grabArc !== undefined &&
		ds.centreArc0 !== undefined &&
		ds.lastArc !== undefined
	);
}

/**
 * The drag has travelled far enough to be a drag: it takes its undo step now,
 * and fixes whatever must not move under it for the rest of the gesture.
 *
 * `draw` needs no snapshot: it only adds a piece at pointerup.
 */
export function beginCommittedDrag(d: DragDeps, ds: DragState, pushHistory: () => void): void {
	const model = d.session.model;
	if (ds.kind === 'push' || ds.kind === 'corner' || ds.kind === 'resize') {
		pushHistory();
		ds.base = cloneModel(model);
		if (ds.kind === 'corner') {
			/* Captured once, before any movement — which wall ends actually sit at this
			   corner right now. A snapped release has to weld exactly these onto the
			   target vertex; once the drag has moved them, they can no longer be found
			   by position. */
			ds.touches = wallsAtPoint(model, ds.vertexPt, null).map((x) => ({ wallId: x.wall.id, end: x.end }));
		}
		return;
	}
	if (ds.kind === 'landmark') {
		pushHistory();
		ds.base = cloneModel(model);
		const mk = findLandmark(model, ds.landmarkId);
		const mw = mk ? findWall(model, mk.wallId) : null;
		if (mk && mw) {
			/* The run and where on it the drag began, both fixed now, exactly as an
			   opening's are. */
			const grab = beginLandmarkRun(model, ds.landmarkId, ds.startCm);
			if (grab) Object.assign(ds, grab);
		}
		return;
	}
	if (ds.kind === 'opening' || ds.kind === 'openingEdge') {
		pushHistory();
		ds.base = cloneModel(model);
		const f = findSeg(model, ds.wallId, ds.segId);
		const w = findWall(model, ds.wallId);
		if (ds.kind === 'openingEdge') {
			/* One jamb moves and the other stays: both are measured off where the
			   segment was when the drag began. */
			ds.segOffsetStart = f ? f.seg.offsetFromStart : 0;
			ds.segLengthStart = f ? f.seg.length.value : 0;
			ds.wallDirVec = w ? wallDir(w) : { x: 1, y: 0 };
		} else if (w && f) {
			/* The run the opening may travel, and where on it the drag began: both
			   fixed now, so a wall growing past a free end mid-drag cannot move the
			   ground under the gesture. */
			const grab = beginOpeningRun(model, ds.wallId, ds.segId, ds.startCm);
			if (grab) Object.assign(ds, grab);
			ds.liveSegId = ds.segId;
		}
	}
}

/** One move of a committed drag, applied to the model the drag began on. */
export function applyDragMove(d: DragDeps, ds: DragState, curCm: Point, scale: number): void {
	const s = d.session;
	const model = s.model;
	const dx = curCm.x - ds.startCm.x;
	const dy = curCm.y - ds.startCm.y;
	if (ds.kind === 'push') {
		if (!ds.base) return;
		d.restoreSnapshot(ds.base);
		const w = findWall(model, ds.wallId);
		if (!w) return;
		const n = wallNormal(w);
		const rawDelta = dx * n.x + dy * n.y;
		const pushSnap = findPushSnap(model, w, rawDelta, scale);
		ds.snapAt = pushSnap ? pushSnap.point : null;
		ds.snapEnd = pushSnap ? pushSnap.end : null;
		dragPushWall(s.ids, model, ds.wallId, pushSnap ? pushSnap.delta : rawDelta, d.isFresh);
		return;
	}
	if (ds.kind === 'corner') {
		if (!ds.base) return;
		d.restoreSnapshot(ds.base);
		const cornerSnap = findCornerSnap(model, ds.vertexPt, dx, dy, scale);
		let movedX = dx;
		let movedY = dy;
		if (cornerSnap) {
			movedX = cornerSnap.x - ds.vertexPt.x;
			movedY = cornerSnap.y - ds.vertexPt.y;
			ds.snapAt = cornerSnap;
		} else {
			ds.snapAt = null;
		}
		dragCornerAtPoint(s.ids, model, ds.vertexPt, movedX, movedY, d.isFresh);
		return;
	}
	if (ds.kind === 'landmark') {
		if (!ds.base) return;
		d.restoreSnapshot(ds.base);
		s.selection = { landmarkId: ds.landmarkId };
		if (hasRun(ds)) applyLandmarkSlide(model, ds, curCm);
		return;
	}
	if (ds.kind === 'opening') {
		if (!ds.base) return;
		d.restoreSnapshot(ds.base);
		/* The model is the one the drag began on again, so the piece in focus is the
		   one it began on until this move says otherwise. */
		s.selection = { segId: ds.segId };
		ds.liveSegId = ds.segId;
		const slid = hasRun(ds) ? applyOpeningSlide(s.ids, model, ds, curCm, d.isFresh) : null;
		if (slid) {
			/* The chain and the wash follow the piece while it travels, so the focus
			   moves with it rather than pointing at the piece it was a moment ago. */
			s.selection = { segId: slid.segId };
			ds.liveSegId = slid.segId;
			ds.pastFreeEnd = slid.pastFreeEnd;
		}
		return;
	}
	if (ds.kind === 'openingEdge') {
		/* A conserving edit, unlike typing a width: the wall's own total must come
		   out exactly as it went in, so whatever this edge eats or gives back comes
		   only from the plain run right beside it, and the OPPOSITE edge never moves. */
		if (!ds.base) return;
		d.restoreSnapshot(ds.base);
		const wE = findWall(model, ds.wallId);
		const fE = findSeg(model, ds.wallId, ds.segId);
		if (!wE || !fE) return;
		const dir = ds.wallDirVec || { x: 1, y: 0 };
		const along = dx * dir.x + dy * dir.y;
		const startOffset0 = ds.segOffsetStart ?? 0;
		const length0 = ds.segLengthStart ?? 0;
		let wantLen = length0 + (ds.edge === 'end' ? along : -along);
		if (wantLen > length0) {
			/* Growing an edge may only eat the plain run on its own side: capping the
			   request there is what keeps the other edge from ever drifting, and is
			   also the "stop growing at the limit" the far end of the wall imposes. */
			const run = ds.edge === 'end' ? flexRun(wE, fE.idx + 1, 1) : flexRun(wE, fE.idx - 1, -1);
			wantLen = Math.min(
				wantLen,
				length0 + run.reduce((a, seg) => a + seg.length.value, 0)
			);
		}
		wantLen = Math.max(MIN_OPEN, wantLen);
		const res = resizeSegment(s.ids, model, ds.wallId, ds.segId, wantLen, 'drawn', d.isFresh);
		const appliedLen = res.ok ? res.applied : (res.max ?? length0);
		/* resizeSegment resized in place, which (when it had to reach past the room
		   on the preferred side) can leave the wrong edge having moved: this puts the
		   whole segment back so the edge this drag is not touching lands exactly
		   where it started. */
		slideSegment(
			s.ids,
			model,
			ds.wallId,
			ds.segId,
			ds.edge === 'end' ? startOffset0 : startOffset0 + length0 - appliedLen,
			'drawn',
			d.isFresh
		);
		return;
	}
	if (ds.kind === 'resize') {
		/* ds.fixedEnd and ds.heading were fixed once, at commit time, and never
		   change for the rest of this gesture even if the wall gets pulled down
		   toward its own floor. */
		if (!ds.base) return;
		d.restoreSnapshot(ds.base);
		const wR = findWall(model, ds.wallId);
		if (!wR) return;
		const endSnap = resizeEndpointSnap(model, wR, ds, curCm, scale);
		ds.endPoint = endSnap.point;
		ds.endSnap = endSnap;
		wR[ds.movingEnd].x = endSnap.point.x;
		wR[ds.movingEnd].y = endSnap.point.y;
		wR.lengthSource = 'drawn';
		/* No new segment maths: the wall's own geometric length just changed, so the
		   existing sync repartitions it exactly the way any other length change does. */
		syncSegments(s.ids, model, d.isFresh);
		return;
	}
	if (ds.kind === 'draw') {
		const ddx = curCm.x - ds.startPt.x;
		const ddy = curCm.y - ds.startPt.y;
		const heading = snapHeading(ddx, ddy);
		const rawLen = Math.max(Math.abs(ddx), Math.abs(ddy));
		const endSnap = findEndpointSnap(model, ds.startPt, heading, rawLen, scale);
		ds.heading = heading;
		ds.endPoint = endSnap.point;
		ds.endSnap = endSnap;
	}
}
