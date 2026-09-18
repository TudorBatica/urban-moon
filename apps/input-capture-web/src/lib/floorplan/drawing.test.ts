import { describe, expect, it } from 'vitest';
import {
	DrawingSaveError,
	carriedHeight,
	saveCeilingHeight,
	saveEditedDrawing,
	type DrawingDeps
} from './drawing';
import type { Drawing, RoomSnapshot } from '$lib/types';

function room(over: Partial<RoomSnapshot> = {}): RoomSnapshot {
	return {
		unit: 'cm',
		ceilingHeightCm: null,
		closed: false,
		outline: [
			[0, 0],
			[400, 0]
		],
		walls: [],
		openings: [],
		unanswered: [],
		finished: false,
		...over
	};
}

function deps(over: Partial<DrawingDeps> = {}): DrawingDeps & { saved: Drawing[] } {
	const saved: Drawing[] = [];
	return {
		saved,
		toSvg: (r) => `<svg data-ceiling="${String(r.ceilingHeightCm)}"></svg>`,
		toPng: async (svg) => `data:image/png;base64,${svg.length}`,
		save: (d) => {
			saved.push(d);
		},
		now: () => 1700,
		...over
	};
}

describe('saving from the editor', () => {
	it('builds a Drawing and writes it once', async () => {
		const d = deps();
		const model = { walls: [{ id: 'wall1' }] };
		const out = await saveEditedDrawing({ model, room: room(), previous: null }, d);
		expect(out.model).toBe(model);
		expect(out.room.walls).toEqual([]);
		expect(out.svg).toContain('<svg');
		expect(out.pngDataUrl.startsWith('data:image/png')).toBe(true);
		expect(out.updatedAt).toBe(1700);
		expect(d.saved).toEqual([out]);
	});

	it('carries the height answered before through a re-save', async () => {
		const d = deps();
		const previous = await saveCeilingHeight(
			{ model: null, room: room(), svg: '', pngDataUrl: '', updatedAt: 1 },
			270,
			d
		);
		const again = await saveEditedDrawing({ model: { walls: [] }, room: room(), previous }, d);
		expect(again.room.ceilingHeightCm).toBe(270);
		expect(again.svg).toContain('data-ceiling="270"');
	});

	it('takes the height off a model saved by the old editor', async () => {
		const d = deps();
		const out = await saveEditedDrawing(
			{ model: { ceilingHeightCm: 255, walls: [] }, room: room(), previous: null },
			d
		);
		expect(out.room.ceilingHeightCm).toBe(255);
	});

	it('has no height when nothing has one', async () => {
		const out = await saveEditedDrawing(
			{ model: { walls: [] }, room: room(), previous: null },
			deps()
		);
		expect(out.room.ceilingHeightCm).toBeNull();
	});

	it('saves an open outline and drawn lengths as they are', async () => {
		const out = await saveEditedDrawing(
			{
				model: {},
				room: room({ closed: false, unanswered: ['ceva'] }),
				previous: null
			},
			deps()
		);
		expect(out.room.closed).toBe(false);
		expect(out.room.unanswered).toEqual(['ceva']);
	});
});

describe('answering the ceiling height', () => {
	it('keeps the model and the plan, and re-renders the image', async () => {
		const d = deps();
		const first = await saveEditedDrawing(
			{ model: { walls: ['w'] }, room: room(), previous: null },
			d
		);
		const second = await saveCeilingHeight(first, 280, d);
		expect(second.model).toBe(first.model);
		expect(second.room.walls).toBe(first.room.walls);
		expect(second.room.ceilingHeightCm).toBe(280);
		expect(second.svg).toContain('data-ceiling="280"');
		expect(second.pngDataUrl).not.toBe(first.pngDataUrl);
		expect(d.saved).toHaveLength(2);
	});
});

describe('carriedHeight', () => {
	it('prefers the saved snapshot over the model', () => {
		const previous = {
			model: { ceilingHeightCm: 240 },
			room: room({ ceilingHeightCm: 300 }),
			svg: '',
			pngDataUrl: '',
			updatedAt: 0
		};
		expect(carriedHeight(previous, previous.model)).toBe(300);
		expect(carriedHeight(null, { ceilingHeightCm: 240 })).toBe(240);
		expect(carriedHeight(null, null)).toBeNull();
	});
});

describe('a save that fails', () => {
	it('says the raster failed and never writes', async () => {
		const d = deps({
			toPng: async () => {
				throw new Error('canvas');
			}
		});
		await expect(
			saveEditedDrawing({ model: {}, room: room(), previous: null }, d)
		).rejects.toBeInstanceOf(DrawingSaveError);
		expect(d.saved).toHaveLength(0);
	});

	it('says the storage failed', async () => {
		const d = deps({
			save: () => {
				throw new Error('quota');
			}
		});
		const err = await saveEditedDrawing({ model: {}, room: room(), previous: null }, d).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(DrawingSaveError);
		expect((err as DrawingSaveError).code).toBe('storage_failed');
	});
});
