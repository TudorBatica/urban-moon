/**
 * Every edit that moves the outline itself: pushing a wall, dragging a corner,
 * committing a drawn stroke, typing a length, deleting a piece, and the
 * rounding that makes a weld bit-exact at release.
 *
 * Nothing here shows anything. What the client would be asked — the most that
 * fits, where a typed number did not — is returned; the caller asks it. The one
 * side effect that arrives as a parameter is `beforeChange`: the history step,
 * taken at the moment the model is about to change and not before, so a gesture
 * that comes to nothing leaves no step.
 */

import {
	MIN_WALL,
	clamp,
	findSegAnywhere,
	findWall,
	minFor,
	r,
	selectedLandmarkId,
	selectedSegId,
	type Ids,
	type LengthSource,
	type Model,
	type Point,
	type Selection,
	type Wall,
	type WallEnd
} from './model';
import { headingOf, neighborAt, segTotal, wallDir, wallLen, wallNormal, wallsAtPoint } from './topology';
import {
	mergeAdjacentPlain,
	openingsTotalCm,
	reflow,
	removeSegmentToWall,
	sliceSegments,
	syncSegments,
	type IsFresh
} from './openings';
import { reassignOnMerge, reassignOnSplit, withoutWall } from './landmarks';

/** Taken just before the model changes: the caller's own history step. */
export type BeforeChange = () => void;

/** The answer to a typed length: whether it was taken, and what was refused. */
export interface LengthCommit {
	ok: boolean;
	/** the most that fits, where the number asked for did not */
	max?: number;
	/** there was no such piece to change */
	missing?: boolean;
}

/**
 * Translate a wall along its own normal. Only the immediate neighbours sharing
 * a corner with it can change length as a result — nothing further away is ever
 * touched. A wall with a free end simply extends there instead.
 */
export function pushWallByRef(model: Model, w: Wall, delta: number): void {
	if (Math.abs(delta) < 1e-9) return;
	const n = wallNormal(w);
	const prevInfo = neighborAt(model, w, 'from');
	const nextInfo = neighborAt(model, w, 'to');
	const mx = n.x * delta;
	const my = n.y * delta;
	w.from.x += mx; w.from.y += my;
	w.to.x += mx; w.to.y += my;
	if (prevInfo) {
		prevInfo.wall[prevInfo.end].x = w.from.x; prevInfo.wall[prevInfo.end].y = w.from.y;
	}
	if (nextInfo) {
		nextInfo.wall[nextInfo.end].x = w.to.x; nextInfo.wall[nextInfo.end].y = w.to.y;
	}
}

export function dragPushWall(ids: Ids, model: Model, wallId: string, deltaCm: number, isFresh: IsFresh): void {
	const w = findWall(model, wallId);
	if (!w) return;
	const prevInfo = neighborAt(model, w, 'from');
	const nextInfo = neighborAt(model, w, 'to');
	const beforePrev = prevInfo ? wallLen(prevInfo.wall) : null;
	const beforeNext = nextInfo ? wallLen(nextInfo.wall) : null;
	pushWallByRef(model, w, deltaCm);
	if (prevInfo && wallLen(prevInfo.wall) !== beforePrev) prevInfo.wall.lengthSource = 'drawn';
	if (nextInfo && wallLen(nextInfo.wall) !== beforeNext) nextInfo.wall.lengthSource = 'drawn';
	cleanupOutline(ids, model, isFresh);
	syncSegments(ids, model, isFresh);
}

/**
 * Move the point two walls share freely in 2D, decomposed into each wall's own
 * normal component — the two walls meeting at a right angle are themselves
 * perpendicular, so this is two uses of the one push primitive.
 */
