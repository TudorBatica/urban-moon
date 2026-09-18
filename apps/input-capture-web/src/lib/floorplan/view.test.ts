import { describe, expect, it } from 'vitest';
import {
	EMPTY_FIT_CM,
	NO_BANDS,
	boxOf,
	clampScale,
	cmToPx,
	edgePanStep,
	fitView,
	panByPx,
	panToReveal,
	pxToCm,
	scaleLimits,
	viewBoxOf,
	zoomAround,
	type Bands,
	type Box,
	type Size
} from './view';

const phone: Size = { width: 360, height: 560 };
const desk: Size = { width: 1000, height: 560 };
const bands: Bands = { top: 118, right: 0, bottom: 150, left: 0 };

const room: Box = { minX: 0, minY: 0, maxX: 440, maxY: 300 };

describe('boxOf', () => {
	it('is null without points, and the extent of what there is', () => {
		expect(boxOf([])).toBeNull();
		expect(boxOf([{ x: 3, y: -2 }, { x: -1, y: 5 }])).toEqual({
			minX: -1,
			minY: -2,
			maxX: 3,
			maxY: 5
		});
	});
});

describe('fitView', () => {
	it('puts the whole plan inside the canvas', () => {
		const v = fitView(room, desk, NO_BANDS);
		const a = cmToPx(v, { x: room.minX, y: room.minY }, desk);
		const b = cmToPx(v, { x: room.maxX, y: room.maxY }, desk);
		expect(a.x).toBeGreaterThanOrEqual(0);
		expect(a.y).toBeGreaterThanOrEqual(0);
		expect(b.x).toBeLessThanOrEqual(desk.width);
		expect(b.y).toBeLessThanOrEqual(desk.height);
	});

	it('keeps the plan out of the plate bands', () => {
		const v = fitView(room, phone, bands);
		const a = cmToPx(v, { x: room.minX, y: room.minY }, phone);
		const b = cmToPx(v, { x: room.maxX, y: room.maxY }, phone);
		expect(a.y).toBeGreaterThanOrEqual(bands.top);
		expect(b.y).toBeLessThanOrEqual(phone.height - bands.bottom);
	});

	it('is tighter with bands than without', () => {
		expect(fitView(room, desk, bands).scale).toBeLessThan(fitView(room, desk, NO_BANDS).scale);
	});

	it('fits a 4 x 4 m area on an empty canvas', () => {
		const v = fitView(null, desk, NO_BANDS);
		const a = cmToPx(v, { x: -EMPTY_FIT_CM / 2, y: -EMPTY_FIT_CM / 2 }, desk);
		const b = cmToPx(v, { x: EMPTY_FIT_CM / 2, y: EMPTY_FIT_CM / 2 }, desk);
		expect(b.y - a.y).toBeGreaterThan(desk.height * 0.85);
		expect(b.y - a.y).toBeLessThanOrEqual(desk.height);
		expect(v.cx).toBeCloseTo(0, 5);
		expect(v.cy).toBeCloseTo(0, 5);
	});

	it('gives a single point the empty-canvas area rather than an infinite zoom', () => {
		const dot: Box = { minX: 120, minY: 40, maxX: 120, maxY: 40 };
		const v = fitView(dot, desk, NO_BANDS);
		expect(Number.isFinite(v.scale)).toBe(true);
		expect(v.scale).toBeLessThanOrEqual(scaleLimits(dot, desk).max);
	});

	it('centres the plan on the drawing area, not on the canvas', () => {
		const v = fitView(room, phone, bands);
		const centre = cmToPx(v, { x: 220, y: 150 }, phone);
		expect(centre.y).toBeCloseTo((bands.top + (phone.height - bands.bottom)) / 2, 5);
	});
});

describe('the two limits', () => {
	it('zoomed out, the plan stays at least a quarter of the shorter side', () => {
		const { min } = scaleLimits(room, phone);
		expect(440 * min).toBeCloseTo(Math.min(phone.width, phone.height) / 4, 5);
		expect(clampScale(min / 10, room, phone)).toBeCloseTo(min, 10);
	});

	it('zoomed in, 50 cm is at most the shorter side', () => {
		const { max } = scaleLimits(room, phone);
		expect(50 * max).toBeCloseTo(Math.min(phone.width, phone.height), 5);
		expect(clampScale(max * 10, room, phone)).toBeCloseTo(max, 10);
	});

	it('never lets the floor pass the ceiling on a tiny plan', () => {
		const stub: Box = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
		const { min, max } = scaleLimits(stub, phone);
		expect(min).toBeLessThanOrEqual(max);
	});
});

