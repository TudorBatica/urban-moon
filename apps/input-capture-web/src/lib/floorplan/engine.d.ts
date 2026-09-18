/* Types for the framework-free floorplan engine (engine.js).
   RoomSnapshot and friends live in $lib/types — the app has exactly one
   copy of the shared contract; this file only re-exports them so engine
   consumers can import from a single place. */

import type { Provenance, RoomSegment, RoomSnapshot, RoomWall } from '$lib/types';
import type { ToolDef } from './tools';
import type { SeenStorage } from './seen';

export type { Provenance, RoomSegment, RoomSnapshot, RoomWall };

/** The engine's internal, opaque editing model — what getModel/setModel move. */
export interface FloorplanModel {
	walls: unknown[];
	/** a model saved by an earlier editor still carries it; setModel ignores it */
	ceilingHeightCm?: number | null;
}

export interface MountFloorplanOptions {
	/** Called after every render in which the model actually changed. */
	onChange?: (room: RoomSnapshot) => void;
	/** Asked for the help: the link at the end of the hint, or the ? key. Without it neither exists. */
	onHelp?: () => void;
	/** The tools the plate offers; the first is the resting one. */
	tools?: ToolDef[];
	/** Where the seen-once flags are kept; defaults to the browser's localStorage. */
	seenStorage?: SeenStorage | null;
	/** Also publish window.__room / window.__reset (automation only). */
	exposeGlobals?: boolean;
}

export interface FloorplanHandle {
	room(): RoomSnapshot;
	getModel(): FloorplanModel;
	setModel(m: FloorplanModel): void;
	reset(): void;
	isEmpty(): boolean;
	setHintState(state: string | null): void;
	setKeysEnabled(on: boolean): void;
	destroy(): void;
}

/** The editor's DOM template, injected into the root by mountFloorplan. */
export const TEMPLATE: string;

export function mountFloorplan(root: HTMLElement, opts?: MountFloorplanOptions): FloorplanHandle;
export default mountFloorplan;
