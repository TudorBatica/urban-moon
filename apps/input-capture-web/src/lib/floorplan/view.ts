/* The editor's view of the plan: where the canvas looks and how close.
   Pure arithmetic over a `{ cx, cy, scale }` — no DOM, no engine state — so
   fitting, zooming, panning and both limits are decided in one place and can
   be driven from a test. The engine turns a View into the SVG's viewBox. */

/** The canvas's centre in plan centimetres, and how many screen pixels one centimetre takes. */
export interface View {
	cx: number;
	cy: number;
	scale: number;
}

/** The canvas, in screen pixels. */
export interface Size {
	width: number;
	height: number;
}

/** How much of each edge of the canvas the floating plates cover, in screen pixels. */
export interface Bands {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** A rectangle in plan centimetres. */
export interface Box {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface Point {
	x: number;
	y: number;
}

export const NO_BANDS: Bands = { top: 0, right: 0, bottom: 0, left: 0 };

/** What an empty canvas is fitted to: a 4 x 4 m area around the origin. */
export const EMPTY_FIT_CM = 400;

/** Breathing room kept between the plan and the drawing area's own edges. */
const FIT_MARGIN_PX = 24;

/** Zoomed out, the plan's box stays at least this fraction of the canvas's shorter side. */
const MIN_BOX_FRACTION = 4;

/** Zoomed in, this many centimetres are at most the canvas's shorter side. */
const MAX_ZOOM_SPAN_CM = 50;

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/** The bounding box of a set of plan points, or null when there are none. */
export function boxOf(points: readonly Point[]): Box | null {
	if (points.length === 0) return null;
	let minX = points[0].x;
	let maxX = points[0].x;
	let minY = points[0].y;
	let maxY = points[0].y;
	for (const p of points) {
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y);
		maxY = Math.max(maxY, p.y);
	}
	return { minX, minY, maxX, maxY };
}

/** The box a view is measured against: the plan's own, or the empty-canvas area. */
export function fitBox(box: Box | null): Box {
	const half = EMPTY_FIT_CM / 2;
	if (!box) return { minX: -half, minY: -half, maxX: half, maxY: half };
	const w = box.maxX - box.minX;
	const h = box.maxY - box.minY;
	if (w > 0 || h > 0) return box;
	return { minX: box.minX - half, minY: box.minY - half, maxX: box.maxX + half, maxY: box.maxY + half };
}

/** The drawing area: the canvas minus the plate bands, never narrower than a sliver. */
function areaOf(size: Size, bands: Bands): { left: number; top: number; right: number; bottom: number } {
	const left = bands.left + FIT_MARGIN_PX;
	const top = bands.top + FIT_MARGIN_PX;
	const right = size.width - bands.right - FIT_MARGIN_PX;
	const bottom = size.height - bands.bottom - FIT_MARGIN_PX;
	if (right - left < 40 || bottom - top < 40) {
		return { left: 0, top: 0, right: Math.max(1, size.width), bottom: Math.max(1, size.height) };
	}
	return { left, top, right, bottom };
}

/** How far a view may zoom out and in, for a given plan and canvas. */
export function scaleLimits(box: Box | null, size: Size): { min: number; max: number } {
	const b = fitBox(box);
	const shorter = Math.max(1, Math.min(size.width, size.height));
	const span = Math.max(1, Math.max(b.maxX - b.minX, b.maxY - b.minY));
	const max = shorter / MAX_ZOOM_SPAN_CM;
	const min = Math.min(shorter / MIN_BOX_FRACTION / span, max);
	return { min, max };
}

export function clampScale(scale: number, box: Box | null, size: Size): number {
	const { min, max } = scaleLimits(box, size);
	return clamp(scale, min, max);
}

/** Fit the plan (or the empty-canvas area) into the canvas minus its plate bands. */
export function fitView(box: Box | null, size: Size, bands: Bands = NO_BANDS): View {
	const b = fitBox(box);
	const area = areaOf(size, bands);
	const w = Math.max(1, b.maxX - b.minX);
	const h = Math.max(1, b.maxY - b.minY);
	const raw = Math.min((area.right - area.left) / w, (area.bottom - area.top) / h);
	const scale = clampScale(raw, box, size);
	const areaCx = (area.left + area.right) / 2;
	const areaCy = (area.top + area.bottom) / 2;
	return {
		cx: (b.minX + b.maxX) / 2 - (areaCx - size.width / 2) / scale,
		cy: (b.minY + b.maxY) / 2 - (areaCy - size.height / 2) / scale,
		scale
	};
}

/** The SVG viewBox this view puts on a canvas of this size. */
export function viewBoxOf(view: View, size: Size): { x: number; y: number; w: number; h: number } {
	const w = size.width / view.scale;
	const h = size.height / view.scale;
	return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

/** A plan point, in canvas pixels. */
export function cmToPx(view: View, pt: Point, size: Size): Point {
	return {
		x: size.width / 2 + (pt.x - view.cx) * view.scale,
		y: size.height / 2 + (pt.y - view.cy) * view.scale
	};
}

/** A canvas point, in plan centimetres. */
export function pxToCm(view: View, pt: Point, size: Size): Point {
	return {
		x: view.cx + (pt.x - size.width / 2) / view.scale,
		y: view.cy + (pt.y - size.height / 2) / view.scale
	};
}

/** Zoom by `factor` keeping whatever sits under `pointPx` exactly where it is. */
export function zoomAround(
	view: View,
	factor: number,
	pointPx: Point,
	size: Size,
	box: Box | null
): View {
	const scale = clampScale(view.scale * factor, box, size);
	const anchor = pxToCm(view, pointPx, size);
	return {
		cx: anchor.x - (pointPx.x - size.width / 2) / scale,
		cy: anchor.y - (pointPx.y - size.height / 2) / scale,
		scale
	};
}

/** Move the drawing by this many pixels under the client's finger or pointer. */
export function panByPx(view: View, dxPx: number, dyPx: number): View {
	return { cx: view.cx - dxPx / view.scale, cy: view.cy - dyPx / view.scale, scale: view.scale };
}

/** How far a drag near the canvas edge pans the view this frame. */
export function edgePanStep(
	pointPx: Point,
	size: Size,
	opts?: { thresholdPx?: number; stepPx?: number }
): { dx: number; dy: number } {
	const threshold = opts?.thresholdPx ?? 32;
	const step = opts?.stepPx ?? 6;
	let dx = 0;
	let dy = 0;
	if (pointPx.x < threshold) dx = step;
	else if (pointPx.x > size.width - threshold) dx = -step;
	if (pointPx.y < threshold) dy = step;
	else if (pointPx.y > size.height - threshold) dy = -step;
	return { dx, dy };
}

/** Pan just enough that `box` clears the plate bands; unchanged when it already does. */
export function panToReveal(view: View, box: Box, size: Size, bands: Bands): View {
	const a = cmToPx(view, { x: box.minX, y: box.minY }, size);
	const b = cmToPx(view, { x: box.maxX, y: box.maxY }, size);
	const left = Math.min(a.x, b.x);
	const right = Math.max(a.x, b.x);
	const top = Math.min(a.y, b.y);
	const bottom = Math.max(a.y, b.y);
	const area = { left: bands.left, top: bands.top, right: size.width - bands.right, bottom: size.height - bands.bottom };
	let dx = 0;
	let dy = 0;
	if (right - left <= area.right - area.left) {
		if (right > area.right) dx = area.right - right;
		else if (left < area.left) dx = area.left - left;
	}
	if (bottom - top <= area.bottom - area.top) {
		if (bottom > area.bottom) dy = area.bottom - bottom;
		else if (top < area.top) dy = area.top - top;
	}
	if (dx === 0 && dy === 0) return view;
	return panByPx(view, dx, dy);
}
