/**
 * Read-only geometry and connectivity over a model. Adjacency is read from
 * shared points, never from where a wall sits in the array; closure is derived
 * live by walking that graph rather than being a flag some gesture set.
 *
 * Nothing here ever mutates.
 */

import {
	clamp,
	dist,
	pointKey,
	pointsEqual,
	r,
	type Heading,
	type Model,
	type Point,
	type Segment,
	type Wall,
	type WallEnd
} from './model';
import { boxOf, type Box } from './view';

export function wallLen(w: Wall): number {
	return dist(w.from, w.to);
}
export function wallDir(w: { from: Point; to: Point }): Point {
	const dx = w.to.x - w.from.x;
	const dy = w.to.y - w.from.y;
	const len = Math.hypot(dx, dy) || 1;
	return { x: dx / len, y: dy / len };
}
export function wallNormal(w: { from: Point; to: Point }): Point {
	const d = wallDir(w);
	return { x: -d.y, y: d.x };
}
export function headingOf(w: { from: Point; to: Point }): Heading {
	const dx = w.to.x - w.from.x;
	const dy = w.to.y - w.from.y;
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
	return dy >= 0 ? 'S' : 'N';
}
export function headingVec(h: Heading): Point {
	return h === 'N'
		? { x: 0, y: -1 }
		: h === 'S'
			? { x: 0, y: 1 }
			: h === 'E'
				? { x: 1, y: 0 }
				: { x: -1, y: 0 };
}
export function snapHeading(dx: number, dy: number): Heading {
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W';
	return dy >= 0 ? 'S' : 'N';
}
export function segLen(s: Segment): number {
	return s.length.value;
}
export function segTotal(w: Wall): number {
	let t = 0;
	w.segments.forEach((s) => {
		t += segLen(s);
	});
	return t;
}

/** One wall touching a point, and which of its own ends is there. */
export interface WallAtPoint {
	wall: Wall;
	end: WallEnd;
}

/** Every OTHER wall with an endpoint exactly at `pt`. */
export function wallsAtPoint(model: Model, pt: Point, excludeId: string | null): WallAtPoint[] {
	const out: WallAtPoint[] = [];
	model.walls.forEach((w) => {
		if (w.id === excludeId) return;
		if (pointsEqual(w.from, pt)) out.push({ wall: w, end: 'from' });
		if (pointsEqual(w.to, pt)) out.push({ wall: w, end: 'to' });
	});
	return out;
}

/**
 * The single neighbour touching this wall's given end, if there is exactly one
 * — the ordinary case of two walls meeting at a corner. A point where three or
 * more walls meet has no single answer on purpose: push and corner-drag only
 * ever move an unambiguous joint.
 */
export function neighborAt(model: Model, w: Wall, end: WallEnd): WallAtPoint | null {
	const others = wallsAtPoint(model, w[end], w.id);
	return others.length === 1 ? others[0] : null;
}

export function isFreeEnd(model: Model, w: Wall, end: WallEnd): boolean {
	return wallsAtPoint(model, w[end], w.id).length === 0;
}

export interface ChainEntry {
	wall: Wall;
	entry: WallEnd;
}

export interface TracedChain {
	walls: ChainEntry[];
	points: [number, number][];
	/** the walk returned to the start wall at exactly the end it entered from: a clean ring */
	closed: boolean;
	visited: Record<string, boolean>;
}

/**
 * Walks a connected chain of walls from `startWall`, treating `startEnd` as
 * that wall's own entry point, so the chain reads away from it. Orientation-
 * agnostic: each wall may have been drawn in either direction, so this always
 * exits by whichever end is not where it entered.
 */
