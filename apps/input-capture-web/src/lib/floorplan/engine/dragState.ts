/**
 * The gesture in flight, as a union on its kind. Intent is decided once at
 * press, before any movement, and never changes afterwards — except for a press
 * on a free end, which says only "a drag has begun" and is resolved into a
 * resize or a pan by the direction it first travels.
 *
 * Everything drawn while a drag runs — the plan markup, the live dimension, the
 * hint — reads this, which is why it is a shape and not a bag.
 */

import type { Heading, Model, Point, SegmentKind, WallEnd } from './model';
import type { Snap } from './snap';
import type { SlideRun } from './slide';
import { wallDir } from './topology';
import { findWall } from './model';
import { headingOf } from './topology';

/** What every drag carries from the moment of the press. */
export interface DragBase {
	startClientX: number;
	startClientY: number;
	startCm: Point;
	/** the press has travelled far enough to be a drag rather than a tap */
	committed: boolean;
	/** the model as it was when the drag committed: every move re-applies from here */
	base?: Model;
}

export interface PanDrag extends DragBase {
	kind: 'pan';
	lastClientX: number;
	lastClientY: number;
}

export interface DrawDrag extends DragBase {
	kind: 'draw';
	/** what the tool makes: a wall or a Fără perete side */
	tool: SegmentKind | null;
	startPt: Point;
	startSnap: Snap | null;
	heading?: Heading;
	endPoint?: Point;
	endSnap?: Snap;
}

/** One tap with a placing tool on: resolved at release, never during movement. */
export interface PlaceDrag extends DragBase {
	kind: 'place';
}

/** What a piece travelling along a run fixed at the moment it was taken hold of. */
export interface RunGrab {
	run?: SlideRun | null;
	runPoints?: Point[];
	grabArc?: number;
	centreArc0?: number;
	lastArc?: number;
}

export interface LandmarkDrag extends DragBase, RunGrab {
	kind: 'landmark';
	landmarkId: string;
}

export interface CornerDrag extends DragBase {
	kind: 'corner';
	vertexPt: Point;
	/** which wall ends sat at this corner when the drag began */
	touches?: { wallId: string; end: WallEnd }[];
	snapAt?: Point | null;
}

export interface OpeningEdgeDrag extends DragBase {
	kind: 'openingEdge';
	wallId: string;
	segId: string;
	edge: 'start' | 'end';
	segOffsetStart?: number;
	segLengthStart?: number;
	wallDirVec?: Point;
}

/** A press on a free end, before the direction travelled says which drag it is. */
export interface FreeEndDrag extends DragBase {
	kind: 'freeEnd';
	wallId: string;
	movingEnd: WallEnd;
	startPt: Point;
}

export interface ResizeDrag extends DragBase {
	kind: 'resize';
	wallId: string;
	movingEnd: WallEnd;
	startPt: Point;
	fixedEnd: WallEnd;
	heading: Heading;
	endPoint?: Point;
	endSnap?: Snap;
}

export interface PushDrag extends DragBase {
	kind: 'push';
	wallId: string;
	segId: string;
	snapAt?: Point | null;
	snapEnd?: WallEnd | null;
}

export interface OpeningDrag extends DragBase, RunGrab {
	kind: 'opening';
	wallId: string;
	segId: string;
	/** the piece the drag is on now: travelling to another wall re-makes it */
	liveSegId?: string;
	pastFreeEnd?: boolean;
}

export type DragState =
	| PanDrag
	| DrawDrag
	| PlaceDrag
	| LandmarkDrag
	| CornerDrag
	| OpeningEdgeDrag
	| FreeEndDrag
	| ResizeDrag
	| PushDrag
	| OpeningDrag;

/** About 25 degrees either side of the wall's own axis is a pull, not a pan. */
const ALONG_FRACTION = 0.9;

export type FreeEndResolution =
	| { kind: 'resize'; fixedEnd: WallEnd; heading: Heading }
	| { kind: 'pan' };

/**
 * What a press on a free end becomes, by the direction travelled against the
 * wall's own axis — the only axis a resize may move along. Anything more
 * sideways than a deliberate pull moves the view instead, since the resting
 * tool never draws: a wrong pan costs nothing, a wrong resize destroys a
 * measurement.
 */
export function resolveFreeEndDirection(
	model: Model,
	ds: { wallId: string; movingEnd: WallEnd; startCm: Point },
	curCm: Point
): FreeEndResolution {
	const w = findWall(model, ds.wallId);
	if (!w) return { kind: 'pan' };
	const axis = wallDir(w);
	const mvx = curCm.x - ds.startCm.x;
	const mvy = curCm.y - ds.startCm.y;
	const mvLen = Math.hypot(mvx, mvy) || 1;
	const alongFrac = Math.abs(mvx * axis.x + mvy * axis.y) / mvLen;
	if (alongFrac < ALONG_FRACTION) return { kind: 'pan' };
	const fixedEnd: WallEnd = ds.movingEnd === 'from' ? 'to' : 'from';
	return {
		kind: 'resize',
		fixedEnd,
		/* Heading away from the fixed end, locked in now so it cannot flip mid-drag
		   even when the wall is pulled down to its own floor. */
		heading: headingOf({ from: w[fixedEnd], to: w[ds.movingEnd] })
	};
}
