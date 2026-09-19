/**
 * The view, and cm (model space) to screen px and back. The canvas never moves
 * by itself: it is fitted when the editor opens and when the client asks for it,
 * and otherwise follows only a finger, the wheel or a drag that has reached the
 * canvas edge.
 *
 * Two coordinate systems coexist: `view.ts`'s `{cx, cy, scale}`, which is the
 * arithmetic, and the transform measured off the SVG's own viewBox and bounding
 * rect, which is what a pointer's coordinates mean. Both live here.
 */

import { BASE, ease, ms } from '$lib/ui/motion';
import type { Dom } from './dom';
import type { Point } from './model';
import {
	edgePanStep,
	fitView,
	panByPx,
	panToReveal,
	viewBoxOf,
	zoomAround,
	type Bands,
	type Box,
	type Size,
	type View
} from './view';

export interface ViewBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** What a client point means in cm, measured off the SVG as it is on screen. */
export interface ViewTransform {
	scale: number;
	offX: number;
	offY: number;
	vb: ViewBox;
	rect: DOMRect;
}

export interface ViewportDeps {
	/** the box the whole plan occupies, in cm */
	planBox: () => Box | null;
	/** the plate of the piece in focus, as the last render left it */
	focusPlate: () => HTMLElement | null;
	/** the client zoomed or panned by their own hand */
	onZoomed: () => void;
}

/** A stage this wide or narrower is a phone: the plates dock. */
const NARROW_PX = 860;
/** How far a plate's band reaches past the plate itself. */
const BAND_GAP_PX = 10;

export interface Viewport {
	transform(): ViewTransform;
	clientToCm(clientX: number, clientY: number, t: ViewTransform): Point;
	cmToClient(pt: Point, t: ViewTransform): Point;
	cmToStage(pt: Point, t: ViewTransform): Point;
	/** a client point in stage pixels */
	stagePx(clientX: number, clientY: number): Point;
	stageSize(): Size;
	/** the bands the floating plates cover, measured off the plates themselves */
	bands(): Bands;
	isNarrow(): boolean;
	/** the stretch of plan actually on screen, in cm */
	visibleBox(t: ViewTransform): Box;
	hasView(): boolean;
	/** how far the view should follow a drag that has reached the canvas edge */
	edgeStep(stagePoint: Point): { dx: number; dy: number };
	fitNow(onFrame: () => void): void;
	stopFitEase(): void;
	applyView(): void;
	zoomBy(factor: number, atPx: Point | null): void;
	panBy(dxPx: number, dyPx: number): void;
	revealBox(box: Box): void;
	reset(): void;
	destroy(): void;
}

