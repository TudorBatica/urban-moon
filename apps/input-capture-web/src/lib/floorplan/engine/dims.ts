/**
 * The numbers on the drawing: one lane just outside each wall's own ink band.
 * At rest the lane holds one number per wall, that wall's own length; while a
 * window, a door or a landmark on it is in focus or dragged, that number stands
 * down and the same lane holds the chain (gap | piece | gap), so numbers never
 * stack up in two places.
 *
 * One source feeds both the dimension lines in the plan markup and the HTML
 * chips over it, so a number can never end up describing a different stretch of
 * wall than the line drawn under it. A dim carries a commit descriptor, not a
 * closure: what typing it does is the caller's.
 */

import { CHAIN_LANE_PX, chainOfPiece, placeChainChips, type ChainObstacle } from './chain';
import { LANDMARK_SIZE_CM } from '@urban-moon/domain-data';
import {
	WALL_THICKNESS_CM,
	dist,
	findSegAnywhere,
	findWall,
	landmarksOn,
	r,
	selectedLandmarkId,
	selectedSegId,
	type LengthSource,
	type Model,
	type Point,
	type Segment,
	type Selection,
	type Wall
} from './model';
import { headingOf, pointAlong, segPoints, segTotal, wallLen, wallNormal } from './topology';
import { landmarkObstacles, markWallLengthCm } from './landmarkEdits';
import { RO } from './copy';
import type { Box } from './view';
import type { DragState } from './dragState';

/** screen px, from the band's outer face to the dimension line */
export const DIM_LINE_OUT_PX = 14;
/* A chip's own footprint on screen, in px: a fixed estimate rather than a real
   measurement, because a chip's place has to be decided while the plan markup
   draws its line, before any chip exists in the DOM to measure; the chip's
   input has a fixed width whatever the digits inside it, so this is stable
   across renders. Its width counts its 7px halo and its height the 44px hit box
   its input overflows to, since both take pointers. */
export const CHIP_ALONG_W_PX = 80;
export const CHIP_ALONG_H_PX = 32;
export const CHIP_HALF_W_PX = 46;
export const CHIP_HALF_H_PX = 22;

/** What typing a number does, for the caller to carry out. */
export type DimCommit =
	| { kind: 'wallTotal'; wallId: string }
	| { kind: 'segment'; wallId: string; segId: string };

export interface Dim {
	testid: string;
	tone: 'primary' | 'side';
	readOnly: boolean;
	a: Point;
	b: Point;
	normal: Point;
	outCm: number;
	chipOutCm?: number;
	chipShiftCm?: number;
	/** the number stepped out of the lane, so a thin line ties it back to its run */
	leader?: boolean;
	inChain?: boolean;
	/** a piece with no size to state is a break in the line and nothing more */
	value: number | null;
	source: LengthSource;
	label: string;
	commit: DimCommit | null;
}

/** The in-progress number riding the pointer: nothing to commit mid-gesture. */
export interface LiveDim {
	tone: 'primary';
	a: Point;
	b: Point;
	normal: Point;
	outCm: number;
	value: number;
}

/** What anchoring a dimension needs, whether it is a real one or the live one. */
export interface DimGeometry {
	a: Point;
	b: Point;
	normal: Point;
	outCm: number;
	chipOutCm?: number;
	chipShiftCm?: number;
}

export type WallAxis = 'horizontal' | 'vertical';

export function segHitWidthCm(scale: number): number {
	return Math.max(14, 48 / scale);
}

export function wallAxis(w: Wall): WallAxis {
	const h = headingOf(w);
	return h === 'E' || h === 'W' ? 'horizontal' : 'vertical';
}

/** How much room a chip takes ALONG the wall it measures. */
export function chipAlongPx(w: Wall): number {
	return wallAxis(w) === 'horizontal' ? CHIP_ALONG_W_PX : CHIP_ALONG_H_PX;
}

/**
 * Half a chip's extent ACROSS the wall. A chip is centred on its anchor and
 * takes pointers, so the lane is the distance to the chip's near EDGE: anchored
 * on the lane itself, the half facing the wall would cover the wall's own hit
 * target.
 */
export function chipHalfCrossPx(w: Wall): number {
	return wallAxis(w) === 'horizontal' ? CHIP_HALF_H_PX : CHIP_HALF_W_PX;
}

/**
 * A number whose wall is off screen is not drawn: it would otherwise be pinned
 * to the edge of the stage, where it names a wall the client cannot see.
 */
export function wallOnScreen(w: Wall, box: Box): boolean {
	const pad = WALL_THICKNESS_CM;
	return (
		Math.min(w.from.x, w.to.x) - pad <= box.maxX &&
		Math.max(w.from.x, w.to.x) + pad >= box.minX &&
		Math.min(w.from.y, w.to.y) - pad <= box.maxY &&
		Math.max(w.from.y, w.to.y) + pad >= box.minY
	);
}

function segDimLabel(s: Segment): string {
	return s.kind === 'window' || s.kind === 'door' ? RO.fieldWidth : RO.fieldLength;
}

function isOpeningKind(s: Segment): boolean {
	return s.kind === 'window' || s.kind === 'door';
}

