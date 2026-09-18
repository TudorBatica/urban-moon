/* Building the saved drawing, and the one place it is written from. The
   ceiling height's truth is the saved drawing's own snapshot, so it survives
   every re-save of the plan and is answered later without an editor mounted.
   Every side effect (rendering, rastering, the clock, the store) is injected,
   so the whole of both ways in runs in a test. */

import type { Drawing, RoomSnapshot } from '$lib/types';

export type DrawingFailure = 'raster_failed' | 'storage_failed';

export class DrawingSaveError extends Error {
	readonly code: DrawingFailure;

	constructor(code: DrawingFailure, cause: unknown) {
		super(`drawing save failed: ${code}`);
		this.name = 'DrawingSaveError';
		this.code = code;
		this.cause = cause;
	}
}

export interface DrawingDeps {
	toSvg(room: RoomSnapshot): string;
	toPng(svg: string): Promise<string>;
	save(drawing: Drawing): void;
	now(): number;
}

/** A model saved by an earlier editor carried the height itself. */
function heightInModel(model: unknown): number | null {
	if (!model || typeof model !== 'object') return null;
	const v = (model as { ceilingHeightCm?: unknown }).ceilingHeightCm;
	return typeof v === 'number' ? v : null;
}

/** The height to carry into a re-save: what was answered before, else whatever an old model holds. */
export function carriedHeight(previous: Drawing | null, model: unknown): number | null {
	const saved = previous?.room?.ceilingHeightCm;
	if (typeof saved === 'number') return saved;
	return heightInModel(model);
}

async function build(
	model: unknown,
	room: RoomSnapshot,
	deps: DrawingDeps
): Promise<Drawing> {
	let svg: string;
	let pngDataUrl: string;
	try {
		svg = deps.toSvg(room);
		pngDataUrl = await deps.toPng(svg);
	} catch (err) {
		throw new DrawingSaveError('raster_failed', err);
	}
	const drawing: Drawing = { model, room, svg, pngDataUrl, updatedAt: deps.now() };
	try {
		deps.save(drawing);
	} catch (err) {
		throw new DrawingSaveError('storage_failed', err);
	}
	return drawing;
}

/** Saving from the editor: its model and snapshot, with the height carried over. */
export async function saveEditedDrawing(
	input: { model: unknown; room: RoomSnapshot; previous: Drawing | null },
	deps: DrawingDeps
): Promise<Drawing> {
	const room: RoomSnapshot = {
		...input.room,
		ceilingHeightCm: carriedHeight(input.previous, input.model)
	};
	return build(input.model, room, deps);
}

/** Answering the ceiling height: the drawing that is already saved, with the new height. */
export async function saveCeilingHeight(
	previous: Drawing,
	ceilingHeightCm: number | null,
	deps: DrawingDeps
): Promise<Drawing> {
	return build(previous.model, { ...previous.room, ceilingHeightCm }, deps);
}
