import { describe, expect, it } from 'vitest';
import { roomToSvg, svgToPngDataUrl } from './export';
import type { Provenance, RoomLandmark, RoomSegment, RoomSnapshot, RoomWall } from '$lib/types';

/* The fixture is built by hand from the snapshot types, not captured from the
   engine: the export has to render whatever those types allow. A closed
   420x310 room, a 90 cm door on the north wall, a 120 cm window on the east
   one, and a 100 cm `open` stretch on the south wall so the dashed style has
   something to prove. */

const typed = (value: number): Provenance => ({ value, source: 'typed' });

function seg(
	id: string,
	kind: RoomSegment['kind'],
	offsetFromStartCm: number,
	lengthCm: number,
	extra: Partial<RoomSegment> = {}
): RoomSegment {
	return {
		id,
		kind,
		lengthCm: typed(lengthCm),
		offsetFromStartCm,
		sillCm: null,
		hinge: null,
		swing: null,
		...extra
	};
}

function wall(
	id: string,
	index: number,
	from: [number, number],
	to: [number, number],
	heading: RoomWall['heading'],
	lengthCm: number,
	segments: RoomSegment[]
): RoomWall {
	return { id, index, from, to, heading, lengthCm: typed(lengthCm), segments };
}

const doorSeg = seg('s-door', 'door', 165, 90, { hinge: 'end', swing: 'in' });
const windowSeg = seg('s-win', 'window', 95, 120, { sillCm: 90 });
const openSeg = seg('s-open', 'open', 160, 100);

const room: RoomSnapshot = {
	unit: 'cm',
	ceilingHeightCm: 265,
	closed: true,
	outline: [
		[0, 0],
		[420, 0],
		[420, 310],
		[0, 310]
	],
	walls: [
		wall('w1', 0, [0, 0], [420, 0], 'E', 420, [
			seg('s1a', 'wall', 0, 165),
			doorSeg,
			seg('s1b', 'wall', 255, 165)
		]),
		wall('w2', 1, [420, 0], [420, 310], 'S', 310, [
			seg('s2a', 'wall', 0, 95),
			windowSeg,
			seg('s2b', 'wall', 215, 95)
		]),
		wall('w3', 2, [420, 310], [0, 310], 'W', 420, [
			seg('s3a', 'wall', 0, 160),
			openSeg,
			seg('s3b', 'wall', 260, 160)
		]),
		wall('w4', 3, [0, 310], [0, 0], 'N', 310, [seg('s4', 'wall', 0, 310)])
	],
	openings: [
		{ ...doorSeg, wallId: 'w1' },
		{ ...windowSeg, wallId: 'w2' },
		{ ...openSeg, wallId: 'w3' }
	],
	unanswered: [],
	finished: true
};

const INK = '#141414';
const GREY = '#7A7975';
const PAPER = '#FFFFFF';

/** The plan layer's own markup. */
function planLayer(svg: string): string {
	const plan = /<g data-layer="plan">([\s\S]*?)<\/g><g data-layer="dimensions">/.exec(svg);
	expect(plan).not.toBeNull();
	return (plan as RegExpExecArray)[1];
}

/** Every `<n> cm` label the dimensions layer carries, in document order. */
function dimLabels(svg: string): string[] {
	const layer = /<g data-layer="dimensions">([\s\S]*)<\/g><g data-layer="landmarks">/.exec(svg);
	expect(layer).not.toBeNull();
	return [...(layer as RegExpExecArray)[1].matchAll(/data-dim="([^"]+)"/g)].map((m) => m[1]);
}

/** The landmark layer's own markup. */
function landmarkLayer(svg: string): string {
	const layer = /<g data-layer="landmarks">([\s\S]*?)<\/g><g data-layer="note">/.exec(svg);
	expect(layer).not.toBeNull();
	return (layer as RegExpExecArray)[1];
}

