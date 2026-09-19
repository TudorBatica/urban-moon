/**
 * What one render is of: the plan with its numbers and whatever the live gesture
 * adds, and the one line the hint says. Both are a read of the session as it
 * stands — nothing here changes anything.
 */

import { allDims, liveDim } from './dims';
import { hintFor, type Hint, type HintInput } from './hint';
import { landmarkShows } from './landmarkEdits';
import { findSegAnywhere, selectedSegId } from './model';
import { openingAtFreeEnd } from './openings';
import type { Scene } from './planMarkup';
import type { Session } from './session';
import { toolById } from './tools';
import type { Box } from './view';

/** The plan, the numbers on it and whatever the live gesture adds, as one scene. */
export function planScene(s: Session, visibleBox: Box, scale: number): Scene {
	const toolNow = toolById(s.tools, s.activeTool);
	return {
		model: s.model,
		selection: s.selection,
		drag: s.drag,
		mode: s.mode,
		toolGesture: toolNow ? toolNow.gesture : null,
		scale,
		visibleBox,
		dims: allDims(s.model, s.selection, s.mode, scale, visibleBox),
		liveDim: liveDim(s.model, s.drag, scale)
	};
}

/** The gesture in flight, as far as the hint is concerned. */
function hintDrag(s: Session): HintInput['drag'] {
	const drag = s.drag;
	if (!drag || !drag.committed) return null;
	if (drag.kind === 'draw') return { kind: 'draw' };
	if (drag.kind === 'opening') {
		const sliding = findSegAnywhere(s.model, drag.liveSegId || drag.segId);
		return {
			kind: 'opening',
			slidingKind: sliding ? sliding.seg.kind : null,
			pastFreeEnd: !!drag.pastFreeEnd
		};
	}
	return null;
}

export function hintNow(s: Session): Hint {
	const f = findSegAnywhere(s.model, selectedSegId(s.selection));
	return hintFor({
		hintState: s.hintState,
		refusedTool: s.refusedTool,
		drag: hintDrag(s),
		zoomHintOn: Date.now() < s.zoomHintUntil,
		mode: s.mode,
		tools: s.tools,
		activeTool: s.activeTool,
		landmarkKind: s.landmarkKind,
		landmarkFocused: !!(s.selection && 'landmarkId' in s.selection),
		anyLandmarkShown: s.model.landmarks.some((m) => landmarkShows(s.model, m)),
		focus: f ? { kind: f.seg.kind, atFreeEnd: openingAtFreeEnd(s.model, f.wall, f.seg) } : null,
		justMade: s.justMade,
		hasWalls: s.model.walls.length > 0,
		touchWords: s.touchWords
	});
}
