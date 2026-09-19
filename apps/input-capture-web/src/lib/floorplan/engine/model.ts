/**
 * The editing model: an unordered set of wall pieces, each carrying its own
 * segments, and the landmarks placed against them. Two pieces are connected
 * purely by having numerically-coincident endpoints — there is no array-order
 * adjacency anywhere in the editor.
 *
 * Pure: cm in, cm out. Ids come from an `Ids` counter the mounting owns, so two
 * editors on one page never hand out the same one.
 */

import { landmarksOfModel, type EditorLandmark, type LandmarkFace } from './landmarks';

export type { EditorLandmark, LandmarkFace };
export { landmarksOfModel };

/** Who said a number: the client, the stroke that drew it, or the editor. */
export type LengthSource = 'typed' | 'drawn' | 'computed';

export interface Point {
	x: number;
	y: number;
}

export type SegmentKind = 'wall' | 'open' | 'window' | 'door';
export type Hinge = 'start' | 'end';
export type Swing = 'in' | 'out';
export type Heading = 'N' | 'E' | 'S' | 'W';
/** which of a wall's own two ends a lookup is about */
export type WallEnd = 'from' | 'to';

/** A number and who said it, the shape the snapshot carries too. */
export interface Measure {
	value: number;
	source: LengthSource;
}

export interface Segment {
	id: string;
	kind: SegmentKind;
	length: Measure;
	offsetFromStart: number;
	sill: Measure | null;
	hinge: Hinge | null;
	hingeSource: LengthSource | null;
	swing: Swing | null;
	swingSource: LengthSource | null;
}

export interface Wall {
	id: string;
	from: Point;
	to: Point;
	lengthSource: LengthSource;
	isOpen: boolean;
	segments: Segment[];
}

export interface Model {
	walls: Wall[];
	landmarks: EditorLandmark[];
}

/** What the canvas is on: a piece of a wall, or a landmark. */
export type Selection = { segId: string } | { landmarkId: string } | null;

export function selectedSegId(selection: Selection): string | null {
	return selection && 'segId' in selection ? selection.segId : null;
}
export function selectedLandmarkId(selection: Selection): string | null {
	return selection && 'landmarkId' in selection ? selection.landmarkId : null;
}

/** One piece of a wall found with the wall it is on and where in the list it sits. */
export interface SegFound {
	wall: Wall;
	seg: Segment;
	idx: number;
}

export const MIN_WALL = 1;
export const MIN_OPEN = 10;
export const DEFAULT_DOOR_W = 90;
export const DEFAULT_WINDOW_W = 60;
export const DEFAULT_SILL = 90;
/** plan-view wall thickness (a solid band, not a stroke), at the plan's own scale */
export const WALL_THICKNESS_CM = 20;
/** screen px, movement beyond this counts as a real drag, not a tap */
export const TAP_PX = 6;
/** screen px: how far a drag off a free end must travel before it is read as pull-to-resize
    rather than start-a-new-wall */
export const FREE_END_DECIDE_PX = 16;
/** cm — two points this close are "the same point" */
export const WELD_EPS = 0.5;
/** screen px — a drawn stroke shorter than this on-screen was a mis-click, not a deliberate
    wall. TAP_PX only gates tap-vs-drag at press; this is the second gate at commit, in screen
    px rather than cm so it behaves identically at every zoom level. */
export const MIN_STROKE_PX = 12;