export function createViewport(dom: Dom, deps: ViewportDeps): Viewport {
	const win = dom.win;
	let view: View | null = null;
	let fitFrame: number | null = null;
	let destroyed = false;

	function currentViewBox(): ViewBox {
		const parts = (dom.svg.getAttribute('viewBox') || '-200 -200 400 400').split(/\s+/).map(Number);
		return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
	}

	function transform(): ViewTransform {
		const rect = dom.svg.getBoundingClientRect();
		const vb = currentViewBox();
		const scale = rect.width > 0 && rect.height > 0 ? Math.min(rect.width / vb.w, rect.height / vb.h) : 1;
		const offX = rect.left + (rect.width - vb.w * scale) / 2;
		const offY = rect.top + (rect.height - vb.h * scale) / 2;
		return { scale, offX, offY, vb, rect };
	}

	function cmToClient(pt: Point, t: ViewTransform): Point {
		return { x: t.offX + (pt.x - t.vb.x) * t.scale, y: t.offY + (pt.y - t.vb.y) * t.scale };
	}

	function clientToCm(clientX: number, clientY: number, t: ViewTransform): Point {
		return { x: t.vb.x + (clientX - t.offX) / t.scale, y: t.vb.y + (clientY - t.offY) / t.scale };
	}

	function cmToStage(pt: Point, t: ViewTransform): Point {
		const c = cmToClient(pt, t);
		const sr = dom.stage.getBoundingClientRect();
		return { x: c.x - sr.left, y: c.y - sr.top };
	}

	function stagePx(clientX: number, clientY: number): Point {
		const sr = dom.svg.getBoundingClientRect();
		return { x: clientX - sr.left, y: clientY - sr.top };
	}

	function stageSize(): Size {
		const rect = dom.svg.getBoundingClientRect();
		return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
	}

	/* Measured, not guessed: the plates are laid out by CSS and their heights
	   change with the device and with what the focused piece needs. */
	function bands(): Bands {
		const sr = dom.svg.getBoundingClientRect();
		const out: Bands = { top: 0, right: 0, bottom: 0, left: 0 };
		if (sr.width <= 0 || sr.height <= 0) return out;
		for (const el of [dom.toolPlate, dom.hint]) {
			if (el.classList.contains('fp-off')) continue;
			const r1 = el.getBoundingClientRect();
			if (r1.height > 0) out.top = Math.max(out.top, r1.bottom - sr.top + BAND_GAP_PX);
		}
		for (const el of [dom.histPlate, dom.viewPlate, deps.focusPlate()]) {
			if (!el || el.classList.contains('fp-off') || !el.isConnected) continue;
			const r2 = el.getBoundingClientRect();
			if (r2.height > 0) out.bottom = Math.max(out.bottom, sr.bottom - r2.top + BAND_GAP_PX);
		}
		out.top = Math.max(0, Math.min(out.top, sr.height / 3));
		out.bottom = Math.max(0, Math.min(out.bottom, sr.height / 3));
		return out;
	}

	function isNarrow(): boolean {
		return stageSize().width <= NARROW_PX;
	}

	/**
	 * The SVG meets its viewBox, so one axis shows MORE than the viewBox asks for,
	 * and a wall out there is still on screen.
	 */
	function visibleBox(t: ViewTransform): Box {
		const halfW = t.rect.width / t.scale / 2;
		const halfH = t.rect.height / t.scale / 2;
		const cx = t.vb.x + t.vb.w / 2;
		const cy = t.vb.y + t.vb.h / 2;
		return { minX: cx - halfW, maxX: cx + halfW, minY: cy - halfH, maxY: cy + halfH };
	}

	function fitTarget(): View {
		return fitView(deps.planBox(), stageSize(), bands());
	}

	function stopFitEase(): void {
		if (fitFrame != null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(fitFrame);
		fitFrame = null;
	}

	/**
	 * The fit is eased, so the client can see where the plan went; the very first
	 * fit has nothing to ease from, and the zoom is eased geometrically because a
	 * scale is a ratio, not a distance.
	 */
	function fitNow(onFrame: () => void): void {
		const target = fitTarget();
		stopFitEase();
		const from = view;
		const dur = ms(BASE);
		if (!from || dur <= 0 || typeof win.requestAnimationFrame !== 'function') {
			view = target;
			return;
		}
		let t0: number | null = null;
		const step = (now: number): void => {
			fitFrame = null;
			if (destroyed) return;
			if (t0 == null) t0 = now;
			const k = ease(Math.min(1, (now - t0) / dur));
			view = {
				cx: from.cx + (target.cx - from.cx) * k,
				cy: from.cy + (target.cy - from.cy) * k,
				scale: from.scale * Math.pow(target.scale / from.scale, k)
			};
			onFrame();
			if (k < 1) fitFrame = win.requestAnimationFrame(step);
		};
		fitFrame = win.requestAnimationFrame(step);
	}

	function applyView(): void {
		/* Nothing to ease from before the first view, so this fit is immediate — and
		   it stands down whatever ease was running, exactly as a fit always does. */
		if (!view) {
			stopFitEase();
			view = fitTarget();
		}
		const vb = viewBoxOf(view, stageSize());
		dom.svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
	}

	function zoomBy(factor: number, atPx: Point | null): void {
		stopFitEase();
		const size = stageSize();
		const at = atPx || { x: size.width / 2, y: size.height / 2 };
		const box = deps.planBox();
		view = zoomAround(view || fitView(box, size, bands()), factor, at, size, box);
		deps.onZoomed();
	}

	/* The view moves for reasons of its own too (the edge auto-pan, clearing the
	   docked plate), so noting the client's first zoom or pan belongs to the paths
	   a client drives, not here. */
	function panBy(dxPx: number, dyPx: number): void {
		stopFitEase();
		if (!view) view = fitTarget();
		view = panByPx(view, dxPx, dyPx);
	}

	/** When the piece in focus would sit under a plate, pan just enough to show it. */
	function revealBox(box: Box): void {
		if (!view) return;
		stopFitEase();
		view = panToReveal(view, box, stageSize(), bands());
	}

	return {
		transform,
		clientToCm,
		cmToClient,
		cmToStage,
		stagePx,
		stageSize,
		bands,
		isNarrow,
		visibleBox,
		hasView: () => view !== null,
		edgeStep: (stagePoint) => edgePanStep(stagePoint, stageSize()),
		fitNow,
		stopFitEase,
		applyView,
		zoomBy,
		panBy,
		revealBox,
		reset: () => {
			view = null;
		},
		destroy: () => {
			destroyed = true;
			stopFitEase();
		}
	};
}
