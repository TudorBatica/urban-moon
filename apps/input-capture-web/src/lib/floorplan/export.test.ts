import { describe, expect, it } from 'vitest';
import { roomToSvg, svgToPngDataUrl } from './export';
import type { Provenance, RoomSegment, RoomSnapshot, RoomWall } from '$lib/types';

/* The fixture is built by hand from the CONTRACTS.md types, not captured from
   the engine: the export has to render whatever the contract allows. A closed
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

/** Every `<n> cm` label the dimensions layer carries, in document order. */
function dimLabels(svg: string): string[] {
	const layer = /<g data-layer="dimensions">([\s\S]*)<\/g><g data-layer="note">/.exec(svg);
	expect(layer).not.toBeNull();
	return [...(layer as RegExpExecArray)[1].matchAll(/data-dim="([^"]+)"/g)].map((m) => m[1]);
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

	it('draws a swing arc for the door', () => {
		const arcs = [...svg.matchAll(/<path d="M [^"]*A (\d+(?:\.\d+)?) \1 0 0 [01] [^"]*"/g)];
		expect(arcs.length).toBeGreaterThanOrEqual(1);
		// The arc radius is the door's own width.
		expect(arcs.some((m) => Number(m[1]) === 90)).toBe(true);
		expect(svg).toContain('stroke="#8A835F"'); // the door's brass
	});

	it('dashes the open segment', () => {
		const plan = /<g data-layer="plan">([\s\S]*?)<\/g><g data-layer="dimensions">/.exec(svg);
		expect(plan).not.toBeNull();
		const dashedLines = [
			...(plan as RegExpExecArray)[1].matchAll(/<line [^>]*stroke-dasharray="[^"]+"[^>]*\/>/g)
		];
		expect(dashedLines.length).toBeGreaterThanOrEqual(1);
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

describe('svgToPngDataUrl', () => {
	it('refuses to run outside a browser', async () => {
		await expect(svgToPngDataUrl('<svg/>', 2)).rejects.toThrow(/browser-only/);
	});
});