describe('roomToSvg', () => {
	const svg = roomToSvg(room, { widthPx: 1200 });

	it('is a standalone svg document string', () => {
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
	});

	it('is pure — no DOM needed', () => {
		expect(typeof document).toBe('undefined');
	});

	it('respects widthPx in the root width attribute', () => {
		expect(/<svg[^>]*\swidth="1200"/.test(svg)).toBe(true);
		expect(/<svg[^>]*\swidth="820"/.test(roomToSvg(room, { widthPx: 820 }))).toBe(true);
		// The default keeps the same aspect: height follows the viewBox, never 0.
		const h = /<svg[^>]*\sheight="(\d+)"/.exec(roomToSvg(room));
		expect(h).not.toBeNull();
		expect(Number((h as RegExpExecArray)[1])).toBeGreaterThan(0);
	});

	it('carries one cm dimension per wall and per opening', () => {
		const labels = dimLabels(svg);
		expect(labels).toHaveLength(room.walls.length + room.openings.length);
		expect(labels.every((l) => /^\d+ cm$/.test(l))).toBe(true);
		for (const w of room.walls) expect(labels).toContain(`${w.lengthCm.value} cm`);
		for (const o of room.openings) expect(labels).toContain(`${o.lengthCm.value} cm`);
		// 420 appears twice (two walls), and so is not deduplicated away.
		expect(labels.filter((l) => l === '420 cm')).toHaveLength(2);
	});

	it('draws a swing arc for the door, in ink', () => {
		const arcs = [...svg.matchAll(/<path d="M [^"]*A (\d+(?:\.\d+)?) \1 0 0 [01] [^"]*"/g)];
		expect(arcs.length).toBeGreaterThanOrEqual(1);
		// The arc radius is the door's own width.
		expect(arcs.some((m) => Number(m[1]) === 90)).toBe(true);
		const inked = [...svg.matchAll(/<path d="M [^"]*A [^"]*"[^>]*\/>/g)];
		expect(inked.every((m) => m[0].includes(`stroke="${INK}"`))).toBe(true);
	});

	it('draws walls as a solid ink band, with no hatch and no brass', () => {
		const plan = planLayer(svg);
		expect(plan).toContain(`<polygon points="-10,10 165,10 165,-10 -10,-10" fill="${INK}"/>`);
		expect(svg).not.toContain('pattern');
		expect(svg.toLowerCase()).not.toContain('#8a835f');
		expect(svg.toLowerCase()).not.toContain('#b69a5e');
	});

	it('cuts the opening out of the band, in paper', () => {
		const plan = planLayer(svg);
		expect(plan).toContain(`fill="${PAPER}" stroke="none"`);
	});

	it('draws a Fără perete side as a dashed grey line with a tick at each end', () => {
		const plan = planLayer(svg);
		const dashed = [...plan.matchAll(/<line [^>]*stroke="#7A7975"[^>]*stroke-dasharray="[^"]+"[^>]*\/>/g)];
		expect(dashed).toHaveLength(1);
		const ticks = [...plan.matchAll(/<line [^>]*stroke="#7A7975"[^>]*\/>/g)].filter(
			(m) => !m[0].includes('dasharray')
		);
		expect(ticks).toHaveLength(2);
	});

	it('writes every number in Figtree, ink when typed', () => {
		expect(svg).toContain('font-family="Figtree');
		expect(svg).not.toContain('Plus Jakarta Sans');
		const labels = [...svg.matchAll(/<text[^>]*>(\d+) cm<\/text>/g)];
		expect(labels.length).toBeGreaterThan(0);
		// Every length in the fixture is typed, so none of them is italic.
		expect(svg).not.toContain('font-style="italic"');
	});

	it('writes a length nobody typed in grey italic', () => {
		const drawn = roomToSvg({
			...room,
			walls: room.walls.map((w) => ({ ...w, lengthCm: { value: w.lengthCm.value, source: 'drawn' } }))
		});
		expect(drawn).toContain('font-style="italic"');
		expect(drawn).toContain(`fill="${GREY}"`);
	});

	it('notes the unit, the ceiling and an unclosed outline', () => {
		expect(svg).toContain('All dimensions in cm');
		expect(svg).toContain('Ceiling 265 cm');
		expect(svg).not.toContain('outline not closed');
		expect(roomToSvg({ ...room, closed: false })).toContain('outline not closed');
	});

	it('survives an empty room', () => {
		const empty = roomToSvg({ ...room, walls: [], openings: [], outline: [], closed: false });
		expect(empty).toContain('<svg xmlns');
		expect(dimLabels(empty)).toHaveLength(0);
	});
});

describe('the landmarks on the exported plan', () => {
	const marks: RoomLandmark[] = [
		{
			id: 'mark1',
			kind: 'gas',
			wallId: 'w1',
			offsetFromStartCm: 300,
			face: 'in',
			gapBeforeCm: 45,
			gapAfterCm: 90
		},
		{
			id: 'mark2',
			kind: 'radiator',
			wallId: 'w2',
			offsetFromStartCm: 20,
			face: 'out',
			gapBeforeCm: 20,
			gapAfterCm: 45
		}
	];
	const svg = roomToSvg({ ...room, landmarks: marks }, { widthPx: 1200 });

	it('draws one square per landmark, each in its own colour', () => {
		const layer = landmarkLayer(svg);
		expect([...layer.matchAll(/<polygon [^>]*\/>/g)]).toHaveLength(2);
		expect(layer).toContain('fill="#C08A1E"'); // gaz
		expect(layer).toContain('fill="#8A6244"'); // calorifer
	});

	it('names each one on a chip in the same colour', () => {
		const layer = landmarkLayer(svg);
		expect(layer).toContain('>Gaz</text>');
		expect(layer).toContain('>Calorifer</text>');
		expect(layer).toContain(`fill="${PAPER}" stroke="#C08A1E"`);
	});

	it('draws the square 30 cm on a side, at the plan\'s own scale', () => {
		const layer = landmarkLayer(svg);
		const first = /<polygon points="([^"]+)"/.exec(layer);
		expect(first).not.toBeNull();
		const pts = (first as RegExpExecArray)[1]
			.split(' ')
			.map((p) => p.split(',').map(Number) as [number, number]);
		const xs = pts.map((p) => p[0]);
		const ys = pts.map((p) => p[1]);
		expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(30, 6);
		expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(30, 6);
	});

	it('states no distance: the list beside the plan carries those', () => {
		expect(dimLabels(svg)).toEqual(dimLabels(roomToSvg(room, { widthPx: 1200 })));
		expect(landmarkLayer(svg)).not.toContain('data-dim');
	});

	it('draws nothing where a snapshot has no landmarks', () => {
		expect(landmarkLayer(roomToSvg(room))).toBe('');
	});
});

describe('svgToPngDataUrl', () => {
	it('refuses to run outside a browser', async () => {
		await expect(svgToPngDataUrl('<svg/>', 2)).rejects.toThrow(/browser-only/);
	});
});
