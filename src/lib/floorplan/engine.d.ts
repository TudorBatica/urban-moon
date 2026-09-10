/* Types for the framework-free floorplan engine (engine.js).
   RoomSnapshot and friends live in $lib/types — the app has exactly one
   copy of the shared contract; this file only re-exports them so engine
   consumers can import from a single place. */

import type { Provenance, RoomSegment, RoomSnapshot, RoomWall } from '$lib/types';

export type { Provenance, RoomSegment, RoomSnapshot, RoomWall };

/** The engine's internal, opaque editing model — what getModel/setModel move. */
export interface FloorplanModel {
	ceilingHeightCm: number | null;
	walls: unknown[];
}

export interface MountFloorplanOptions {
	/** Called after every render in which the model actually changed. */
	onChange?: (room: RoomSnapshot) => void;
	/** Also publish window.__room / window.__reset (automation only). */
	exposeGlobals?: boolean;
}

export interface FloorplanHandle {
	room(): RoomSnapshot;
	getModel(): FloorplanModel;
	setModel(m: FloorplanModel): void;
	reset(): void;
	destroy(): void;
}

/** The prototype's DOM template, injected into the root by mountFloorplan. */
export const TEMPLATE: string;

export function mountFloorplan(root: HTMLElement, opts?: MountFloorplanOptions): FloorplanHandle;
export default mountFloorplan;
