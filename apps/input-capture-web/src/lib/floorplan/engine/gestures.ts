/**
 * The pointer. Intent comes from the tool that is on and from where a drag
 * starts, decided once at pointerdown, before any movement:
 *
 *   Perete / Fără perete       -> one drag draws one piece, snapping at press
 *                                 and again at release
 *   Fereastră / Ușă            -> one tap on a wall places one opening
 *   Selectează, on a piece     -> push a wall, slide an opening
 *   Selectează, on a corner    -> move that corner, both walls following
 *   Selectează, on a jamb      -> resize that opening, the far jamb pinned
 *   Selectează, on empty canvas-> move the view
 *
 * Two fingers pinch and pan whatever the tool, and a second finger landing
 * during a stroke cancels it. Every drag starts inside a small screen-space
 * dead-zone, so a plain tap never moves anything.
 */

import { closestOf, type Dom } from './dom';
import { applyDragMove, beginCommittedDrag, type DragDeps } from './drags';
import { resolveFreeEndDirection, type DragState, type FreeEndDrag } from './dragState';
import { FREE_END_DECIDE_PX, TAP_PX, findWall, type Model, type Point, type WallEnd } from './model';
import type { IsFresh } from './openings';
import { createRelease } from './release';
import { isMakingStroke, isPlacingTap, strokeKind, type Session } from './session';
import { findStartSnap } from './snap';
import { restingTool } from './tools';
import type { Viewport } from './viewport';

export interface GestureDeps {
	render: () => void;
	pushHistory: () => void;
	restoreSnapshot: (snap: Model) => void;
	/** a field commits on every press, not just on a button: blur re-renders */
	commitActiveField: () => void;
	/** the client zoomed or panned by their own hand */
	noteZoomed: () => void;
	isFresh: IsFresh;
}

export interface Gestures {
	/** the router, also reached by a press the browser retargeted onto a control */
	onPointerDown(e: PointerEvent): void;
	/** space arms the pan with any tool */
	setSpaceDown(down: boolean): void;
	cancelStroke(): void;
	destroy(): void;
}

