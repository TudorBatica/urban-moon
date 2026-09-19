/**
 * The one grey line under the tool plate, saying the one next thing. `state`
 * names what the line is about — the editor puts it on the element as
 * `data-state` — and `text` is that line in the words of whatever the client
 * last touched the screen with.
 */

import { RO, hintOverrideText } from './copy';
import { toolById, type ToolDef, type ToolId } from './tools';
import type { SegmentKind } from './model';

/** The gesture in flight, as far as the line is concerned. */
export type HintDrag =
	| { kind: 'draw' }
	| { kind: 'opening'; slidingKind: SegmentKind | null; pastFreeEnd: boolean }
	| null;

export interface HintInput {
	/** an override the host set, e.g. while it saves */
	hintState: string | null;
	refusedTool: boolean;
	drag: HintDrag;
	/** the zoom line is up: the first zoom in this browser, for four seconds */
	zoomHintOn: boolean;
	mode: 'plan' | 'landmarks';
	tools: readonly ToolDef[];
	activeTool: ToolId;
	landmarkKind: string | null;
	/** the canvas is on a landmark */
	landmarkFocused: boolean;
	/** at least one landmark is drawn right now */
	anyLandmarkShown: boolean;
	/** the piece the canvas is on, and whether it sits at a free end of its wall */
	focus: { kind: SegmentKind; atFreeEnd: boolean } | null;
	/** what a tool made a moment ago */
	justMade: string | null;
	hasWalls: boolean;
	touchWords: boolean;
}

export interface Hint {
	state: string;
	text: string;
}

const BY_TOOL: Record<string, ((touch: boolean) => string) | undefined> = {
	wall: RO.hint.wallOn,
	open: RO.hint.openOn,
	window: RO.hint.windowOn,
	door: RO.hint.doorOn
};

function subjectOf(kind: SegmentKind | null): string {
	return kind === 'door' ? RO.doorSubject : RO.windowSubject;
}

export function hintFor(input: HintInput): Hint {
	const touch = input.touchWords;
	if (input.hintState) {
		const override = hintOverrideText(input.hintState, touch);
		return { state: input.hintState, text: override === null ? '' : override };
	}
	if (input.refusedTool) return { state: 'no-wall', text: RO.hint.noWall(touch) };
	if (input.drag && input.drag.kind === 'draw') {
		return { state: 'drawing', text: RO.hint.drawing(touch) };
	}
	if (input.drag && input.drag.kind === 'opening') {
		const subject = subjectOf(input.drag.slidingKind);
		return input.drag.pastFreeEnd
			? { state: 'opening-past-end', text: RO.slidesPastEnd(subject) }
			: { state: 'opening-slides', text: RO.slidesOnWall(subject) };
	}
	if (input.zoomHintOn) return { state: 'zoom', text: RO.hint.zoom(touch) };
	const tool = toolById(input.tools, input.activeTool);
	if (input.mode === 'landmarks') {
		if (tool && tool.makes === 'landmark') {
			return { state: 'landmark-on', text: RO.hint.landmarkOn(touch, input.landmarkKind || '') };
		}
		if (input.landmarkFocused) return { state: 'landmark-focus', text: RO.hint.landmarkFocus() };
		// With the tool down and nothing on the canvas there is nothing to say: a
		// line pointing at squares would point at none.
		if (input.anyLandmarkShown) return { state: 'landmark-idle', text: RO.hint.landmarkIdle(touch) };
		return { state: 'idle', text: '' };
	}
	if (tool && tool.gesture !== 'none') {
		const line = tool.makes ? BY_TOOL[tool.makes] : undefined;
		if (line) return { state: tool.id + '-on', text: line(touch) };
	}
	const focus = input.focus;
	if (focus) {
		// An opening that ended up past a free end IS the end of the run now, so
		// what to do next is that a wall drawn from its far jamb joins it.
		if ((focus.kind === 'window' || focus.kind === 'door') && focus.atFreeEnd) {
			return { state: 'opening-past-end', text: RO.slidesPastEnd(subjectOf(focus.kind)) };
		}
		if (focus.kind === 'window') return { state: 'window-focus', text: RO.hint.windowFocus(touch) };
		if (focus.kind === 'door') return { state: 'door-focus', text: RO.hint.doorFocus(touch) };
		if (focus.kind === 'open') return { state: 'open-focus', text: RO.hint.openFocus(touch) };
		if (input.justMade === 'wall') return { state: 'wall-made', text: RO.hint.wallMade(touch) };
		return { state: 'wall-focus', text: RO.hint.wallFocus(touch) };
	}
	if (!input.hasWalls) return { state: 'empty', text: RO.hint.empty(touch) };
	return { state: 'idle', text: '' };
}