export function r(n: number): number {
	return Math.round(n);
}
export function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}
export function dist(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
export function pointsEqual(a: Point, b: Point): boolean {
	return Math.abs(a.x - b.x) < WELD_EPS && Math.abs(a.y - b.y) < WELD_EPS;
}
export function pointKey(p: Point): string {
	return r(p.x) + ',' + r(p.y);
}

/** The id counter of one mounting. */
export class Ids {
	private counter = 1;
	next(prefix: string): string {
		return prefix + this.counter++;
	}
	/**
	 * Keeps the counter ahead of every id in a restored model, so a piece drawn
	 * after setModel can never collide with one that came back from storage.
	 */
	bumpPast(model: { walls?: Wall[]; landmarks?: EditorLandmark[] }): void {
		let max = 0;
		const note = (id: string | undefined): void => {
			const m = /(\d+)$/.exec(String(id || ''));
			if (m) max = Math.max(max, parseInt(m[1], 10));
		};
		(model.walls || []).forEach((w) => {
			note(w.id);
			(w.segments || []).forEach((s) => note(s.id));
		});
		(model.landmarks || []).forEach((mk) => note(mk.id));
		if (this.counter <= max) this.counter = max + 1;
	}
}

export function makeSegment(ids: Ids, kind: SegmentKind | null, lengthCm: number, source?: LengthSource): Segment {
	return {
		id: ids.next('seg'),
		kind: kind || 'wall',
		length: { value: r(lengthCm), source: source || 'computed' },
		offsetFromStart: 0,
		sill: null,
		hinge: null,
		hingeSource: null,
		swing: null,
		swingSource: null
	};
}

/**
 * A wall's two ends must share exactly one coordinate: the room is drawn and
 * squared on axis-aligned strokes only, and a wall that differed on both axes
 * would report its Euclidean distance as the drawn number with nothing on
 * screen saying the room is not square. Every caller lands on-axis before it
 * gets here — refuse rather than store a diagonal.
 */
export function makeWall(ids: Ids, from: Point, to: Point, source?: LengthSource, kind?: SegmentKind | null): Wall {
	if (r(from.x) !== r(to.x) && r(from.y) !== r(to.y)) {
		throw new Error(
			'makeWall: refusing a diagonal wall from (' + from.x + ',' + from.y + ') to (' + to.x + ',' + to.y + ')'
		);
	}
	const segKind: SegmentKind = kind === 'open' ? 'open' : 'wall';
	const w: Wall = {
		id: ids.next('wall'),
		from: { x: from.x, y: from.y },
		to: { x: to.x, y: to.y },
		lengthSource: source || 'computed',
		isOpen: segKind === 'open',
		segments: []
	};
	w.segments = [makeSegment(ids, segKind, dist(w.from, w.to), source || 'computed')];
	return w;
}

export function minFor(kind: SegmentKind): number {
	return kind === 'window' || kind === 'door' ? MIN_OPEN : MIN_WALL;
}

/** A deep clone: what history snapshots and what getModel hands out. */
export function cloneModel(model: { walls: Wall[]; landmarks?: EditorLandmark[] }): Model {
	return {
		walls: JSON.parse(JSON.stringify(model.walls)) as Wall[],
		landmarks: JSON.parse(JSON.stringify(model.landmarks || [])) as EditorLandmark[]
	};
}

export function findWall(model: Model, id: string | null): Wall | null {
	if (id === null) return null;
	for (const w of model.walls) if (w.id === id) return w;
	return null;
}

export function findSeg(model: Model, wallId: string | null, segId: string | null): SegFound | null {
	const w = findWall(model, wallId);
	if (!w) return null;
	for (let i = 0; i < w.segments.length; i++) {
		if (w.segments[i].id === segId) return { wall: w, seg: w.segments[i], idx: i };
	}
	return null;
}

export function findSegAnywhere(model: Model, segId: string | null): SegFound | null {
	if (segId === null) return null;
	for (const w of model.walls) {
		for (let j = 0; j < w.segments.length; j++) {
			if (w.segments[j].id === segId) return { wall: w, seg: w.segments[j], idx: j };
		}
	}
	return null;
}

export function findLandmark(model: Model, id: string | null): EditorLandmark | null {
	if (id === null) return null;
	for (const m of model.landmarks || []) if (m.id === id) return m;
	return null;
}

export function landmarksOn(model: Model, wallId: string): EditorLandmark[] {
	return (model.landmarks || []).filter((m) => m.wallId === wallId);
}
