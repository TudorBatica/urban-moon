/**
 * The floorplan editor, as a framework-free module: the one thing outside this
 * directory imports. `mountFloorplan(root, opts)` puts an editor in an element
 * and hands back the handle its host drives it with.
 */

import { createEditor } from './editor';
import type { Provenance, RoomSegment, RoomSnapshot, RoomWall } from '$lib/types';
import type { SeenStorage } from '../seen';
import type { EditorLandmark, Wall } from './model';
import type { ToolDef } from './tools';

export { TEMPLATE } from './template';
export type { Provenance, RoomSegment, RoomSnapshot, RoomWall };

/** The engine's own editing model — what getModel and setModel move. */
export interface FloorplanModel {
	walls: Wall[];
	/** absent on a model saved before landmarks existed: it has none */
	landmarks?: EditorLandmark[];
	/** a model saved by an earlier editor still carries it; setModel ignores it */
	ceilingHeightCm?: number | null;
}

export interface MountFloorplanOptions {
	/** Called after every render in which the model actually changed. */
	onChange?: (room: RoomSnapshot) => void;
	/** Asked for the help: the link at the end of the hint, or the ? key. Without it neither exists. */
	onHelp?: () => void;
	/**
	 * The step this mounting is for. `plan` draws and changes the plan;
	 * `landmarks` places one kind of landmark on a plan already drawn, leaving the
	 * walls and the openings drawn but untouchable.
	 */
	mode?: 'plan' | 'landmarks';
	/** in `landmarks` mode, the kind the tool places, armed at mount */
	landmarkKind?: string;
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

export function mountFloorplan(root: HTMLElement, opts?: MountFloorplanOptions): FloorplanHandle {
	return createEditor(root, opts);
}

export default mountFloorplan;
