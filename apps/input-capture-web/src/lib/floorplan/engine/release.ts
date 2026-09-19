/**
 * What a release settles. A gesture's intent was decided at the press and its
 * moves have already changed the model; this is only where the focus ends up,
 * what a tap makes, and the two things that are finished at release rather than
 * during the drag: a drawn stroke, and the weld a snap caught mid-drag.
 */

import { landmarkKindOf } from '@urban-moon/domain-data';
import { RO } from './copy';
import { segHitWidthCm } from './dims';
import { closestOf, type Dom } from './dom';
import type { DragState } from './dragState';
import { landmarkGeom, placeLandmarkAt } from './landmarkEdits';
import { WALL_THICKNESS_CM, findLandmark, findSegAnywhere, findWall, r } from './model';
import { addOpening, syncSegments } from './openings';
import { LANDMARK_TOOL, strokeKind, toolUsed, toolMakes, type Session } from './session';
import { findEndpointSnap, resizeEndpointSnap } from './snap';
import { commitDrawStroke } from './strokes';
import { segPoints, snapHeading, wallDir, wallUnderPoint } from './topology';
import type { Box } from './view';
import type { Viewport } from './viewport';
import { cleanupOutline, forceSnapWeld, roundAllEndpoints, type SnapWeld } from './walls';
import type { GestureDeps } from './gestures';

export interface Release {
	onRelease(ds: DragState, e: PointerEvent): void;
}