export function traceChain(model: Model, startWall: Wall, startEnd: WallEnd): TracedChain {
	const visited: Record<string, boolean> = {};
	const walls: ChainEntry[] = [];
	const points: [number, number][] = [[r(startWall[startEnd].x), r(startWall[startEnd].y)]];
	let cur: Wall | null = startWall;
	let entryEnd: WallEnd = startEnd;
	let closedBack = false;
	let guard = 0;
	while (cur && guard++ < model.walls.length + 2) {
		visited[cur.id] = true;
		walls.push({ wall: cur, entry: entryEnd });
		const exitEnd: WallEnd = entryEnd === 'from' ? 'to' : 'from';
		const exitPt = cur[exitEnd];
		points.push([r(exitPt.x), r(exitPt.y)]);
		const others = wallsAtPoint(model, exitPt, cur.id);
		if (others.length !== 1) break; // a dangling free end, or a T-junction
		const nxt = others[0];
		if (nxt.wall.id === startWall.id) {
			if (nxt.end === startEnd) closedBack = true; // head to tail, a clean ring
			break;
		}
		if (visited[nxt.wall.id]) break; // revisits without covering a simple ring
		cur = nxt.wall;
		entryEnd = nxt.end;
	}
	return { walls, points, closed: closedBack, visited };
}

/**
 * Closed iff the chain from the first wall forms a clean ring covering every
 * wall in the model — derived live, every time it is asked, never a flag.
 */
export function findClosedRing(model: Model): TracedChain | null {
	if (model.walls.length < 4) return null;
	const chain = traceChain(model, model.walls[0], 'from');
	return chain.closed && chain.walls.length === model.walls.length ? chain : null;
}

export function isClosedLoop(model: Model): boolean {
	return !!findClosedRing(model);
}

/** One place two or more wall ends meet, or one free end standing alone. */
export interface Vertex {
	point: Point;
	refs: WallAtPoint[];
}

/** Every existing wall endpoint, deduped by exact point. */
export function collectVertices(model: Model): Vertex[] {
	const seen: Record<string, Vertex> = {};
	model.walls.forEach((w) => {
		const pairs: [WallEnd, Point][] = [
			['from', w.from],
			['to', w.to]
		];
		pairs.forEach(([end, point]) => {
			const key = pointKey(point);
			if (!seen[key]) seen[key] = { point, refs: [] };
			seen[key].refs.push({ wall: w, end });
		});
	});
	return Object.keys(seen).map((k) => seen[k]);
}

export function projectOnSegment(pt: Point, a: Point, b: Point): { t: number; point: Point } {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 < 1e-9) return { t: 0, point: { x: a.x, y: a.y } };
	const tt = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
	const tc = clamp(tt, 0, 1);
	return { t: tc, point: { x: a.x + dx * tc, y: a.y + dy * tc } };
}

export function pointAlong(w: Wall, cm: number): Point {
	const d = wallDir(w);
	return { x: w.from.x + d.x * cm, y: w.from.y + d.y * cm };
}

/** A segment's own two ends, in the world the plan is drawn in. */
export function segPoints(w: Wall, s: Segment): { p0: Point; p1: Point } {
	const d = wallDir(w);
	return {
		p0: { x: w.from.x + d.x * s.offsetFromStart, y: w.from.y + d.y * s.offsetFromStart },
		p1: {
			x: w.from.x + d.x * (s.offsetFromStart + s.length.value),
			y: w.from.y + d.y * (s.offsetFromStart + s.length.value)
		}
	};
}

export function planPoints(model: Model): Point[] {
	const pts: Point[] = [];
	model.walls.forEach((w) => {
		pts.push(w.from);
		pts.push(w.to);
	});
	return pts;
}

export function planBox(model: Model): Box | null {
	return boxOf(planPoints(model));
}

export interface WallUnderPoint {
	wall: Wall;
	alongCm: number;
}

/**
 * The wall a tap landed on, found from the geometry rather than from what is
 * under the pointer: on the landmark step the plan carries no hit targets of
 * its own. A Fără perete side is never one of them.
 */
export function wallUnderPoint(model: Model, pt: Point, reachCm: number): WallUnderPoint | null {
	let best: WallUnderPoint | null = null;
	let bestAcross = Infinity;
	model.walls.forEach((w) => {
		if (w.isOpen) return;
		const d = wallDir(w);
		const n = wallNormal(w);
		const len = wallLen(w);
		const along = (pt.x - w.from.x) * d.x + (pt.y - w.from.y) * d.y;
		if (along < -reachCm || along > len + reachCm) return;
		const across = Math.abs((pt.x - w.from.x) * n.x + (pt.y - w.from.y) * n.y);
		if (across > reachCm || across >= bestAcross) return;
		bestAcross = across;
		best = { wall: w, alongCm: clamp(along, 0, len) };
	});
	return best;
}