export function installGestures(s: Session, dom: Dom, viewport: Viewport, deps: GestureDeps): Gestures {
	const svg = dom.svg;
	const pointers = new Map<number, Point>();
	let pinch: { dist: number; centre: Point } | null = null;
	let spaceDown = false;
	let edgePanFrame: number | null = null;
	let edgePanAt: { stage: Point; clientX: number; clientY: number } | null = null;
	let destroyed = false;
	const dragDeps: DragDeps = {
		session: s,
		isFresh: deps.isFresh,
		restoreSnapshot: deps.restoreSnapshot
	};
	const release = createRelease(s, dom, viewport, deps);

	function pinchDistance(): number {
		const pts = Array.from(pointers.values());
		return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
	}
	function pinchCentre(): Point {
		const pts = Array.from(pointers.values());
		const sr = svg.getBoundingClientRect();
		return { x: (pts[0].x + pts[1].x) / 2 - sr.left, y: (pts[0].y + pts[1].y) / 2 - sr.top };
	}

	function cancelStroke(): void {
		const ds = s.drag;
		if (ds && ds.committed && ds.base) {
			deps.restoreSnapshot(ds.base);
			/* The drag took its undo step the moment it committed; abandoned, it would
			   leave a step that undoes to the very same drawing. */
			s.history.pop();
			/* An opening that travelled to another wall was re-made there, so the focus
			   has to come back to the piece the model holds again. */
			if (ds.kind === 'opening' && ds.segId) s.selection = { segId: ds.segId };
			if (ds.kind === 'landmark' && ds.landmarkId) s.selection = { landmarkId: ds.landmarkId };
		}
		s.drag = null;
		stopEdgePan();
	}

	function capture(e: PointerEvent): void {
		try {
			svg.setPointerCapture(e.pointerId);
		} catch {
			/* a pointer that has already gone cannot be captured, and needs no capture */
		}
		e.preventDefault();
	}

	function onPointerDown(e: PointerEvent): void {
		/* Commit whatever chip is focused on every pointerdown, not just on a button
		   press: a field commits on blur, and blur re-renders. */
		deps.commitActiveField();
		s.refusedTool = false;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2) {
			// A second finger takes over: whatever the first was doing stops.
			cancelStroke();
			pinch = { dist: pinchDistance(), centre: pinchCentre() };
			deps.render();
			return;
		}
		if (pointers.size > 2) return;

		const t = viewport.transform();
		const startCm = viewport.clientToCm(e.clientX, e.clientY, t);
		const base = {
			startClientX: e.clientX,
			startClientY: e.clientY,
			startCm,
			committed: false
		};

		// Space or the middle button pans with any tool.
		if (spaceDown || e.button === 1) {
			s.drag = { ...base, kind: 'pan', lastClientX: e.clientX, lastClientY: e.clientY };
			capture(e);
			return;
		}

		if (isMakingStroke(s)) {
			const startSnap = findStartSnap(s.model, startCm, t.scale);
			s.drag = { ...base, kind: 'draw', tool: strokeKind(s), startPt: startSnap.point, startSnap };
			capture(e);
			return;
		}

		/* A landmark is the one thing the landmark step can take hold of, and it wins
		   over the armed tool: the tool is armed on arrival, so a press on a square
		   already there would otherwise always try to place another one. */
		const markEl = closestOf(dom.win, e.target, '[data-landmark-id]');
		const markId = markEl ? markEl.getAttribute('data-landmark-id') : null;
		if (s.mode === 'landmarks' && markId) {
			/* Taking hold of one puts the tool down, so the plate, the hint and the
			   focus all say the same thing: this square is what the client is on. */
			s.activeTool = restingTool(s.tools);
			s.justMade = null;
			s.drag = { ...base, kind: 'landmark', landmarkId: markId };
			capture(e);
			deps.render();
			return;
		}

		if (isPlacingTap(s)) {
			// Resolved at release: an opening goes where the tap landed, on a plain wall.
			s.drag = { ...base, kind: 'place' };
			capture(e);
			return;
		}

		const dedicated = closestOf(dom.win, e.target, '.fp-grab');
		if (dedicated) {
			if (dedicated.hasAttribute('data-vx')) {
				const vx = parseFloat(dedicated.getAttribute('data-vx') || '0');
				const vy = parseFloat(dedicated.getAttribute('data-vy') || '0');
				s.drag = { ...base, kind: 'corner', vertexPt: { x: vx, y: vy } };
			} else if (dedicated.hasAttribute('data-edge')) {
				s.drag = {
					...base,
					kind: 'openingEdge',
					wallId: dedicated.getAttribute('data-wall-id') || '',
					segId: dedicated.getAttribute('data-seg-id') || '',
					edge: dedicated.getAttribute('data-edge') === 'start' ? 'start' : 'end'
				};
			} else {
				/* A free end resizes its wall along the wall's own axis; anything more
				   sideways is a pan, since Selectează never draws. */
				const feWallId = dedicated.getAttribute('data-wall-id') || '';
				const feEnd: WallEnd = dedicated.getAttribute('data-end') === 'from' ? 'from' : 'to';
				const feWall = findWall(s.model, feWallId);
				const fePt = feWall ? { x: feWall[feEnd].x, y: feWall[feEnd].y } : startCm;
				s.drag = { ...base, kind: 'freeEnd', wallId: feWallId, movingEnd: feEnd, startPt: fePt };
			}
			capture(e);
			return;
		}

		const segHitEl = closestOf(dom.win, e.target, '.fp-hit');
		if (segHitEl) {
			const k = segHitEl.getAttribute('data-kind');
			const wallId = segHitEl.getAttribute('data-wall-id') || '';
			const segId = segHitEl.getAttribute('data-seg-id') || '';
			s.drag =
				k === 'wall' || k === 'open'
					? { ...base, kind: 'push', wallId, segId }
					: { ...base, kind: 'opening', wallId, segId };
			capture(e);
			return;
		}

		/* Empty canvas with Selectează on: one finger moves the view, and a tap that
		   never moves ends the focus. */
		s.drag = { ...base, kind: 'pan', lastClientX: e.clientX, lastClientY: e.clientY };
		capture(e);
	}

	/**
	 * A press on a free end says only that a drag has begun. Six pixels say a
	 * gesture is a drag, not which drag: over that distance the direction is mostly
	 * the jitter of the first frame.
	 */
	function resolveFreeEnd(fe: FreeEndDrag, curCm: Point): DragState {
		const resolved = resolveFreeEndDirection(s.model, fe, curCm);
		const base = {
			startClientX: fe.startClientX,
			startClientY: fe.startClientY,
			startCm: fe.startCm,
			committed: fe.committed
		};
		if (resolved.kind === 'resize') {
			return {
				...base,
				kind: 'resize',
				wallId: fe.wallId,
				movingEnd: fe.movingEnd,
				startPt: fe.startPt,
				fixedEnd: resolved.fixedEnd,
				heading: resolved.heading
			};
		}
		return { ...base, kind: 'pan', lastClientX: fe.startClientX, lastClientY: fe.startClientY };
	}

	/* While a stroke or a drag comes within 32px of a canvas edge, the view pans
	   toward it at a steady pace, re-applying the drag from the last pointer
	   position on every frame. */
	function startEdgePan(): void {
		if (edgePanFrame != null || typeof dom.win.requestAnimationFrame !== 'function') return;
		const step = (): void => {
			edgePanFrame = null;
			const ds = s.drag;
			if (destroyed || !ds || !edgePanAt) return;
			const d = viewport.edgeStep(edgePanAt.stage);
			if (d.dx || d.dy) {
				viewport.panBy(d.dx, d.dy);
				viewport.applyView();
				const t = viewport.transform();
				applyDragMove(dragDeps, ds, viewport.clientToCm(edgePanAt.clientX, edgePanAt.clientY, t), t.scale);
				deps.render();
			}
			edgePanFrame = dom.win.requestAnimationFrame(step);
		};
		edgePanFrame = dom.win.requestAnimationFrame(step);
	}
	function stopEdgePan(): void {
		if (edgePanFrame != null && typeof dom.win.cancelAnimationFrame === 'function') {
			dom.win.cancelAnimationFrame(edgePanFrame);
		}
		edgePanFrame = null;
		edgePanAt = null;
	}

	function onPointerMove(e: PointerEvent): void {
		if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pinch && pointers.size >= 2) {
			const dist = pinchDistance();
			const centre = pinchCentre();
			if (pinch.dist > 0) {
				viewport.zoomBy(dist / pinch.dist, centre);
				viewport.panBy(centre.x - pinch.centre.x, centre.y - pinch.centre.y);
				deps.noteZoomed();
			}
			pinch = { dist, centre };
			deps.render();
			return;
		}
		let ds = s.drag;
		if (!ds) return;
		const t = viewport.transform();
		const curCm = viewport.clientToCm(e.clientX, e.clientY, t);
		if (!ds.committed) {
			const screenDist = Math.hypot(e.clientX - ds.startClientX, e.clientY - ds.startClientY);
			if (screenDist < TAP_PX) return;
			if (ds.kind === 'place') return; // a tap places; a drag with the tool on places nothing
			if (ds.kind === 'freeEnd') {
				if (screenDist < FREE_END_DECIDE_PX) return;
				ds = resolveFreeEnd(ds, curCm);
				s.drag = ds;
			}
			ds.committed = true;
			beginCommittedDrag(dragDeps, ds, deps.pushHistory);
		}
		if (ds.kind === 'pan') {
			viewport.panBy(e.clientX - ds.lastClientX, e.clientY - ds.lastClientY);
			deps.noteZoomed();
			ds.lastClientX = e.clientX;
			ds.lastClientY = e.clientY;
			deps.render();
			return;
		}
		applyDragMove(dragDeps, ds, curCm, t.scale);
		edgePanAt = { stage: viewport.stagePx(e.clientX, e.clientY), clientX: e.clientX, clientY: e.clientY };
		startEdgePan();
		deps.render();
	}

	function releaseCapture(e: PointerEvent): void {
		try {
			svg.releasePointerCapture(e.pointerId);
		} catch {
			/* a pointer never captured, or already gone, has nothing to release */
		}
	}

	function onPointerUp(e: PointerEvent): void {
		pointers.delete(e.pointerId);
		if (pinch) {
			/* The pinch ends with the last of the two fingers; whatever is left does not
			   become a stroke halfway through. */
			if (pointers.size < 2) pinch = null;
			releaseCapture(e);
			deps.render();
			return;
		}
		const ds = s.drag;
		if (!ds) return;
		stopEdgePan();
		release.onRelease(ds, e);
		releaseCapture(e);
		s.drag = null;
		deps.render();
	}

	function onPointerCancel(e: PointerEvent): void {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinch = null;
		cancelStroke();
		deps.render();
	}

	/* The wheel zooms around the pointer; a trackpad pinch arrives as a wheel event
	   with ctrlKey set, and only a non-passive listener may stop the page zooming. */
	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		const at = viewport.stagePx(e.clientX, e.clientY);
		const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
		viewport.zoomBy(factor, at);
		deps.render();
	}

	svg.addEventListener('pointerdown', onPointerDown);
	svg.addEventListener('pointermove', onPointerMove);
	svg.addEventListener('pointerup', onPointerUp);
	svg.addEventListener('pointercancel', onPointerCancel);
	svg.addEventListener('wheel', onWheel, { passive: false });

	return {
		onPointerDown,
		setSpaceDown: (down) => {
			spaceDown = down;
		},
		cancelStroke,
		destroy: () => {
			destroyed = true;
			stopEdgePan();
			svg.removeEventListener('pointerdown', onPointerDown);
			svg.removeEventListener('pointermove', onPointerMove);
			svg.removeEventListener('pointerup', onPointerUp);
			svg.removeEventListener('pointercancel', onPointerCancel);
			svg.removeEventListener('wheel', onWheel);
		}
	};
}