/**
 * A wall's own length, the one number it shows at rest. On a later step the
 * plan is what earlier steps made: its numbers are stated, not asked, so the
 * chip neither edits nor takes the pointer away from the wall under it.
 */
function wallDim(w: Wall, focused: boolean, mode: string, scale: number): Dim {
	const wn = wallNormal(w);
	const editable = mode !== 'landmarks';
	return {
		testid: 'dim-' + w.id,
		tone: focused ? 'primary' : 'side',
		readOnly: !editable,
		a: w.from,
		b: w.to,
		normal: { x: -wn.x, y: -wn.y },
		outCm: WALL_THICKNESS_CM / 2 + DIM_LINE_OUT_PX / scale,
		chipOutCm: WALL_THICKNESS_CM / 2 + (CHAIN_LANE_PX + chipHalfCrossPx(w)) / scale,
		value: r(wallLen(w)),
		source: w.lengthSource,
		label: RO.fieldLength,
		commit: editable ? { kind: 'wallTotal', wallId: w.id } : null
	};
}

interface ChainPiece {
	source: LengthSource;
	label: string;
	commit: DimCommit | null;
}

/**
 * The chain in place of that wall's own length: gap | piece | gap, each with
 * its own run and ticks, adding up to the wall. The gaps are read-only — the
 * drawing is what says them — and the piece's number is the same value as the
 * first field of its plate.
 */
function chainFrom(w: Wall, items: ReturnType<typeof chainOfPiece>, scale: number, piece: ChainPiece): Dim[] {
	const wn = wallNormal(w);
	const normal = { x: -wn.x, y: -wn.y };
	const alongPx = chipAlongPx(w);
	const halfCrossPx = chipHalfCrossPx(w);
	const places = placeChainChips(
		items.map((it) => ({
			startPx: it.startCm * scale,
			endPx: it.endCm * scale,
			chipLengthPx: alongPx
		})),
		wallAxis(w)
	);
	return items.map((it, i) => {
		const p = places[i];
		const isPiece = it.kind === 'piece';
		return {
			testid: 'chain-' + it.kind,
			inChain: true,
			readOnly: !isPiece || !piece.commit,
			tone: isPiece ? ('primary' as const) : ('side' as const),
			a: pointAlong(w, it.startCm),
			b: pointAlong(w, it.endCm),
			normal,
			outCm: WALL_THICKNESS_CM / 2 + DIM_LINE_OUT_PX / scale,
			chipOutCm: WALL_THICKNESS_CM / 2 + (p.outPx + halfCrossPx) / scale,
			chipShiftCm: (p.alongPx - p.spanMidPx) / scale,
			leader: p.steppedOut,
			value: it.showsNumber ? r(it.lengthCm) : null,
			source: isPiece ? piece.source : ('computed' as const),
			label: isPiece ? piece.label : RO.fieldLength,
			commit: isPiece ? piece.commit : null
		};
	});
}

function chainDims(model: Model, w: Wall, seg: Segment, scale: number): Dim[] {
	const obstacles: ChainObstacle[] = [];
	w.segments.forEach((s) => {
		if (s.id === seg.id || s.kind === 'wall') return;
		obstacles.push({ startCm: s.offsetFromStart, endCm: s.offsetFromStart + s.length.value });
	});
	landmarksOn(model, w.id).forEach((m) => {
		obstacles.push({
			startCm: m.offsetFromStartCm,
			endCm: m.offsetFromStartCm + LANDMARK_SIZE_CM
		});
	});
	const items = chainOfPiece({
		wallLengthCm: segTotal(w),
		pieceStartCm: seg.offsetFromStart,
		pieceEndCm: seg.offsetFromStart + seg.length.value,
		obstacles
	});
	return chainFrom(w, items, scale, {
		source: seg.length.source,
		label: segDimLabel(seg),
		commit: { kind: 'segment', wallId: w.id, segId: seg.id }
	});
}

/** The same chain for a landmark: gap | square | gap, with no number on the square. */
function landmarkChainDims(model: Model, w: Wall, offsetFromStartCm: number, markId: string, scale: number): Dim[] {
	const items = chainOfPiece({
		wallLengthCm: markWallLengthCm(w),
		pieceStartCm: offsetFromStartCm,
		pieceEndCm: offsetFromStartCm + LANDMARK_SIZE_CM,
		obstacles: landmarkObstacles(model, w, markId),
		pieceShowsNumber: false
	});
	return chainFrom(w, items, scale, {
		source: 'computed',
		label: RO.fieldLength,
		commit: null
	});
}

export function allDims(model: Model, selection: Selection, mode: string, scale: number, visibleBox: Box): Dim[] {
	let out: Dim[] = [];
	const markId = selectedLandmarkId(selection);
	const mark = markId === null ? null : (model.landmarks || []).find((m) => m.id === markId) ?? null;
	const segId = selectedSegId(selection);
	const found = mark ? null : findSegAnywhere(model, segId);
	const focus = found && isOpeningKind(found.seg) ? found : null;
	const focusWallId = mark ? mark.wallId : focus ? focus.wall.id : null;
	const selSeg = findSegAnywhere(model, segId);
	model.walls.forEach((w) => {
		if (!wallOnScreen(w, visibleBox)) return;
		if (w.id === focusWallId) {
			if (mark) out = out.concat(landmarkChainDims(model, w, mark.offsetFromStartCm, mark.id, scale));
			else if (focus) out = out.concat(chainDims(model, w, focus.seg, scale));
			return;
		}
		out.push(wallDim(w, !!(selSeg && selSeg.wall.id === w.id), mode, scale));
	});
	return out;
}

