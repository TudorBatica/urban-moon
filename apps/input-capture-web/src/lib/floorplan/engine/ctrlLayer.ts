/**
 * The HTML layer over the plan: every number on the drawing, the names of the
 * marks, the live length riding the pointer, and the plate of the piece in
 * focus. One source feeds both the dimension LINES in the plan markup and the
 * chips here, so a number can never sit on a different stretch of wall than the
 * line under it.
 */

import { markColour } from '../marks';
import { RO } from './copy';
import { addLabel, buildChip, buildGapChip, type FieldDeps, type Place } from './chips';
import { chipAnchor, dimAnchor, labelPxPerCm, wallAxis, wallOnScreen, type Dim, type LiveDim } from './dims';
import type { Dom } from './dom';
import { landmarkGeom, landmarkLabel, landmarkShows } from './landmarkEdits';
import type { Point } from './model';
import { placeClear, type Obstacle } from './placement';
import { renderFocusPlate, type FocusPlateDeps } from './focusPlate';
import type { Session } from './session';
import { SNAP_PX } from './snap';
import { collectVertices } from './topology';
import type { Box } from './view';

/**
 * How far out of the square a name chip's centre sits: clear of the square, plus
 * half the chip's own extent across the wall, so the chip's near edge is what
 * lands beside the square rather than its middle.
 */
const MARK_NAME_HALF_W_PX = 52;
const MARK_NAME_HALF_H_PX = 14;
/** A chip's own visible box is 30px tall; its input's hit box overflows to 44. */
const CHIP_HIT_H_PX = 44;

export interface CtrlDeps extends FieldDeps, FocusPlateDeps {
	/** what typing a number into a chip on the drawing does */
	commitDim: (dim: Dim, cm: number) => void;
}

export interface CtrlContext {
	dom: Dom;
	session: Session;
	/** screen px per cm */
	scale: number;
	/** how much of its designed size a label is drawn at, at this zoom */
	labelScale: number;
	visibleBox: Box;
	dims: readonly Dim[];
	liveDim: LiveDim | null;
	cmToStage: (pt: Point) => Point;
	isNarrow: boolean;
	deps: CtrlDeps;
}

/** A box the measured element may not land on, in stage pixels. */
function boxOf(rect: DOMRect, stageRect: DOMRect, gap: number): Obstacle {
	return {
		l: rect.left - stageRect.left - gap,
		t: rect.top - stageRect.top - gap,
		r: rect.right - stageRect.left + gap,
		b: rect.bottom - stageRect.top + gap
	};
}

/**
 * Where nothing may land: over one of the floating plates, or over a free end —
 * the spot the next stroke starts from, and where a browser's own tap
 * disambiguation is most likely to retarget a press onto whatever control
 * renders nearby.
 */
function freeEndObstacles(ctx: CtrlContext, stageRect: DOMRect): Obstacle[] {
	const obstacles: Obstacle[] = [];
	const clearPx = 6;
	for (const plate of [ctx.dom.toolPlate, ctx.dom.histPlate, ctx.dom.viewPlate, ctx.dom.hint]) {
		if (plate.classList.contains('fp-off')) continue;
		const pr = plate.getBoundingClientRect();
		if (pr.width <= 0) continue;
		obstacles.push(boxOf(pr, stageRect, clearPx));
	}
	collectVertices(ctx.session.model).forEach((v) => {
		if (v.refs.length !== 1) return; // free ends only
		const p = ctx.cmToStage(v.point);
		obstacles.push({ l: p.x - SNAP_PX, t: p.y - SNAP_PX, r: p.x + SNAP_PX, b: p.y + SNAP_PX });
	});
	return obstacles;
}

/**
 * A narrower source, for the focus plate: every chip and every mark's name
 * already on screen. A number on the drawing stays out of this on purpose — its
 * own lane and the chain's placement keep it clear of the numbers beside it, and
 * pushing it would move it off the stretch of wall it measures.
 */
function chipObstacles(ctx: CtrlContext, stageRect: DOMRect, skipEl: HTMLElement): Obstacle[] {
	const obstacles: Obstacle[] = [];
	ctx.dom.ctrlLayer.querySelectorAll('.fp-chip, .fp-mark-name, #focusPlate').forEach((c) => {
		if (c === skipEl) return;
		obstacles.push(boxOf(c.getBoundingClientRect(), stageRect, 4));
	});
	return obstacles;
}

export interface PlaceOptions {
	/** also dodge the chips already on screen */
	avoidChips?: boolean;
	extraObstacles?: readonly Obstacle[];
	/** where the element lands, the control layer itself unless the caller has a group */
	parent?: HTMLElement;
	/**
	 * A label drawn at less than its designed size. The element is laid out at
	 * full size and scaled about its own centre, so its measured box has to be
	 * scaled too before anything is decided from it.
	 */
	shrink?: number;
}

/**
 * Puts an element on its anchor, then measures it and pulls it back on screen
 * and off whatever it covers. The anchor is a starting point, not a promise.
 */
