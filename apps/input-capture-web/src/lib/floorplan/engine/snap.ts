/**
 * What a gesture catches. Every radius here is in SCREEN pixels, through the
 * view's own scale, so snapping feels the same at every zoom and on every
 * device; nothing near enough is not an error, only a free-floating piece.
 *
 * Which finder is used is decided by how many degrees of freedom the gesture
 * has: a stroke's far end has two, a push and a free-end resize have one.
 */

import {
	MIN_WALL,
	WELD_EPS,
	r,
	type Heading,
	type Model,
	type Point,
	type Wall,
	type WallEnd
} from './model';
import {
	collectVertices,
	headingOf,
	headingVec,
	isFreeEnd,
	wallDir,
	wallNormal,
	wallsAtPoint
} from './topology';

/** screen px — identical feel at every zoom, on every device */
export const SNAP_PX = 20;

export type Snap =
	| { kind: 'none'; point: Point; weld: false }
	| { kind: 'end'; point: Point; weld: true }
	| { kind: 'corner'; point: Point; weld: true }
	| { kind: 'tjunction'; point: Point; wallId: string; weld: true }
	/** lined up on one axis with some other point: the length changes, nothing welds */
	| { kind: 'align'; point: Point; guideAt: Point; weld: false };

/** What a push caught: how far to travel, and which of its own ends lands there. */
export interface PushSnap {
	delta: number;
	point: Point;
	end: WallEnd;
}

export function distPx(a: Point, b: Point, scale: number): number {
	return Math.hypot(a.x - b.x, a.y - b.y) * scale;
}

function weldAt(refs: number): 'end' | 'corner' {
	return refs === 1 ? 'end' : 'corner';
}

function nearestVertex(model: Model, to: Point, scale: number): { point: Point; refs: number } | null {
	let best: { point: Point; refs: number } | null = null;
	let bestPx = SNAP_PX;
	collectVertices(model).forEach((v) => {
		const d = distPx(to, v.point, scale);
		if (d <= bestPx) {
			bestPx = d;
			best = { point: { x: v.point.x, y: v.point.y }, refs: v.refs.length };
		}
	});
	return best;
}

/**
 * A stroke's START point: vertices only. The snap radius is always smaller than
 * half the hit rect a wall's own body claims, so a press near enough to a
 * wall's line to T-junction there is already inside that wall's hit rect —
 * which must mean "push this wall", never "branch off it".
 */
export function findStartSnap(model: Model, pt: Point, scale: number): Snap {
	const v = nearestVertex(model, pt, scale);
	if (v) return { kind: weldAt(v.refs), point: v.point, weld: true };
	return { kind: 'none', point: { x: r(pt.x), y: r(pt.y) }, weld: false };
}

/**
 * A stroke's live END point, given a fixed start and an orthogonally-snapped
 * heading. A vertex weld returns the target vertex's own exact point — which
 * vertex to weld onto — even when that point is off the stroke's own axis;
 * committing is what squares the geometry. A T-junction is different: every
 * wall is axis-aligned by construction, so a stroke crossing a perpendicular
 * wall has an exact intersection with its own axis and needs no squaring at
 * all. Alignment never welds.
 */
export function findEndpointSnap(
	model: Model,
	startPt: Point,
	heading: Heading,
	rawLen: number,
	scale: number
): Snap {
	const dvec = headingVec(heading);
	const rawEnd = { x: startPt.x + dvec.x * rawLen, y: startPt.y + dvec.y * rawLen };
	const v = nearestVertex(model, rawEnd, scale);
	if (v) return { kind: weldAt(v.refs), point: v.point, weld: true };

	const strokeHorizontal = heading === 'E' || heading === 'W';
	let bestSeg: { wall: Wall; point: Point } | null = null;
	let bestSegPx = SNAP_PX;
	model.walls.forEach((w) => {
		const wVertical = headingOf(w) === 'N' || headingOf(w) === 'S';
		if (wVertical !== strokeHorizontal) return; // parallel to the stroke: no perpendicular crossing
		const ipoint = strokeHorizontal ? { x: w.from.x, y: startPt.y } : { x: startPt.x, y: w.from.y };
		const along = strokeHorizontal
			? (ipoint.x - w.from.x) / (w.to.x - w.from.x)
			: (ipoint.y - w.from.y) / (w.to.y - w.from.y);
		if (along <= 0.02 || along >= 0.98) return; // off the wall's own ends
		const d = distPx(rawEnd, ipoint, scale);
		if (d <= bestSegPx) {
			bestSegPx = d;
			bestSeg = { wall: w, point: ipoint };
		}
	});
	if (bestSeg) {
		const hit: { wall: Wall; point: Point } = bestSeg;
		return {
			kind: 'tjunction',
			point: { x: hit.point.x, y: hit.point.y },
			wallId: hit.wall.id,
			weld: true
		};
	}

	let bestAlign: { free: number; guideAt: Point } | null = null;
	let bestAlignPx = SNAP_PX;
	collectVertices(model).forEach((vertex) => {
		const free = strokeHorizontal ? vertex.point.x : vertex.point.y;
		const rawFree = strokeHorizontal ? rawEnd.x : rawEnd.y;
		const dPx = Math.abs(free - rawFree) * scale;
		if (dPx <= bestAlignPx) {
			bestAlignPx = dPx;
			bestAlign = { free, guideAt: vertex.point };
		}
	});
	if (bestAlign) {
		const found: { free: number; guideAt: Point } = bestAlign;
		return {
			kind: 'align',
			point: strokeHorizontal
				? { x: found.free, y: startPt.y }
				: { x: startPt.x, y: found.free },
			guideAt: found.guideAt,
			weld: false
		};
	}
	return { kind: 'none', point: { x: r(rawEnd.x), y: r(rawEnd.y) }, weld: false };
}