/**
 * The live in-progress number riding the pointer for whichever gesture is
 * lengthening a wall right now. Unlike the rest it reads the drag rather than
 * the focus, since a fresh draw stroke has no model piece yet to be on: a
 * committed draw has no wall to hang a label on, so its ends come straight off
 * the drag; a resize already IS a real wall being mutated live, so its own
 * from/to are read instead; an opening's jamb drag is narrower still — only
 * that one piece's two edges move.
 */
export function liveDim(model: Model, drag: DragState | null, scale: number): LiveDim | null {
	if (!drag || !drag.committed) return null;
	let a: Point | null = null;
	let b: Point | null = null;
	if (drag.kind === 'draw' && drag.endPoint) {
		a = drag.startPt;
		b = drag.endPoint;
	} else if (drag.kind === 'resize') {
		const lw = findWall(model, drag.wallId);
		if (lw) {
			a = lw.from;
			b = lw.to;
		}
	} else if (drag.kind === 'openingEdge') {
		const w = findWall(model, drag.wallId);
		const f = w ? w.segments.find((s) => s.id === drag.segId) : undefined;
		if (w && f) {
			const sp = segPoints(w, f);
			a = sp.p0;
			b = sp.p1;
		}
	} else {
		return null;
	}
	if (!a || !b) return null;
	const n = wallNormal({ from: a, to: b });
	return {
		tone: 'primary',
		a,
		b,
		normal: { x: -n.x, y: -n.y },
		outCm: segHitWidthCm(scale) / 2 + 34 / scale,
		value: r(dist(a, b))
	};
}

/** The middle of the dimension LINE, which is where its run and ticks sit. */
export function dimAnchor(d: DimGeometry): Point {
	const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
	return { x: mid.x + d.normal.x * d.outCm, y: mid.y + d.normal.y * d.outCm };
}

/**
 * Where the CHIP sits: in the lane, over the middle of what it measures, unless
 * it was too narrow for its span and stepped out — then it is one lane further
 * out and possibly pushed along the wall to clear the number beside it, with a
 * leader tying it back. Anything that never set a chip lane of its own — the
 * live number — falls back to the line's own.
 */
export function chipAnchor(d: DimGeometry): Point {
	let mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
	const out = d.chipOutCm != null ? d.chipOutCm : d.outCm;
	const shift = d.chipShiftCm || 0;
	if (shift) {
		const dx = d.b.x - d.a.x;
		const dy = d.b.y - d.a.y;
		const L = Math.hypot(dx, dy) || 1;
		mid = { x: mid.x + (dx / L) * shift, y: mid.y + (dy / L) * shift };
	}
	return { x: mid.x + d.normal.x * out, y: mid.y + d.normal.y * out };
}

/** Extension lines off the wall, the run between them, and a 45-degree tick at each end. */
export function dimLineParts(d: DimGeometry, scale: number): { ext: string; line: string; ticks: string } {
	const overCm = 6 / scale;
	const tickCm = 5 / scale;
	const pA = { x: d.a.x + d.normal.x * d.outCm, y: d.a.y + d.normal.y * d.outCm };
	const pB = { x: d.b.x + d.normal.x * d.outCm, y: d.b.y + d.normal.y * d.outCm };
	const eA = {
		x: d.a.x + d.normal.x * (d.outCm + overCm),
		y: d.a.y + d.normal.y * (d.outCm + overCm)
	};
	const eB = {
		x: d.b.x + d.normal.x * (d.outCm + overCm),
		y: d.b.y + d.normal.y * (d.outCm + overCm)
	};
	const dx = d.b.x - d.a.x;
	const dy = d.b.y - d.a.y;
	const L = Math.hypot(dx, dy) || 1;
	const ux = dx / L;
	const uy = dy / L;
	const tkx = (ux + d.normal.x) * (tickCm / Math.SQRT2);
	const tky = (uy + d.normal.y) * (tickCm / Math.SQRT2);
	return {
		ext: 'M' + d.a.x + ' ' + d.a.y + ' L' + eA.x + ' ' + eA.y + ' M' + d.b.x + ' ' + d.b.y + ' L' + eB.x + ' ' + eB.y,
		line: 'M' + pA.x + ' ' + pA.y + ' L' + pB.x + ' ' + pB.y,
		ticks:
			'M' + (pA.x - tkx) + ' ' + (pA.y - tky) + ' L' + (pA.x + tkx) + ' ' + (pA.y + tky) +
			' M' + (pB.x - tkx) + ' ' + (pB.y - tky) + ' L' + (pB.x + tkx) + ' ' + (pB.y + tky)
	};
}
