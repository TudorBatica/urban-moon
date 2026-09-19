/**
 * One editing session: the model, what the canvas is on, the gesture in flight
 * and everything that is true only while this editor is mounted. It is a plain
 * object, mutated in place and passed to the modules that draw and listen, so
 * two editors on one page share nothing.
 *
 * The view is not here: it is not part of the model and not undoable, so the
 * viewport owns it.
 */

import { landmarkKindOf } from '@urban-moon/domain-data';
import {
	DEFAULT_SILL,
	DEFAULT_WINDOW_W,
	Ids,
	type Model,
	type SegmentKind,
	type Selection
} from './model';
import type { IsFresh } from './openings';
import { createHistory, type History } from './history';
import {
	DRAWING_TOOLS,
	applyToolEvent,
	restingTool,
	toolById,
	type ToolDef,
	type ToolId
} from './tools';

/** What a tool makes, where it makes anything. */
export type ToolMakes = NonNullable<ToolDef['makes']>;
import type { DragState } from './dragState';

/** The tool of the landmark step, which places one kind of square. */
export const LANDMARK_TOOL = 'landmark';

export interface ToastState {
	text: string;
}

export interface ConfirmState {
	message: string;
	yesLabel: string;
	onYes: () => void;
	onNo: () => void;
}

/** The last numbers the client typed, offered again to the next piece of the kind. */
export interface Carried {
	windowWidth: number;
	sill: number;
}

export type EditorMode = 'plan' | 'landmarks';

export interface Session {
	ids: Ids;
	model: Model;
	history: History;
	selection: Selection;
	/**
	 * Which segId the last render saw in focus, so the next one can notice the
	 * single moment that matters for merging: the piece that was in focus a
	 * moment ago no longer is.
	 */
	lastSettledSegId: string | null;
	drag: DragState | null;
	toast: ToastState | null;
	confirm: ConfirmState | null;
	/** the step this mounting is for: the plan itself, or one kind of landmark on it */
	mode: EditorMode;
	landmarkKind: string | null;
	tools: ToolDef[];
	activeTool: ToolId;
	/** the kind a tool made a moment ago, for the hint */
	justMade: string | null;
	/** a tool that cannot be used yet was picked */
	refusedTool: boolean;
	/** an override the host set, e.g. while it saves */
	hintState: string | null;
	keysEnabled: boolean;
	zoomHintUntil: number;
	/** the hint speaks in touch words or in mouse words */
	touchWords: boolean;
	carried: Carried;
}

export interface SessionOptions {
	mode?: EditorMode;
	landmarkKind?: string | null;
	/** the tools the plate offers; the first is the resting one */
	tools?: ToolDef[] | null;
	touchWords: boolean;
}

/** The two tools of the landmark step: the resting one, and the square itself. */
export function landmarkTools(landmarkKind: string | null): ToolDef[] {
	const entry = landmarkKindOf(landmarkKind ?? '');
	return [
		DRAWING_TOOLS[0],
		{
			id: LANDMARK_TOOL,
			label: entry ? entry.label : '',
			key: '',
			gesture: 'tap',
			makes: LANDMARK_TOOL,
			needsWall: true
		}
	];
}

/**
 * The tool that is on the moment the screen opens. The landmark tool is armed
 * straight away: the client came here from the card that chose it.
 */
export function armedTool(mode: EditorMode, tools: readonly ToolDef[]): ToolId {
	return mode === 'landmarks' ? LANDMARK_TOOL : restingTool(tools);
}

export function createSession(opts: SessionOptions): Session {
	const mode: EditorMode = opts.mode === 'landmarks' ? 'landmarks' : 'plan';
	const landmarkKind = typeof opts.landmarkKind === 'string' ? opts.landmarkKind : null;
	const tools =
		opts.tools && opts.tools.length
			? opts.tools
			: mode === 'landmarks'
				? landmarkTools(landmarkKind)
				: DRAWING_TOOLS;
	return {
		ids: new Ids(),
		model: { walls: [], landmarks: [] },
		history: createHistory(),
		selection: null,
		lastSettledSegId: null,
		drag: null,
		toast: null,
		confirm: null,
		mode,
		landmarkKind,
		tools,
		activeTool: armedTool(mode, tools),
		justMade: null,
		refusedTool: false,
		hintState: null,
		keysEnabled: true,
		zoomHintUntil: 0,
		touchWords: opts.touchWords,
		carried: { windowWidth: DEFAULT_WINDOW_W, sill: DEFAULT_SILL }
	};
}

/* ----------------------------------------------------------------------
   The tools, as questions and answers about the session. tools.ts owns the
   rules; these are what the editor does about them.
   ---------------------------------------------------------------------- */

/** Whether the canvas holds a wall a window or a door could go on. */
export function hasAnyWall(s: Session): boolean {
	for (const w of s.model.walls) if (!w.isOpen) return true;
	return false;
}

/**
 * Picks a tool. Says whether anything happened, so a caller renders only when
 * it did.
 */
export function pickTool(s: Session, id: ToolId): boolean {
	const res = applyToolEvent(s.tools, s.activeTool, { type: 'pick', id }, { hasWall: hasAnyWall(s) });
	if (!res.handled) return false;
	s.activeTool = res.active;
	s.refusedTool = res.refused;
	s.justMade = null;
	/* Picking a tool ends the focus: the canvas is for making now. */
	if (!res.refused && res.active !== restingTool(s.tools)) s.selection = null;
	return true;
}

/** One use of the active tool is over: it either made something or it did not. */
export function toolUsed(s: Session, made: boolean, kindMade: string | null): void {
	const res = applyToolEvent(s.tools, s.activeTool, { type: 'use', made }, { hasWall: hasAnyWall(s) });
	s.activeTool = res.active;
	s.refusedTool = false;
	s.justMade = made ? kindMade : null;
}

/** What Escape does to the tool that is on. */
export function escapeTool(s: Session): void {
	const res = applyToolEvent(s.tools, s.activeTool, { type: 'escape' }, { hasWall: hasAnyWall(s) });
	s.activeTool = res.active;
	s.refusedTool = false;
}

export function activeToolDef(s: Session): ToolDef | null {
	return toolById(s.tools, s.activeTool);
}

export function toolMakes(s: Session): ToolMakes | null {
	const td = activeToolDef(s);
	return td && td.makes ? td.makes : null;
}

/** What the active tool makes, where that is a piece of a wall. */
export function strokeKind(s: Session): SegmentKind | null {
	const makes = toolMakes(s);
	return makes === 'wall' || makes === 'open' || makes === 'window' || makes === 'door' ? makes : null;
}

export function isMakingStroke(s: Session): boolean {
	const td = activeToolDef(s);
	return !!td && td.gesture === 'stroke';
}

export function isPlacingTap(s: Session): boolean {
	const td = activeToolDef(s);
	return !!td && td.gesture === 'tap';
}

/**
 * A piece is still being worked on — and so never merges, however eligible its
 * neighbour — while it is the focus or still carries its rough as-drawn length:
 * merging a same-kind neighbour the instant two strokes connect would destroy a
 * typed measurement and make the piece just drawn unselectable. Both are checked
 * separately, because this is also what makes a typed piece merge-eligible again
 * the moment the focus moves off it.
 */
export function segIsFresh(s: Session): IsFresh {
	return (seg) =>
		seg.length.source === 'drawn' ||
		!!(s.selection && 'segId' in s.selection && s.selection.segId === seg.id);
}