export function dragCornerAtPoint(
	ids: Ids,
	model: Model,
	vertexPt: Point,
	dx: number,
	dy: number,
	isFresh: IsFresh
): void {
	const touches = wallsAtPoint(model, vertexPt, null);
	const lenBefore: Record<string, number> = {};
	model.walls.forEach((w) => {
		lenBefore[w.id] = wallLen(w);
	});
	touches.forEach((t) => {
		const w = t.wall;
		const n = wallNormal(w);
		pushWallByRef(model, w, dx * n.x + dy * n.y);
		/* the wall dragged directly, even though a rigid translation leaves its
		   OWN length unchanged */
		w.lengthSource = 'drawn';
	});
	/* a push's own neighbour-sync can change a one-hop wall's length too */
	model.walls.forEach((w) => {
		if (lenBefore[w.id] !== undefined && wallLen(w) !== lenBefore[w.id]) w.lengthSource = 'drawn';
	});
	cleanupOutline(ids, model, isFresh);
	syncSegments(ids, model, isFresh);
}

/**
 * Drops degenerate walls, healing the gap behind them, and fuses two walls that
 * meet end to end with the same heading — a push or a corner drag straightening
 * a jog leaves them collinear with nothing marking a seam.
 */
export function cleanupOutline(ids: Ids, model: Model, isFresh: IsFresh): void {
	let changed = true;
	let guard = 0;
	while (changed && guard++ < 60) {
		changed = false;
		for (let i = 0; i < model.walls.length; i++) {
			const w = model.walls[i];
			if (r(wallLen(w)) === 0) {
				const prevInfo = neighborAt(model, w, 'from');
				const nextInfo = neighborAt(model, w, 'to');
				if (prevInfo) {
					prevInfo.wall[prevInfo.end].x = w.to.x; prevInfo.wall[prevInfo.end].y = w.to.y;
				} else if (nextInfo) {
					nextInfo.wall[nextInfo.end].x = w.from.x; nextInfo.wall[nextInfo.end].y = w.from.y;
				}
				model.landmarks = withoutWall(model.landmarks || [], w.id);
				model.walls.splice(i, 1);
				changed = true;
				break;
			}
		}
		if (changed) continue;
		for (let j = 0; j < model.walls.length; j++) {
			const a = model.walls[j];
			const nInfo = neighborAt(model, a, 'to');
			if (!nInfo || nInfo.end !== 'from') continue;
			const b = nInfo.wall;
			if (headingOf(a) !== headingOf(b)) continue;
			/* b is read from->to here, so everything on it moves along by exactly
			   the run a already holds — its landmarks included */
			const seamCm = segTotal(a);
			const mergedSegs = a.segments.concat(
				b.segments.map((s) => {
					const c = JSON.parse(JSON.stringify(s)) as typeof s;
					c.offsetFromStart += seamCm;
					return c;
				})
			);
			model.landmarks = reassignOnMerge(model.landmarks || [], b.id, a.id, seamCm);
			a.to.x = b.to.x; a.to.y = b.to.y;
			a.segments = mergedSegs;
			a.lengthSource = 'computed';
			/* the wall-level merge only concatenates each side's own list; the seam
			   between them is two same-kind pieces meeting with nothing in between,
			   which is exactly what this fuses into one */
			mergeAdjacentPlain(a, isFresh);
			model.walls.splice(model.walls.indexOf(b), 1);
			changed = true;
			break;
		}
	}
}

/**
 * A T-junction: split an existing wall at a point strictly between its own
 * ends, so both halves stay addressable — id, hit target and chip of their own.
 */
export function splitWallAtPoint(
	ids: Ids,
	model: Model,
	wallId: string,
	point: Point
): { point: Point; leadId: string; tailId: string } | null {
	const w = findWall(model, wallId);
	if (!w) return null;
	const d = wallDir(w);
	const total = r(wallLen(w));
	const offset = clamp(r((point.x - w.from.x) * d.x + (point.y - w.from.y) * d.y), 1, total - 1);
	const leadSegs = sliceSegments(ids, w.segments, 0, offset);
	const tailSegs = sliceSegments(ids, w.segments, offset, total);
	const mid = { x: w.from.x + d.x * offset, y: w.from.y + d.y * offset };
	const wLead: Wall = {
		id: ids.next('wall'),
		from: { x: w.from.x, y: w.from.y },
		to: { x: mid.x, y: mid.y },
		lengthSource: 'computed',
		isOpen: w.isOpen,
		segments: leadSegs
	};
	const wTail: Wall = {
		id: ids.next('wall'),
		from: { x: mid.x, y: mid.y },
		to: { x: w.to.x, y: w.to.y },
		lengthSource: 'computed',
		isOpen: w.isOpen,
		segments: tailSegs
	};
	model.walls.splice(model.walls.indexOf(w), 1, wLead, wTail);
	model.landmarks = reassignOnSplit(
		model.landmarks || [],
		w.id,
		offset,
		{ id: wLead.id, lengthCm: offset },
		{ id: wTail.id, lengthCm: total - offset }
	);
	return { point: mid, leadId: wLead.id, tailId: wTail.id };
}

