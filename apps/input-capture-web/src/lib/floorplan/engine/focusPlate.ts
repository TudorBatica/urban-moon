/**
 * The plate of the thing in focus, holding only what that thing needs: a wall or
 * a Fără perete side, "Șterge"; a window, Lățime, Înălțime pervaz and "Șterge";
 * a door, Lățime, "Rotește" and "Șterge". Lengths of walls are never here — they
 * are on the drawing. Beside the piece on a wide screen, docked bottom centre on
 * a phone, above the undo and view plates.
 */

import { glyphSvg as glyph } from '../glyphs';
import { plateField, stopChipPointer, type FieldDeps } from './chips';
import { RO } from './copy';
import { segHitWidthCm } from './dims';
import type { Dom } from './dom';
import { landmarkGeom } from './landmarkEdits';
import { findLandmark, findSegAnywhere, r, type Point, type Segment, type Wall } from './model';
import { cycleDoorSwing, setSegSill } from './openings';
import type { Obstacle } from './placement';
import { divider } from './plates';
import type { Session } from './session';
import { segPoints, wallNormal } from './topology';

export interface FocusPlateDeps extends FieldDeps {
	/** the piece or the square in focus goes, and with it the focus itself */
	deleteFocused: () => void;
	/** a width typed on the plate is the same number as the piece's own on the drawing */
	commitSegmentLength: (wallId: string, segId: string, cm: number) => void;
	pushHistory: () => void;
	render: () => void;
}

export interface FocusPlateContext {
	dom: Dom;
	session: Session;
	scale: number;
	isNarrow: boolean;
	place: (
		el: HTMLElement,
		anchor: Point,
		opts: { avoidChips?: boolean; extraObstacles?: readonly Obstacle[] }
	) => { remaining: number };
	deps: FocusPlateDeps;
}

function plateAction(
	doc: Document,
	row: HTMLElement,
	testid: string,
	label: string,
	glyphName: string,
	onClick: () => void
): void {
	const btn = doc.createElement('button');
	btn.type = 'button';
	btn.className = 'fp-tool';
	btn.setAttribute('data-testid', testid);
	btn.innerHTML = glyph(glyphName);
	const span = doc.createElement('span');
	span.textContent = label;
	btn.appendChild(span);
	btn.addEventListener('click', onClick);
	row.appendChild(btn);
}

function newFocusPlate(doc: Document): HTMLElement {
	const plate = doc.createElement('div');
	plate.className = 'fp-plate fp-focus';
	plate.id = 'focusPlate';
	plate.setAttribute('data-testid', 'focus-plate');
	return plate;
}

/** Beside the middle of the piece, clear of the wall band and of the piece's own hit box. */
function focusPlateAnchor(w: Wall, seg: Segment, scale: number, side: 1 | -1): Point {
	const pts = segPoints(w, seg);
	const mid = { x: (pts.p0.x + pts.p1.x) / 2, y: (pts.p0.y + pts.p1.y) / 2 };
	const n = wallNormal(w);
	const outCm = (segHitWidthCm(scale) / 2 + 44 / scale) * side;
	return { x: mid.x + n.x * outCm, y: mid.y + n.y * outCm };
}

/**
 * The plate sits right next to the very thing it acts on, so it also has to
 * dodge that piece's own hit rect and, for an opening, its two jamb handles.
 * Read off the real SVG elements this render already drew, never recomputed.
 */
function pieceOwnObstacles(dom: Dom, stageRect: DOMRect, seg: Segment): Obstacle[] {
	const gap = 6;
	const obstacles: Obstacle[] = [];
	const testids = ['seg-' + seg.id + '-hit'];
	if (seg.kind === 'window' || seg.kind === 'door') {
		testids.push('opening-edge-start-' + seg.id, 'opening-edge-end-' + seg.id);
	}
	testids.forEach((tid) => {
		const node = dom.svg.querySelector('[data-testid="' + tid + '"]');
		if (!node) return;
		const rect = node.getBoundingClientRect();
		obstacles.push({
			l: rect.left - stageRect.left - gap,
			t: rect.top - stageRect.top - gap,
			r: rect.right - stageRect.left + gap,
			b: rect.bottom - stageRect.top + gap
		});
	});
	return obstacles;
}