export function placeInStage(
	ctx: CtrlContext,
	el: HTMLElement,
	anchor: Point,
	opts: PlaceOptions = {}
): { remaining: number } {
	const pos = ctx.cmToStage(anchor);
	const shrink = opts.shrink ?? 1;
	el.style.left = pos.x + 'px';
	el.style.top = pos.y + 'px';
	if (shrink !== 1) el.style.transform = 'translate(-50%, -50%) scale(' + shrink + ')';
	(opts.parent || ctx.dom.ctrlLayer).appendChild(el);
	const stageRect = ctx.dom.stage.getBoundingClientRect();
	/* Collide against the real interactive footprint, not the shorter visible one,
	   or a check here would pass while the actual touch target still overlaps. */
	const w = el.offsetWidth * shrink;
	const h = Math.max(el.offsetHeight, CHIP_HIT_H_PX) * shrink;
	let obstacles = freeEndObstacles(ctx, stageRect);
	if (opts.avoidChips) obstacles = obstacles.concat(chipObstacles(ctx, stageRect, el));
	if (opts.extraObstacles && opts.extraObstacles.length) obstacles = obstacles.concat(opts.extraObstacles);
	const placed = placeClear({
		pos,
		w,
		h,
		stage: { width: stageRect.width, height: stageRect.height },
		obstacles
	});
	if (placed.x !== pos.x) el.style.left = placed.x + 'px';
	if (placed.y !== pos.y) el.style.top = placed.y + 'px';
	return { remaining: placed.remaining };
}

function placer(ctx: CtrlContext, anchor: Point, opts: PlaceOptions = {}): Place {
	return (el) => {
		placeInStage(ctx, el, anchor, opts);
	};
}

function markNameHalfCrossPx(axis: 'horizontal' | 'vertical'): number {
	return axis === 'horizontal' ? MARK_NAME_HALF_H_PX : MARK_NAME_HALF_W_PX;
}

/**
 * A mark's name, so a plan full of squares reads without a legend. It is set in
 * screen px rather than in the plan's own centimetres, which is why it lives
 * here and not in the SVG with the square it names.
 */
function renderMarkNames(ctx: CtrlContext): void {
	const model = ctx.session.model;
	model.landmarks.forEach((m) => {
		if (!landmarkShows(model, m)) return;
		const g = landmarkGeom(model, m);
		if (!g || !wallOnScreen(g.wall, ctx.visibleBox)) return;
		const chip = ctx.dom.doc.createElement('div');
		chip.className = 'fp-mark-name';
		chip.setAttribute('data-testid', 'landmark-name-' + m.id);
		chip.textContent = landmarkLabel(m.kind);
		chip.style.color = markColour(m.kind);
		chip.style.borderColor = markColour(m.kind);
		const labelPx = labelPxPerCm(ctx.scale, ctx.labelScale);
		const outCm = g.half + (8 + markNameHalfCrossPx(wallAxis(g.wall))) / labelPx;
		placeInStage(
			ctx,
			chip,
			{
				x: g.centre.x + g.normal.x * g.sign * outCm,
				y: g.centre.y + g.normal.y * g.sign * outCm
			},
			{ shrink: ctx.labelScale }
		);
	});
}

/** The whole HTML layer, rebuilt; the focus plate it ends with, for the bands. */
export function renderCtrlLayer(ctx: CtrlContext): HTMLElement | null {
	ctx.dom.ctrlLayer.innerHTML = '';

	/* The chain's numbers go in a group of their own, there only while the chain
	   is up; it lies over the whole stage and takes no pointer of its own, so a
	   chip inside it sits exactly where it was placed. */
	let chainGroup: HTMLElement | null = null;
	ctx.dims.forEach((d) => {
		/* A landmark's own place in the chain carries no number: its square is a
		   break in the line and nothing more. */
		if (d.value == null) return;
		if (d.inChain && !chainGroup) {
			chainGroup = ctx.dom.doc.createElement('div');
			chainGroup.className = 'fp-chain';
			chainGroup.setAttribute('data-testid', 'chain');
			ctx.dom.ctrlLayer.appendChild(chainGroup);
		}
		const parent = d.inChain && chainGroup ? chainGroup : undefined;
		const place = placer(ctx, chipAnchor(d), { parent, shrink: ctx.labelScale });
		if (d.readOnly) {
			buildGapChip(ctx.dom.doc, { testid: d.testid, value: d.value, source: d.source }, place);
		} else {
			buildChip(
				ctx.dom.doc,
				{
					testid: d.testid,
					value: d.value,
					source: d.source,
					label: d.label || RO.fieldLength,
					focused: d.tone === 'primary',
					onCommit: (cm) => ctx.deps.commitDim(d, cm)
				},
				place,
				ctx.deps
			);
		}
	});

	renderMarkNames(ctx);

	/* The live length riding the pointer while a stroke or a resize is lengthening
	   a wall. Read-only: mid-gesture there is nothing to commit. */
	const live = ctx.liveDim;
	if (live) {
		addLabel(
			ctx.dom.doc,
			live.value + ' cm',
			'live-dim',
			placer(ctx, dimAnchor(live), { shrink: ctx.labelScale })
		);
	}

	// Last, so it can avoid every chip this pass has already placed.
	return renderFocusPlate({
		dom: ctx.dom,
		session: ctx.session,
		scale: ctx.scale,
		isNarrow: ctx.isNarrow,
		place: (el, anchor, opts) => placeInStage(ctx, el, anchor, opts),
		deps: ctx.deps
	});
}