/**
 * Typing a wall's own length holds every piece on it where it is and lets the
 * wall's far corner absorb the difference — one hop past the wall actually
 * touched, the same as a push. A free end just extends.
 */
export function setWallLengthExact(
	ids: Ids,
	model: Model,
	wallId: string,
	newLength: number,
	source: LengthSource,
	isFresh: IsFresh
): void {
	const w = findWall(model, wallId);
	if (!w) return;
	const delta = newLength - wallLen(w);
	w.lengthSource = source || 'typed';
	if (Math.abs(delta) < 1e-9) {
		syncSegments(ids, model, isFresh);
		return;
	}
	const d = wallDir(w);
	const nextInfo = neighborAt(model, w, 'to');
	if (!nextInfo) {
		w.to.x = w.from.x + d.x * newLength; w.to.y = w.from.y + d.y * newLength;
		cleanupOutline(ids, model, isFresh);
		syncSegments(ids, model, isFresh);
		return;
	}
	const next = nextInfo.wall;
	const nn = wallNormal(next);
	const sign = d.x * nn.x + d.y * nn.y >= 0 ? 1 : -1;
	const afterEnd: WallEnd = nextInfo.end === 'from' ? 'to' : 'from';
	const afterInfo = neighborAt(model, next, afterEnd);
	const afterBefore = afterInfo ? wallLen(afterInfo.wall) : null;
	pushWallByRef(model, next, sign * delta);
	if (afterInfo && wallLen(afterInfo.wall) !== afterBefore) {
		afterInfo.wall.lengthSource = 'computed';
	}
	cleanupOutline(ids, model, isFresh);
	syncSegments(ids, model, isFresh);
}

/** A piece's own typed length: the wall grows or shrinks by the difference. */
export function commitWallPieceLength(
	ids: Ids,
	model: Model,
	segId: string,
	newLenRaw: number,
	source: LengthSource,
	isFresh: IsFresh,
	beforeChange: BeforeChange
): LengthCommit {
	const f = findSegAnywhere(model, segId);
	if (!f) return { ok: true, missing: true };
	const { wall: w, seg } = f;
	const newLen = Math.max(minFor(seg.kind), r(newLenRaw));
	if (newLen === seg.length.value) {
		seg.length.source = source;
		return { ok: true };
	}
	beforeChange();
	const otherTotal = segTotal(w) - seg.length.value;
	const newWallTotal = otherTotal + newLen;
	seg.length.value = newLen;
	seg.length.source = source;
	reflow(w);
	setWallLengthExact(ids, model, w.id, newWallTotal, otherTotal === 0 ? source : 'computed', isFresh);
	return { ok: true };
}

/** The wall's own aggregate number: refused below what the openings on it need. */
export function commitWallTotal(
	ids: Ids,
	model: Model,
	anySegIdOnWall: string,
	newTotalRaw: number,
	source: LengthSource,
	isFresh: IsFresh,
	beforeChange: BeforeChange
): LengthCommit {
	const f = findSegAnywhere(model, anySegIdOnWall);
	if (!f) return { ok: false };
	const w = f.wall;
	const floor = Math.max(MIN_WALL, openingsTotalCm(w));
	const newTotal = r(newTotalRaw);
	if (newTotal < floor) return { ok: false, max: floor };
	beforeChange();
	setWallLengthExact(ids, model, w.id, newTotal, source, isFresh);
	return { ok: true };
}

/**
 * A wall grows at its own free end so the opening slid past it can be the last
 * piece of the run; the far jamb becomes the wall's end, which is the free end
 * a new stroke welds onto.
 */