describe('zoomAround', () => {
	it('keeps the point under the pointer exactly still', () => {
		const v = fitView(room, desk, NO_BANDS);
		const pointer = { x: 300, y: 200 };
		const before = pxToCm(v, pointer, desk);
		const after = pxToCm(zoomAround(v, 1.6, pointer, desk, room), pointer, desk);
		expect(after.x).toBeCloseTo(before.x, 6);
		expect(after.y).toBeCloseTo(before.y, 6);
	});

	it('keeps it still zooming out too', () => {
		const v = fitView(room, desk, NO_BANDS);
		const pointer = { x: 120, y: 480 };
		const before = pxToCm(v, pointer, desk);
		const after = pxToCm(zoomAround(v, 0.7, pointer, desk, room), pointer, desk);
		expect(after.x).toBeCloseTo(before.x, 6);
		expect(after.y).toBeCloseTo(before.y, 6);
	});

	it('obeys both limits', () => {
		const v = fitView(room, desk, NO_BANDS);
		const { min, max } = scaleLimits(room, desk);
		expect(zoomAround(v, 100, { x: 0, y: 0 }, desk, room).scale).toBeCloseTo(max, 10);
		expect(zoomAround(v, 0.001, { x: 0, y: 0 }, desk, room).scale).toBeCloseTo(min, 10);
	});
});

describe('panByPx', () => {
	it('moves the drawing with the finger', () => {
		const v = fitView(room, desk, NO_BANDS);
		const before = cmToPx(v, { x: 0, y: 0 }, desk);
		const after = cmToPx(panByPx(v, 40, -25), { x: 0, y: 0 }, desk);
		expect(after.x - before.x).toBeCloseTo(40, 6);
		expect(after.y - before.y).toBeCloseTo(-25, 6);
	});

	it('leaves the zoom alone', () => {
		const v = fitView(room, desk, NO_BANDS);
		expect(panByPx(v, 10, 10).scale).toBe(v.scale);
	});
});

describe('edgePanStep', () => {
	const size: Size = { width: 400, height: 400 };

	it('is still in the middle', () => {
		expect(edgePanStep({ x: 200, y: 200 }, size)).toEqual({ dx: 0, dy: 0 });
	});

	it('pans toward the edge the pointer is near, at a steady pace', () => {
		expect(edgePanStep({ x: 5, y: 200 }, size, { stepPx: 6 })).toEqual({ dx: 6, dy: 0 });
		expect(edgePanStep({ x: 20, y: 200 }, size, { stepPx: 6 })).toEqual({ dx: 6, dy: 0 });
		expect(edgePanStep({ x: 398, y: 200 }, size, { stepPx: 6 })).toEqual({ dx: -6, dy: 0 });
		expect(edgePanStep({ x: 200, y: 2 }, size, { stepPx: 6 })).toEqual({ dx: 0, dy: 6 });
		expect(edgePanStep({ x: 200, y: 399 }, size, { stepPx: 6 })).toEqual({ dx: 0, dy: -6 });
	});

	it('pans on both axes in a corner', () => {
		expect(edgePanStep({ x: 4, y: 4 }, size, { stepPx: 6 })).toEqual({ dx: 6, dy: 6 });
	});
});

describe('panToReveal', () => {
	it('does nothing when the piece already clears the plates', () => {
		const v = fitView(room, phone, bands);
		expect(panToReveal(v, { minX: 200, minY: 140, maxX: 240, maxY: 160 }, phone, bands)).toBe(v);
	});

	it('pans just enough to clear the docked plate', () => {
		const v = { cx: 220, cy: 150, scale: 1 };
		const piece: Box = { minX: 200, minY: 290, maxX: 240, maxY: 300 };
		const moved = panToReveal(v, piece, phone, bands);
		const bottom = cmToPx(moved, { x: piece.maxX, y: piece.maxY }, phone).y;
		expect(bottom).toBeCloseTo(phone.height - bands.bottom, 5);
		expect(moved.scale).toBe(v.scale);
	});

	it('leaves an axis alone when the piece is larger than the space', () => {
		const v = fitView(room, phone, NO_BANDS);
		const tall: Box = { minX: 0, minY: -4000, maxX: 10, maxY: 4000 };
		expect(panToReveal(v, tall, phone, bands).cy).toBeCloseTo(v.cy, 10);
	});
});

describe('viewBoxOf', () => {
	it('is the canvas in centimetres, centred on the view', () => {
		const v = { cx: 100, cy: 50, scale: 2 };
		expect(viewBoxOf(v, { width: 400, height: 200 })).toEqual({ x: 0, y: 0, w: 200, h: 100 });
	});
});