export function createRelease(s: Session, dom: Dom, viewport: Viewport, deps: GestureDeps): Release {
	function handleTap(ds: DragState): void {
		if (ds.kind === 'landmark') {
			s.selection = { landmarkId: ds.landmarkId };
		} else if (ds.kind === 'push' || ds.kind === 'opening' || ds.kind === 'openingEdge') {
			s.selection = { segId: ds.segId };
		} else if (ds.kind === 'freeEnd') {
			/* Poking the end of a wall selects that wall. Segments run from->to, so the
			   piece at 'from' is index 0 and at 'to' the last one. */
			const fw = findWall(s.model, ds.wallId);
			s.selection = fw
				? { segId: fw.segments[ds.movingEnd === 'from' ? 0 : fw.segments.length - 1].id }
				: null;
		} else {
			// Empty canvas, or a corner: the focus ends.
			s.selection = null;
		}
		s.justMade = null;
	}

	/** One tap with Fereastră or Ușă on: a 60 cm window or a 90 cm door on the wall touched. */
	function placeOpening(clientX: number, clientY: number): void {
		const kind = strokeKind(s);
		const under = dom.doc.elementFromPoint(clientX, clientY);
		const hit = closestOf(dom.win, under, '.fp-hit');
		// Never on a Fără perete side, and never on top of another opening.
		if (!kind || !hit || hit.getAttribute('data-kind') !== 'wall') {
			toolUsed(s, false, null);
			return;
		}
		const wallId = hit.getAttribute('data-wall-id') || '';
		const w = findWall(s.model, wallId);
		if (!w) {
			toolUsed(s, false, null);
			return;
		}
		const t = viewport.transform();
		const atCm = viewport.clientToCm(clientX, clientY, t);
		const d = wallDir(w);
		const along = (atCm.x - w.from.x) * d.x + (atCm.y - w.from.y) * d.y;
		deps.pushHistory();
		const id = addOpening(s.ids, s.model, wallId, kind, along, s.carried);
		if (!id) {
			s.history.pop();
			toolUsed(s, false, null);
			return;
		}
		s.selection = { segId: id };
		toolUsed(s, true, kind);
	}

	/** One tap with the landmark tool on: a 30 cm square against the wall touched. */
	function placeLandmark(clientX: number, clientY: number): void {
		const t = viewport.transform();
		const entry = landmarkKindOf(s.landmarkKind ?? '');
		const found = entry
			? wallUnderPoint(s.model, viewport.clientToCm(clientX, clientY, t), segHitWidthCm(t.scale) / 2)
			: null;
		if (!entry || !found) {
			toolUsed(s, false, null);
			return;
		}
		const mark = placeLandmarkAt(s.model, s.ids, entry.kind, found.wall, found.alongCm);
		if (!mark) {
			toolUsed(s, false, null);
			return;
		}
		deps.pushHistory();
		s.model.landmarks.push(mark);
		s.selection = { landmarkId: mark.id };
		toolUsed(s, true, LANDMARK_TOOL);
	}

	/** What the focus is on right now, whatever kind of thing it is. */
	function focusKey(): string | null {
		if (!s.selection) return null;
		return 'landmarkId' in s.selection ? 'mark:' + s.selection.landmarkId : 'seg:' + s.selection.segId;
	}

	/** When the piece in focus would sit under a plate, pan just enough to show it. */
	function revealFocused(): void {
		if (!s.selection || !viewport.hasView()) return;
		let box: Box;
		if ('landmarkId' in s.selection) {
			const mk = findLandmark(s.model, s.selection.landmarkId);
			const g = mk ? landmarkGeom(s.model, mk) : null;
			if (!g) return;
			const pad = g.half + WALL_THICKNESS_CM;
			box = {
				minX: g.centre.x - pad,
				minY: g.centre.y - pad,
				maxX: g.centre.x + pad,
				maxY: g.centre.y + pad
			};
			viewport.revealBox(box);
			return;
		}
		const f = findSegAnywhere(s.model, s.selection.segId);
		if (!f) return;
		const pts = segPoints(f.wall, f.seg);
		box = {
			minX: Math.min(pts.p0.x, pts.p1.x) - WALL_THICKNESS_CM,
			minY: Math.min(pts.p0.y, pts.p1.y) - WALL_THICKNESS_CM,
			maxX: Math.max(pts.p0.x, pts.p1.x) + WALL_THICKNESS_CM,
			maxY: Math.max(pts.p0.y, pts.p1.y) + WALL_THICKNESS_CM
		};
		viewport.revealBox(box);
	}

	/**
	 * At release a snap that caught mid-drag is forced onto its target's exact
	 * coordinates, so the weld is bit-for-bit equal rather than only close enough
	 * after rounding.
	 */
	function weldOf(ds: DragState): SnapWeld | null {
		if (ds.kind === 'push' && ds.snapAt && ds.snapEnd) {
			return { kind: 'push', wallId: ds.wallId, point: ds.snapAt, end: ds.snapEnd };
		}
		if (ds.kind === 'corner' && ds.snapAt && ds.touches) {
			return { kind: 'corner', point: ds.snapAt, touches: ds.touches };
		}
		return null;
	}
	function finalizeDragWeld(ds: DragState): void {
		roundAllEndpoints(s.model);
		forceSnapWeld(s.model, weldOf(ds));
		cleanupOutline(s.ids, s.model, deps.isFresh);
		syncSegments(s.ids, s.model, deps.isFresh);
	}

	/** What a release settles, once the gesture it ends is known. */
	function onRelease(ds: DragState, e: PointerEvent): void {
		const focusBefore = focusKey();
		if (!ds.committed && ds.kind === 'place') {
			if (toolMakes(s) === LANDMARK_TOOL) placeLandmark(e.clientX, e.clientY);
			else placeOpening(e.clientX, e.clientY);
		} else if (!ds.committed) {
			if (ds.kind === 'draw') {
				/* A tool use that drew nothing keeps the tool on, and the hint repeats what
				   to do. */
				toolUsed(s, false, null);
			} else {
				handleTap(ds);
			}
		} else if (ds.kind === 'pan') {
			/* the view has already followed the finger */
		} else if (ds.kind === 'landmark') {
			/* The drag has already put the square where it goes, wall by wall and face
			   by face; release only settles the focus on it. */
			s.selection = { landmarkId: ds.landmarkId };
		} else if (ds.kind === 'openingEdge') {
			s.selection = { segId: ds.segId };
		} else if (ds.kind === 'opening') {
			s.selection = { segId: ds.liveSegId || ds.segId };
		} else if (ds.kind === 'push') {
			finalizeDragWeld(ds);
			s.selection = { segId: ds.segId };
		} else if (ds.kind === 'corner') {
			finalizeDragWeld(ds);
		} else if (ds.kind === 'resize') {
			/* Re-checked fresh at release, on the actual release coordinates rather than
			   whatever the last move event computed. */
			const t = viewport.transform();
			const releaseCm = viewport.clientToCm(e.clientX, e.clientY, t);
			const wRel = findWall(s.model, ds.wallId);
			if (wRel) {
				const endSnap = resizeEndpointSnap(s.model, wRel, ds, releaseCm, t.scale);
				wRel[ds.movingEnd].x = r(endSnap.point.x);
				wRel[ds.movingEnd].y = r(endSnap.point.y);
				wRel.lengthSource = 'drawn';
				/* Sync first, so a piece grown past an opening resolves to whichever segment
				   truly sits at the end now, and capture that id before cleanupOutline can
				   merge this wall into a collinear neighbour. */
				syncSegments(s.ids, s.model, deps.isFresh);
				const resizedSegId = wRel.segments[ds.movingEnd === 'from' ? 0 : wRel.segments.length - 1].id;
				cleanupOutline(s.ids, s.model, deps.isFresh);
				syncSegments(s.ids, s.model, deps.isFresh);
				s.selection = { segId: resizedSegId };
			}
		} else if (ds.kind === 'draw') {
			const t = viewport.transform();
			const releaseCm = viewport.clientToCm(e.clientX, e.clientY, t);
			const ddx = releaseCm.x - ds.startPt.x;
			const ddy = releaseCm.y - ds.startPt.y;
			const heading = snapHeading(ddx, ddy);
			const rawLen = Math.max(Math.abs(ddx), Math.abs(ddy));
			const endSnap = findEndpointSnap(s.model, ds.startPt, heading, rawLen, t.scale);
			const stroke = commitDrawStroke(
				s.ids,
				s.model,
				{
					startPt: ds.startPt,
					startSnap: ds.startSnap,
					endPt: endSnap.point,
					endSnap,
					heading,
					scale: t.scale,
					kind: ds.tool
				},
				deps.isFresh,
				deps.pushHistory
			);
			if (stroke.made && stroke.newSegId) s.selection = { segId: stroke.newSegId };
			if (stroke.squareChanges.length) {
				deps.showToast(
					RO.squareToast(
						stroke.squareChanges.map((c) => RO.squarePart(c.heading, c.before, c.after)).join('; ')
					)
				);
			}
			toolUsed(s, stroke.made, ds.tool);
		}
		/* Whatever moved the focus this time, a piece that would land under a plate is
		   brought out from under it once, here. */
		if (focusKey() !== focusBefore) revealFocused();
	}

	return { onRelease };
}