/** Which end of the wall stays put while a free-end resize pulls the other. */
export interface ResizeAxis {
	fixedEnd: WallEnd;
	heading: Heading;
}

/**
 * A free-end resize: one degree of freedom, measured from the wall's own fixed
 * end along its own heading, which is the same shape as a draw stroke whose
 * start and heading are both already pinned — so vertex welds, T-junctions and
 * the alignment guide come for free.
 *
 * A vertex weld hands back the target's own exact point even when it sits off
 * this wall's axis: fine for a fresh stroke, which is squared at commit, but a
 * resize has no squaring step and its caller writes this point straight into
 * the moving end. An off-axis weld is refused and falls back to the plain
 * on-axis projection — a length change only, exactly like the align case.
 */
export function resizeEndpointSnap(model: Model, w: Wall, axis: ResizeAxis, pt: Point, scale: number): Snap {
	const fixedPt = w[axis.fixedEnd];
	const dvec = headingVec(axis.heading);
	let openingsTotal = 0;
	w.segments.forEach((s) => {
		if (s.kind === 'window' || s.kind === 'door') openingsTotal += s.length.value;
	});
	const rawLen = Math.max(
		Math.max(MIN_WALL, openingsTotal),
		(pt.x - fixedPt.x) * dvec.x + (pt.y - fixedPt.y) * dvec.y
	);
	const snap = findEndpointSnap(model, fixedPt, axis.heading, rawLen, scale);
	if (snap.weld && (snap.kind === 'end' || snap.kind === 'corner')) {
		const offAxis =
			axis.heading === 'E' || axis.heading === 'W'
				? Math.abs(snap.point.y - fixedPt.y)
				: Math.abs(snap.point.x - fixedPt.x);
		if (offAxis >= WELD_EPS) {
			const onAxisLen = (snap.point.x - fixedPt.x) * dvec.x + (snap.point.y - fixedPt.y) * dvec.y;
			return {
				kind: 'none',
				point: { x: r(fixedPt.x + dvec.x * onAxisLen), y: r(fixedPt.y + dvec.y * onAxisLen) },
				weld: false
			};
		}
	}
	return snap;
}

/**
 * A push has exactly one degree of freedom — translation along the dragged
 * wall's own normal — so there is no nearest vertex in 2D to test, only how far
 * along that single axis a FREE end would have to travel to land exactly on
 * some other vertex. A welded end has no freedom of its own to chase a snap
 * independently of its neighbour, so only free ends are checked.
 */
export function findPushSnap(model: Model, w: Wall, rawDelta: number, scale: number): PushSnap | null {
	const n = wallNormal(w);
	const d = wallDir(w);
	const vertices = collectVertices(model);
	let best: PushSnap | null = null;
	let bestPx = SNAP_PX;
	const ends: WallEnd[] = ['from', 'to'];
	ends.forEach((end) => {
		if (!isFreeEnd(model, w, end)) return;
		const E = w[end];
		vertices.forEach((v) => {
			// chasing the wall's own other end is not a snap
			if (v.refs.some((ref) => ref.wall.id === w.id)) return;
			const vd = (v.point.x - E.x) * n.x + (v.point.y - E.y) * n.y;
			const offAxis = (v.point.x - E.x) * d.x + (v.point.y - E.y) * d.y;
			/* A candidate matching on the normal but sitting off to the side along
			   the wall's own length would need the wall slid sideways too, which
			   stretches whatever is welded at its other end: refuse rather than do
			   that silently. */
			if (Math.abs(offAxis) > 1) return;
			const px = Math.abs(vd - rawDelta) * scale;
			if (px <= bestPx) {
				bestPx = px;
				best = { delta: vd, point: { x: v.point.x, y: v.point.y }, end };
			}
		});
	});
	return best;
}

/**
 * A corner drag: two degrees of freedom, so a plain nearest-vertex search on
 * the raw target point, excluding every vertex that shares a wall with the
 * corner being dragged — those walls and both their ends move with it, so they
 * can never be a meaningful target.
 */
export function findCornerSnap(model: Model, vertexPt: Point, dx: number, dy: number, scale: number): Point | null {
	const touchIds: Record<string, boolean> = {};
	wallsAtPoint(model, vertexPt, null).forEach((tc) => (touchIds[tc.wall.id] = true));
	const target = { x: vertexPt.x + dx, y: vertexPt.y + dy };
	let best: Point | null = null;
	let bestPx = SNAP_PX;
	collectVertices(model).forEach((v) => {
		if (v.refs.some((ref) => touchIds[ref.wall.id])) return;
		const d = distPx(target, v.point, scale);
		if (d <= bestPx) {
			bestPx = d;
			best = { x: v.point.x, y: v.point.y };
		}
	});
	return best;
}

