/**
 * The plan itself, as SVG markup: geometry and hit targets only. No text and no
 * foreignObject — every readable or typeable control lives in the HTML layer
 * over it, so nothing carrying text or a real input inherits the zoom.
 *
 * Paint order is hit-test priority, later winning ties, which is why the whole
 * scene is built in one pass rather than per wall.
 */

import { markColour } from '../marks';
import {
	WALL_THICKNESS_CM,
	findSegAnywhere,
	pointKey,
	selectedLandmarkId,
	selectedSegId,
	type Model,
	type Point,
	type Segment,
	type Selection,
	type Wall
} from './model';
import { collectVertices, isFreeEnd, segPoints, wallDir, wallNormal } from './topology';
import { landmarkGeom, landmarkShows, type LandmarkGeom } from './landmarkEdits';
import {
	chipAnchor,
	dimAnchor,
	dimLineParts,
	segHitWidthCm,
	type Dim,
	type LiveDim
} from './dims';
import type { Box } from './view';
import type { DragState } from './dragState';
import type { ToolGesture } from './tools';

/** Everything one pass of the plan is drawn from. */
export interface Scene {
	model: Model;
	selection: Selection;
	drag: DragState | null;
	mode: 'plan' | 'landmarks';
	/** the gesture of the tool that is on: what the canvas offers the pointer */
	toolGesture: ToolGesture | null;
	scale: number;
	visibleBox: Box;
	dims: Dim[];
	liveDim: LiveDim | null;
}