export function extendWallAtEnd(w: Wall, end: WallEnd, byCm: number): void {
	if (byCm <= 0) return;
	const d = wallDir(w);
	if (end === 'to') {
		w.to.x = r(w.to.x + d.x * byCm); w.to.y = r(w.to.y + d.y * byCm);
	} else {
		w.from.x = r(w.from.x - d.x * byCm); w.from.y = r(w.from.y - d.y * byCm);
	}
	w.lengthSource = 'drawn';
}

/**
 * Deleting a piece of a wall shrinks the wall itself by that piece's length
 * rather than letting the rest stretch over the gap, so every other piece keeps
 * the real-world length the client gave it. The end that absorbs the shrink is
 * the far one from the piece, so nothing between them moves. A wall's only
 * piece takes the whole wall with it.
 *
 * `releaseFocus` is called the moment the piece is gone and before anything is
 * cleaned up: what a wall fuses into is decided by `isFresh`, and a piece that
 * has just been deleted must not still read as the one being worked on. The
 * plain piece a removed opening becomes keeps that opening's own id.
 */
export function deleteSelection(
	ids: Ids,
	model: Model,
	selection: Selection,
	isFresh: IsFresh,
	beforeChange: BeforeChange,
	releaseFocus: () => void
): boolean {
	const landmarkId = selectedLandmarkId(selection);
	if (landmarkId !== null) {
		const mark = (model.landmarks || []).find((m) => m.id === landmarkId);
		if (!mark) return false;
		beforeChange();
		model.landmarks = (model.landmarks || []).filter((m) => m.id !== mark.id);
		releaseFocus();
		return true;
	}
	const f = findSegAnywhere(model, selectedSegId(selection));
	if (!f) return false;
	const { wall: w, seg } = f;
	beforeChange();
	if (seg.kind === 'window' || seg.kind === 'door') {
		removeSegmentToWall(model, w.id, seg.id, isFresh);
	} else if (w.segments.length > 1) {
		const removedLen = seg.length.value;
		const idx = w.segments.indexOf(seg);
		const d = wallDir(w);
		w.segments.splice(idx, 1);
		reflow(w);
		if (idx === 0) {
			w.from = { x: w.from.x + d.x * removedLen, y: w.from.y + d.y * removedLen };
		} else {
			w.to = { x: w.to.x - d.x * removedLen, y: w.to.y - d.y * removedLen };
		}
		w.lengthSource = 'computed';
	} else {
		const wi = model.walls.indexOf(w);
		if (wi !== -1) model.walls.splice(wi, 1);
	}
	releaseFocus();
	cleanupOutline(ids, model, isFresh);
	syncSegments(ids, model, isFresh);
	return true;
}

/**
 * Mid-drag every endpoint a push or a corner touches sits at whatever
 * fractional-cm value the raw pointer movement produced — nothing rounds while
 * it is live, or dragging would feel sticky. Release is the one moment it has
 * to happen, because a wall landing visually flush against another is still off
 * by a fraction of a centimetre and nothing would call that a weld.
 */
export function roundAllEndpoints(model: Model): void {
	model.walls.forEach((w) => {
		w.from.x = r(w.from.x); w.from.y = r(w.from.y);
		w.to.x = r(w.to.x); w.to.y = r(w.to.y);
	});
}

/** The endpoints a snap caught mid-drag, to be put on the target exactly. */
export type SnapWeld =
	| { kind: 'push'; wallId: string; point: Point; end: WallEnd }
	| { kind: 'corner'; point: Point; touches: { wallId: string; end: WallEnd }[] };

/**
 * A snap that caught mid-drag is forced onto the target vertex's exact
 * coordinates, so the weld is bit-for-bit equal rather than only close enough
 * after rounding.
 */
export function forceSnapWeld(model: Model, weld: SnapWeld | null): void {
	if (!weld) return;
	if (weld.kind === 'push') {
		const w = findWall(model, weld.wallId);
		if (w) {
			w[weld.end].x = weld.point.x; w[weld.end].y = weld.point.y;
		}
		return;
	}
	weld.touches.forEach((tc) => {
		const tw = findWall(model, tc.wallId);
		if (tw) {
			tw[tc.end].x = weld.point.x; tw[tc.end].y = weld.point.y;
		}
	});
}
