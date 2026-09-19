import { describe, expect, it } from 'vitest';
import { planMarkup, wallBandPoints, type Scene } from './planMarkup';
import { allDims, liveDim } from './dims';
import type { Model, Segment, SegmentKind, Wall } from './model';
import { reflow } from './openings';
import { loadFixtures, type Fixture } from './fixtures/load';

function sceneOf(f: Fixture): Scene {
	return {
		model: f.model,
		selection: f.selection,
		drag: null,
		mode: f.mode,
		toolGesture: f.toolGesture,
		scale: f.scale,
		visibleBox: f.visibleBox,
		dims: allDims(f.model, f.selection, f.mode, f.scale, f.visibleBox),
		liveDim: liveDim(f.model, null, f.scale)
	};
}

describe('planMarkup', () => {
	for (const f of loadFixtures()) {
		it('is what the editor drew for ' + f.name, () => {
			expect(planMarkup(sceneOf(f))).toBe(f.svg);
		});
	}
});

let n = 0;
function seg(kind: SegmentKind, value: number): Segment {
	return {
		id: 'pm' + ++n,
		kind,
		length: { value, source: 'computed' },
		offsetFromStart: 0,
		sill: null,
		hinge: kind === 'door' ? 'start' : null,
		hingeSource: kind === 'door' ? 'computed' : null,
		swing: kind === 'door' ? 'in' : null,
		swingSource: kind === 'door' ? 'computed' : null
	};
}
function wall(id: string, from: [number, number], to: [number, number], segs?: Segment[]): Wall {
	const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
	const w: Wall = {
		id,
		from: { x: from[0], y: from[1] },
		to: { x: to[0], y: to[1] },
		lengthSource: 'drawn',
		isOpen: false,
		segments: segs && segs.length ? segs : [seg('wall', len)]
	};
	reflow(w);
	return w;
}
const BOX = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
function scene(model: Model, over: Partial<Scene> = {}): Scene {
	const base: Scene = {
		model,
		selection: null,
		drag: null,
		mode: 'plan',
		toolGesture: 'none',
		scale: 1,
		visibleBox: BOX,
		dims: [],
		liveDim: null,
		...over
	};
	return base;
}

describe('the hits group', () => {
	const model: Model = {
		walls: [
			wall('a', [0, 0], [400, 0], [seg('wall', 150), seg('door', 90), seg('wall', 160)]),
			wall('b', [400, 0], [400, 300])
		],
		landmarks: []
	};

	it('is in paint order: plain pieces, corners, free ends, then openings and their jambs', () => {
		const out = planMarkup(scene(model, { selection: { segId: model.walls[0].segments[1].id } }));
		const hits = out.slice(out.indexOf('<g class="fp-hits">'));
		const order = [...hits.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
		expect(order).toEqual([
			'seg-pm1-hit',
			'seg-pm3-hit',
			'seg-pm4-hit',
			'corner-400,0',
			'free-end-0,0',
			'free-end-400,300',
			'seg-pm2-hit',
			'opening-edge-start-pm2',
			'opening-edge-end-pm2'
		]);
	});

	it('has no hit rects at all on the landmark step', () => {
		const out = planMarkup(scene(model, { mode: 'landmarks', toolGesture: 'tap' }));
		expect(out).toContain('<g class="fp-hits"></g>');
		expect(out).not.toContain('class="fp-hit"');
	});

	it('offers no corner or free-end target while a making tool is on', () => {
		const out = planMarkup(scene(model, { toolGesture: 'stroke' }));
		expect(out).not.toContain('data-testid="corner-');
		expect(out).not.toContain('fp-free-hit');
	});
});

describe('free-end circles', () => {
	const model: Model = { walls: [wall('a', [0, 0], [400, 0])], landmarks: [] };

	it('are drawn only with a stroke tool on', () => {
		expect(planMarkup(scene(model, { toolGesture: 'stroke' }))).toContain('class="fp-free-end"');
		expect(planMarkup(scene(model))).not.toContain('class="fp-free-end"');
		expect(planMarkup(scene(model, { toolGesture: 'tap' }))).not.toContain('class="fp-free-end"');
	});
});

describe('a live draw stroke', () => {
	const model: Model = { walls: [wall('a', [400, 0], [400, 300])], landmarks: [] };
	const drawing = (over: Record<string, unknown>) =>
		planMarkup(
			scene(model, {
				toolGesture: 'stroke',
				drag: {
					kind: 'draw',
					committed: true,
					startClientX: 0,
					startClientY: 0,
					startCm: { x: 0, y: 0 },
					tool: 'wall',
					startPt: { x: 0, y: 0 },
					startSnap: null,
					endPoint: { x: 400, y: 0 },
					...over
				} as Scene['drag']
			})
		);

	it('draws the band and the dashed centre line', () => {
		const out = drawing({});
		expect(out).toContain('class="fp-preview-band"');
		expect(out).toContain('class="fp-preview"');
	});

	it('marks the weld it is about to make, before release', () => {
		const out = drawing({ endSnap: { kind: 'end', point: { x: 400, y: 0 }, weld: true } });
		expect(out).toContain('class="fp-preview on"');
		expect(out).toContain('class="fp-snap"');
	});

	it('draws the guide where the end only lines up on one axis', () => {
		const out = drawing({
			endSnap: { kind: 'align', point: { x: 400, y: 0 }, guideAt: { x: 400, y: 300 }, weld: false }
		});
		expect(out).toContain('class="fp-guide"');
		expect(out).not.toContain('class="fp-snap"');
	});

	it('a Fără perete stroke has no band, and says so on the line', () => {
		const out = drawing({ tool: 'open' });
		expect(out).not.toContain('fp-preview-band');
		expect(out).toContain('fp-preview-open');
	});
});

describe('wallBandPoints', () => {
	it('extends a welded end by half the thickness, and leaves a free end flush', () => {
		const a = wall('a', [0, 0], [400, 0]);
		const b = wall('b', [400, 0], [400, 300]);
		const model: Model = { walls: [a, b], landmarks: [] };
		const q = wallBandPoints(model, a, true, true, a.from, a.to);
		expect(q.a.x).toBe(0);
		expect(q.e.x).toBe(410);
	});

	it('never extends an internal boundary between two pieces of one wall', () => {
		const a = wall('a', [0, 0], [400, 0], [seg('wall', 200), seg('wall', 200)]);
		const model: Model = { walls: [a], landmarks: [] };
		const q = wallBandPoints(model, a, false, false, { x: 0, y: 0 }, { x: 200, y: 0 });
		expect(q.a.x).toBe(0);
		expect(q.e.x).toBe(200);
	});
});