function esc(s: string): string {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export interface HitRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function hitRectAttrs(p0: Point, p1: Point, hitCm: number): HitRect {
	if (Math.abs(p0.y - p1.y) < 1e-6) {
		const x0 = Math.min(p0.x, p1.x);
		const x1 = Math.max(p0.x, p1.x);
		return { x: x0, y: p0.y - hitCm / 2, w: x1 - x0, h: hitCm };
	}
	const y0 = Math.min(p0.y, p1.y);
	const y1 = Math.max(p0.y, p1.y);
	return { x: p0.x - hitCm / 2, y: y0, w: hitCm, h: y1 - y0 };
}

export interface BandQuad {
	a: Point;
	b: Point;
	c: Point;
	e: Point;
}

/**
 * The four corners of a wall piece's band, centred on the piece's own
 * centreline at the wall's thickness.
 *
 * Butt-jointed bands leave a notch at every corner, so an end is extended by
 * half the wall thickness — but only when this piece actually sits at the
 * WALL's own physical endpoint (an internal boundary between two pieces of one
 * wall is already flush with its neighbour) AND that endpoint is welded to
 * another wall. Walls are always axis-aligned, so there is no mitre to compute:
 * each wall extends its own band past the shared point and the extended bands
 * overlap in the corner square exactly the way masonry poché does. The weld
 * check is per END, because one end of a wall can be welded into a corner while
 * the other still stands in open air.
 */
export function wallBandPoints(
	model: Model,
	w: Wall,
	isFirst: boolean,
	isLast: boolean,
	p0: Point,
	p1: Point
): BandQuad {
	const d = wallDir(w);
	const n = wallNormal(w);
	const half = WALL_THICKNESS_CM / 2;
	const extStart = isFirst && !isFreeEnd(model, w, 'from') ? half : 0;
	const extEnd = isLast && !isFreeEnd(model, w, 'to') ? half : 0;
	const s0 = { x: p0.x - d.x * extStart, y: p0.y - d.y * extStart };
	const s1 = { x: p1.x + d.x * extEnd, y: p1.y + d.y * extEnd };
	return {
		a: { x: s0.x + n.x * half, y: s0.y + n.y * half },
		b: { x: s0.x - n.x * half, y: s0.y - n.y * half },
		c: { x: s1.x - n.x * half, y: s1.y - n.y * half },
		e: { x: s1.x + n.x * half, y: s1.y + n.y * half }
	};
}

/**
 * A door is a hole: the band stops the way masonry stops at a doorway, and a
 * jamb line is drawn across the thickness at each end. The leaf and the dashed
 * quarter arc are the only ink in the opening. Every door has a hinge and a
 * swing from the moment it exists, so there is always a real leaf to draw.
 */
export function doorSvg(model: Model, w: Wall, s: Segment, p0: Point, p1: Point, selected: boolean): string {
	const hingePt = s.hinge === 'start' ? p0 : p1;
	const otherPt = s.hinge === 'start' ? p1 : p0;
	const n2 = wallNormal(w);
	const sign = s.swing === 'in' ? 1 : -1;
	const width = s.length.value;
	const tip = { x: hingePt.x + n2.x * width * sign, y: hingePt.y + n2.y * width * sign };
	const a1 = Math.atan2(tip.y - hingePt.y, tip.x - hingePt.x);
	const a2 = Math.atan2(otherPt.y - hingePt.y, otherPt.x - hingePt.x);
	const diff = (a2 - a1 + Math.PI * 2) % (Math.PI * 2);
	const sweep = diff <= Math.PI ? 1 : 0;
	const bq = wallBandPoints(model, w, false, false, p0, p1);
	const band = [bq.a, bq.b, bq.c, bq.e].map((q) => q.x + ',' + q.y).join(' ');
	return (
		'<polygon class="fp-gap" points="' + band + '"></polygon>' +
		'<line class="fp-jamb' + (selected ? ' on' : '') + '" x1="' + bq.a.x + '" y1="' + bq.a.y + '" x2="' + bq.b.x + '" y2="' + bq.b.y + '"></line>' +
		'<line class="fp-jamb' + (selected ? ' on' : '') + '" x1="' + bq.e.x + '" y1="' + bq.e.y + '" x2="' + bq.c.x + '" y2="' + bq.c.y + '"></line>' +
		'<line class="fp-leaf" x1="' + hingePt.x + '" y1="' + hingePt.y + '" x2="' + tip.x + '" y2="' + tip.y + '"></line>' +
		'<path class="fp-arc" d="M ' + tip.x + ' ' + tip.y + ' A ' + width + ' ' + width + ' 0 0 ' + sweep + ' ' + otherPt.x + ' ' + otherPt.y + '"></path>'
	);
}

/**
 * Glazing in plan: three thin lines run the length of the opening — one on each
 * face of the band and one on its centreline — with a jamb across the thickness
 * at each end, so the glass sits IN the wall.
 */
export function windowSvg(model: Model, w: Wall, p0: Point, p1: Point, selected: boolean): string {
	const n = wallNormal(w);
	const half = WALL_THICKNESS_CM / 2;
	const cls = 'fp-glass' + (selected ? ' on' : '');
	const bq = wallBandPoints(model, w, false, false, p0, p1);
	const band = [bq.a, bq.b, bq.c, bq.e].map((q) => q.x + ',' + q.y).join(' ');
	const face = (off: number) =>
		'<line class="' + cls + '" x1="' + (p0.x + n.x * off) + '" y1="' + (p0.y + n.y * off) +
		'" x2="' + (p1.x + n.x * off) + '" y2="' + (p1.y + n.y * off) + '"></line>';
	return (
		'<polygon class="fp-gap" points="' + band + '"></polygon>' +
		face(-half) + face(0) + face(half) +
		'<line class="fp-jamb' + (selected ? ' on' : '') + '" x1="' + bq.a.x + '" y1="' + bq.a.y + '" x2="' + bq.b.x + '" y2="' + bq.b.y + '"></line>' +
		'<line class="fp-jamb' + (selected ? ' on' : '') + '" x1="' + bq.e.x + '" y1="' + bq.e.y + '" x2="' + bq.c.x + '" y2="' + bq.c.y + '"></line>'
	);
}

function snapMarkerMarkup(pt: Point, scale: number): string {
	const r1 = Math.max(9, 14 / scale);
	return '<circle class="fp-snap" cx="' + pt.x + '" cy="' + pt.y + '" r="' + r1 + '" stroke-width="' + Math.max(1, 1.4 / scale) + '"></circle>';
}

function alignGuideMarkup(a: Point, b: Point, scale: number): string {
	return '<line class="fp-guide" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke-width="' + Math.max(1, 1.2 / scale) + '"></line>';
}

/** The small white square that marks an end or a jamb of the piece in focus. */
function handleMarkup(pt: Point, scale: number): string {
	const half = Math.max(4, 7 / scale);
	return '<rect class="fp-handle" x="' + (pt.x - half) + '" y="' + (pt.y - half) + '" width="' + half * 2 + '" height="' + half * 2 + '" stroke-width="' + Math.max(1, 1.5 / scale) + '"></rect>';
}

/** The wash band behind whatever is in focus. */
function washMarkup(w: Wall, p0: Point, p1: Point): string {
	const d = wallDir(w);
	const n = wallNormal(w);
	const out = WALL_THICKNESS_CM * 1.7;
	const along = WALL_THICKNESS_CM * 0.6;
	const a = { x: p0.x - d.x * along, y: p0.y - d.y * along };
	const b = { x: p1.x + d.x * along, y: p1.y + d.y * along };
	const pts = [
		{ x: a.x + n.x * out, y: a.y + n.y * out },
		{ x: b.x + n.x * out, y: b.y + n.y * out },
		{ x: b.x - n.x * out, y: b.y - n.y * out },
		{ x: a.x - n.x * out, y: a.y - n.y * out }
	];
	return '<polygon class="fp-wash" points="' + pts.map((q) => q.x + ',' + q.y).join(' ') + '"></polygon>';
}

/** A landmark's square, in the world the plan is drawn in. */
export function landmarkSquarePoints(g: LandmarkGeom, grow: number): string {
	const e = g.half + (grow || 0);
	return [
		{ x: g.centre.x - g.dir.x * e - g.normal.x * e, y: g.centre.y - g.dir.y * e - g.normal.y * e },
		{ x: g.centre.x + g.dir.x * e - g.normal.x * e, y: g.centre.y + g.dir.y * e - g.normal.y * e },
		{ x: g.centre.x + g.dir.x * e + g.normal.x * e, y: g.centre.y + g.dir.y * e + g.normal.y * e },
		{ x: g.centre.x - g.dir.x * e + g.normal.x * e, y: g.centre.y - g.dir.y * e + g.normal.y * e }
	]
		.map((p) => p.x + ',' + p.y)
		.join(' ');
}

/** The squares themselves, with their hit targets handed back to the hits group. */
function landmarkMarkup(scene: Scene, hitParts: string[]): string {
	const parts: string[] = [];
	const focused = selectedLandmarkId(scene.selection);
	(scene.model.landmarks || []).forEach((m) => {
		if (!landmarkShows(scene.model, m)) return;
		const g = landmarkGeom(scene.model, m);
		if (!g) return;
		const sel = focused === m.id;
		const colour = markColour(m.kind);
		if (sel) {
			parts.push('<polygon class="fp-wash" points="' + landmarkSquarePoints(g, g.half * 0.7) + '"></polygon>');
		}
		if (scene.mode === 'landmarks') {
			const reach = Math.max(g.half, 24 / scene.scale);
			hitParts.push(
				'<rect class="fp-grab" data-testid="landmark-' + m.id + '-hit" data-landmark-id="' + m.id + '"' +
				' x="' + (g.centre.x - reach) + '" y="' + (g.centre.y - reach) + '" width="' + reach * 2 + '" height="' + reach * 2 + '"></rect>'
			);
		}
		parts.push(
			'<polygon class="fp-mark' + (sel ? ' on' : '') + '" data-testid="landmark-' + m.id + '"' +
			' data-landmark-id="' + m.id + '" data-kind="' + esc(m.kind) + '" data-face="' + m.face + '"' +
			' style="fill:' + colour + '" stroke-width="' + Math.max(1, 1.5 / scene.scale) + '"' +
			' points="' + landmarkSquarePoints(g, 0) + '"></polygon>'
		);
	});
	return parts.join('');
}

export function planMarkup(scene: Scene): string {
	const { model, scale, drag } = scene;
	const hitCm = segHitWidthCm(scale);
	const cornerRCm = Math.max(9, 24 / scale);
	const parts: string[] = [];
	const plainSegHitParts: string[] = [];
	const openingSegHitParts: string[] = [];
	const cornerHitParts: string[] = [];
	const freeEndHitParts: string[] = [];
	const openingEdgeHitParts: string[] = [];
	const selSegId = selectedSegId(scene.selection);

	/* The wash band of whatever is in focus goes down first, so the piece itself
	   is drawn over it. */
	const selFocus = findSegAnywhere(model, selSegId);
	if (selFocus) {
		const fp = segPoints(selFocus.wall, selFocus.seg);
		parts.push(washMarkup(selFocus.wall, fp.p0, fp.p1));
	}

	parts.push('<g class="fp-plan">');
	model.walls.forEach((w) => {
		w.segments.forEach((s, idx) => {
			const pts = segPoints(w, s);
			const sel = selSegId === s.id;
			parts.push('<g data-testid="seg-' + s.id + '">');
			if (s.kind === 'wall') {
				const bp = wallBandPoints(model, w, idx === 0, idx === w.segments.length - 1, pts.p0, pts.p1);
				parts.push(
					'<polygon class="fp-band' + (sel ? ' on' : '') + '" points="' +
					bp.a.x + ',' + bp.a.y + ' ' + bp.b.x + ',' + bp.b.y + ' ' + bp.c.x + ',' + bp.c.y + ' ' + bp.e.x + ',' + bp.e.y +
					'"></polygon>'
				);
			} else if (s.kind === 'open') {
				const on = wallNormal(w);
				const tickCm = WALL_THICKNESS_CM / 2;
				parts.push(
					'<line class="fp-open' + (sel ? ' on' : '') + '" x1="' + pts.p0.x + '" y1="' + pts.p0.y +
					'" x2="' + pts.p1.x + '" y2="' + pts.p1.y + '" stroke-width="' + Math.max(1.6, 2.4 / scale) + '"></line>'
				);
				[pts.p0, pts.p1].forEach((p) => {
					parts.push(
						'<line class="fp-open-tick" x1="' + (p.x - on.x * tickCm) + '" y1="' + (p.y - on.y * tickCm) +
						'" x2="' + (p.x + on.x * tickCm) + '" y2="' + (p.y + on.y * tickCm) + '" stroke-width="' + Math.max(1, 1.5 / scale) + '"></line>'
					);
				});
			} else if (s.kind === 'window') {
				parts.push(windowSvg(model, w, pts.p0, pts.p1, sel));
			} else if (s.kind === 'door') {
				parts.push(doorSvg(model, w, s, pts.p0, pts.p1, sel));
			}
			parts.push('</g>');
			/* On the landmark step the plan is drawn but takes no pointer: walls,
			   windows and doors are changed back on the plan step. */
			if (scene.mode === 'landmarks') return;
			const hr = hitRectAttrs(pts.p0, pts.p1, hitCm);
			const opening = s.kind === 'window' || s.kind === 'door';
			(opening ? openingSegHitParts : plainSegHitParts).push(
				'<rect class="fp-hit' + (sel ? ' on' : '') + '" data-testid="seg-' + s.id + '-hit" data-wall-id="' + w.id +
				'" data-seg-id="' + s.id + '" data-kind="' + s.kind + '"' +
				' x="' + hr.x + '" y="' + hr.y + '" width="' + hr.w + '" height="' + hr.h + '"></rect>'
			);
		});
	});
	parts.push('</g>');

	/* A free end shows as a small white circle only while a tool that draws is
	   on: that is the moment it matters, because a stroke started or ended near
	   it joins it. */
	if (scene.toolGesture === 'stroke') {
		const endRCm = Math.max(5, 8 / scale);
		collectVertices(model).forEach((v) => {
			if (v.refs.length !== 1) return;
			parts.push(
				'<circle class="fp-free-end" cx="' + v.point.x + '" cy="' + v.point.y + '" r="' + endRCm +
				'" stroke-width="' + Math.max(1, 1.4 / scale) + '"></circle>'
			);
		});
	}

	/* The handles of the piece in focus: a white square at each end, or at each
	   jamb of an opening. */
	if (selFocus) {
		const hp = segPoints(selFocus.wall, selFocus.seg);
		parts.push(handleMarkup(hp.p0, scale));
		parts.push(handleMarkup(hp.p1, scale));
	}

	/* Corner and free-end hit targets exist only while the resting tool is on:
	   with a making tool on, the canvas is for making, and a press near a free
	   end is a stroke that welds onto it. */
	const selecting = (!scene.toolGesture || scene.toolGesture === 'none') && scene.mode !== 'landmarks';
	if (selecting) {
		collectVertices(model).forEach((v) => {
			if (v.refs.length < 2) return;
			cornerHitParts.push(
				'<circle class="fp-grab" data-testid="corner-' + pointKey(v.point) + '" data-vx="' + v.point.x +
				'" data-vy="' + v.point.y + '" cx="' + v.point.x + '" cy="' + v.point.y + '" r="' + cornerRCm + '"></circle>'
			);
		});
		collectVertices(model).forEach((v) => {
			if (v.refs.length !== 1) return;
			const ref = v.refs[0];
			freeEndHitParts.push(
				'<circle class="fp-grab fp-free-hit" data-testid="free-end-' + pointKey(v.point) + '" data-wall-id="' + ref.wall.id +
				'" data-end="' + ref.end + '" cx="' + v.point.x + '" cy="' + v.point.y + '" r="' + cornerRCm + '"></circle>'
			);
		});

		/* An opening's own jamb handles: dragging one moves that jamb only. */
		if (selFocus && (selFocus.seg.kind === 'window' || selFocus.seg.kind === 'door')) {
			const ow = selFocus.wall;
			const oseg = selFocus.seg;
			const oPts = segPoints(ow, oseg);
			[
				{ edge: 'start', pt: oPts.p0 },
				{ edge: 'end', pt: oPts.p1 }
			].forEach((e) => {
				openingEdgeHitParts.push(
					'<circle class="fp-grab" data-testid="opening-edge-' + e.edge + '-' + oseg.id + '" data-wall-id="' + ow.id +
					'" data-seg-id="' + oseg.id + '" data-edge="' + e.edge + '" cx="' + e.pt.x + '" cy="' + e.pt.y + '" r="' + cornerRCm + '"></circle>'
				);
			});
		}
	}

	/* A push or a corner drag mutates the live model on every move — there is no
	   separate preview line the way a stroke has — but it still needs to show the
	   same magnet catch a stroke shows before release, or a snap the client never
	   saw catch is a snap they cannot trust to let go of. */
	if (drag && drag.committed && (drag.kind === 'push' || drag.kind === 'corner') && drag.snapAt) {
		parts.push(snapMarkerMarkup(drag.snapAt, scale));
	}

	if (drag && drag.kind === 'draw' && drag.committed && drag.endPoint) {
		const welded = !!(drag.endSnap && drag.endSnap.weld);
		/* The stroke as it will be: a translucent band of the wall's own thickness,
		   with a dashed centre line down it. */
		if (drag.tool !== 'open') {
			parts.push(
				'<line class="fp-preview-band" x1="' + drag.startPt.x + '" y1="' + drag.startPt.y +
				'" x2="' + drag.endPoint.x + '" y2="' + drag.endPoint.y + '" stroke-width="' + WALL_THICKNESS_CM + '"></line>'
			);
		}
		parts.push(
			'<line class="fp-preview' + (welded ? ' on' : '') + (drag.tool === 'open' ? ' fp-preview-open' : '') +
			'" x1="' + drag.startPt.x + '" y1="' + drag.startPt.y + '" x2="' + drag.endPoint.x + '" y2="' + drag.endPoint.y +
			'" stroke-width="' + Math.max(1.4, 2 / scale) + '"></line>'
		);
		if (drag.startSnap && drag.startSnap.weld) parts.push(snapMarkerMarkup(drag.startSnap.point, scale));
		if (drag.endSnap) {
			if (drag.endSnap.weld) parts.push(snapMarkerMarkup(drag.endSnap.point, scale));
			else if (drag.endSnap.kind === 'align') parts.push(alignGuideMarkup(drag.endPoint, drag.endSnap.guideAt, scale));
		}
	}

	/* A free-end resize already IS its own preview: the wall being resized is in
	   the model and the walls above draw it growing. Only the snap confirmation
	   is worth repeating, the same markup a stroke's own end shows. */
	if (drag && drag.kind === 'resize' && drag.committed && drag.endSnap) {
		if (drag.endSnap.weld) parts.push(snapMarkerMarkup(drag.endSnap.point, scale));
		else if (drag.endSnap.kind === 'align' && drag.endPoint) {
			parts.push(alignGuideMarkup(drag.endPoint, drag.endSnap.guideAt, scale));
		}
	}

	/* Dimension lines for whatever is showing right now — geometry only, no text:
	   the number itself is the HTML chip built from this very same data. */
	let dimsNow: (Dim | LiveDim)[] = scene.dims;
	if (scene.liveDim) dimsNow = dimsNow.concat([scene.liveDim]);
	if (dimsNow.length) {
		const dimHairW = Math.max(1, 1 / scale);
		parts.push('<g class="fp-dims">');
		dimsNow.forEach((d) => {
			const g = dimLineParts(d, scale);
			parts.push('<path class="fp-dim-ext" d="' + g.ext + '" stroke-width="' + dimHairW + '"></path>');
			parts.push('<path class="fp-dim-run" d="' + g.line + '" stroke-width="' + dimHairW + '"></path>');
			parts.push('<path class="fp-dim-tick" d="' + g.ticks + '" stroke-width="' + dimHairW + '"></path>');
			/* A number that stepped out of the lane left its own run behind: this
			   thin leader is the only thing tying the two back together. */
			if ('leader' in d && d.leader) {
				const innerA = dimAnchor(d);
				const outerA = chipAnchor(d);
				parts.push(
					'<line class="fp-dim-ext" x1="' + innerA.x + '" y1="' + innerA.y + '" x2="' + outerA.x + '" y2="' + outerA.y +
					'" stroke-width="' + dimHairW + '"></line>'
				);
			}
		});
		parts.push('</g>');
	}

	/* Paint order is hit-test priority, later winning ties: a wall's own hit rect
	   lowest, because a corner sits at two of them and has to stay reachable;
	   then the corner handles; then a free end's circle; then an opening's hit
	   rect, so an opening slid flush against a corner still wins over the corner
	   it sits inside; and highest an opening's jamb handles, so resizing one jamb
	   wins over sliding the whole opening. */
	const landmarkHitParts: string[] = [];
	const marksGroup = landmarkMarkup(scene, landmarkHitParts);
	parts.push(
		'<g class="fp-hits">' +
		plainSegHitParts.join('') + cornerHitParts.join('') + freeEndHitParts.join('') +
		openingSegHitParts.join('') + openingEdgeHitParts.join('') + landmarkHitParts.join('') +
		'</g>'
	);
	/* The marks last of all, so a square is never buried under the target that
	   makes it easy to grab with a finger. */
	if (marksGroup) parts.push('<g class="fp-marks">' + marksGroup + '</g>');
	return parts.join('');
}