/** A landmark's own plate: it has nothing to state, so only "Șterge". */
function renderLandmarkPlate(ctx: FocusPlateContext, landmarkId: string): HTMLElement | null {
	const mark = findLandmark(ctx.session.model, landmarkId);
	if (!mark) return null;
	const g = landmarkGeom(ctx.session.model, mark);
	if (!g) return null;
	const doc = ctx.dom.doc;
	const plate = newFocusPlate(doc);
	const row = doc.createElement('div');
	row.className = 'fp-row';
	plate.appendChild(row);
	plateAction(doc, row, 'plate-delete', RO.del, 'del', () => ctx.deps.deleteFocused());
	stopChipPointer(plate);
	if (ctx.isNarrow) {
		plate.classList.add('fp-docked');
		ctx.dom.ctrlLayer.appendChild(plate);
		return plate;
	}
	const outCm = g.half + 44 / ctx.scale;
	ctx.place(
		plate,
		{
			x: g.centre.x + g.normal.x * g.sign * outCm,
			y: g.centre.y + g.normal.y * g.sign * outCm
		},
		{ avoidChips: true }
	);
	return plate;
}

export function renderFocusPlate(ctx: FocusPlateContext): HTMLElement | null {
	const s = ctx.session;
	/* Hidden while a drag is running: it would ride along with the piece and end
	   up on top of wherever the gesture is about to land. */
	if (s.drag && s.drag.committed) return null;
	if (!s.selection) return null;
	if ('landmarkId' in s.selection) return renderLandmarkPlate(ctx, s.selection.landmarkId);

	const f = findSegAnywhere(s.model, s.selection.segId);
	if (!f) return null;
	const w = f.wall;
	const seg = f.seg;
	const doc = ctx.dom.doc;

	const plate = newFocusPlate(doc);
	const row = doc.createElement('div');
	row.className = 'fp-row';
	plate.appendChild(row);

	if (seg.kind === 'window' || seg.kind === 'door') {
		/* The width is the same value as the piece's own number on the drawing:
		   editing either edits both. */
		plateField(
			doc,
			row,
			{
				label: RO.width,
				value: seg.length.value,
				source: seg.length.source,
				testid: 'plate-width',
				fieldName: RO.fieldWidth
			},
			(cm) => ctx.deps.commitSegmentLength(w.id, seg.id, cm),
			ctx.deps
		);
	}
	if (seg.kind === 'door') {
		row.appendChild(divider(doc));
		plateAction(doc, row, 'plate-rotate', RO.rotate, 'rotate', () => {
			ctx.deps.pushHistory();
			cycleDoorSwing(s.model, w.id, seg.id);
			ctx.deps.render();
		});
	}
	if (seg.kind === 'window') {
		// Two rows on a phone: the sill goes under the width.
		let second = row;
		if (ctx.isNarrow) {
			second = doc.createElement('div');
			second.className = 'fp-row';
			plate.appendChild(second);
			plate.classList.add('fp-two');
		} else {
			row.appendChild(divider(doc));
		}
		const sv = seg.sill || { value: s.carried.sill, source: 'computed' as const };
		plateField(
			doc,
			second,
			{
				label: RO.sill,
				value: sv.value,
				source: sv.source,
				testid: 'plate-sill',
				fieldName: RO.fieldSill
			},
			(cm) => {
				ctx.deps.pushHistory();
				s.carried.sill = r(cm);
				setSegSill(s.model, w.id, seg.id, cm, 'typed');
				ctx.deps.render();
			},
			ctx.deps
		);
	}
	if (row.childNodes.length) row.appendChild(divider(doc));
	plateAction(doc, row, 'plate-delete', RO.del, 'del', () => ctx.deps.deleteFocused());

	stopChipPointer(plate);

	if (ctx.isNarrow) {
		/* Docked bottom centre, above the undo and view plates: a plate wide enough
		   for two fields next to a piece on a 360px screen would always land on the
		   drawing or run off the edge. */
		plate.classList.add('fp-docked');
		ctx.dom.ctrlLayer.appendChild(plate);
		return plate;
	}
	const stageRect = ctx.dom.svg.getBoundingClientRect();
	const extraObstacles = pieceOwnObstacles(ctx.dom, stageRect, seg);
	const placement = ctx.place(plate, focusPlateAnchor(w, seg, ctx.scale, 1), {
		avoidChips: true,
		extraObstacles
	});
	if (placement.remaining > 0) {
		const left1 = plate.style.left;
		const top1 = plate.style.top;
		const remaining1 = placement.remaining;
		const placement2 = ctx.place(plate, focusPlateAnchor(w, seg, ctx.scale, -1), {
			avoidChips: true,
			extraObstacles
		});
		if (placement2.remaining > remaining1) {
			plate.style.left = left1;
			plate.style.top = top1;
		}
	}
	return plate;
}
