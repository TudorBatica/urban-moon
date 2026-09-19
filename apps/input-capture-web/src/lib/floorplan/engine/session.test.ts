import { describe, expect, it } from 'vitest';
import {
	LANDMARK_TOOL,
	activeToolDef,
	createSession,
	hasAnyWall,
	isMakingStroke,
	isPlacingTap,
	pickTool,
	segIsFresh,
	strokeKind,
	toolMakes,
	toolUsed,
	type Session
} from './session';
import { makeWall, type Ids, type Segment } from './model';

function planSession(): Session {
	return createSession({ mode: 'plan', touchWords: false });
}
function landmarkSession(): Session {
	return createSession({ mode: 'landmarks', landmarkKind: 'boiler', touchWords: true });
}
function addWall(s: Session, kind: 'wall' | 'open'): void {
	const ids: Ids = s.ids;
	s.model.walls.push(makeWall(ids, { x: 0, y: 0 }, { x: 100, y: 0 }, 'drawn', kind));
}

describe('createSession', () => {
	it('opens the plan step on the resting tool, with the five drawing tools', () => {
		const s = planSession();
		expect(s.tools.map((t) => t.id)).toEqual(['select', 'wall', 'open', 'window', 'door']);
		expect(s.activeTool).toBe('select');
		expect(s.mode).toBe('plan');
		expect(s.model).toEqual({ walls: [], landmarks: [] });
		expect(s.carried).toEqual({ windowWidth: 60, sill: 90 });
		expect(s.touchWords).toBe(false);
	});

	it('opens the landmark step with two tools and the landmark one armed', () => {
		const s = landmarkSession();
		expect(s.tools.map((t) => t.id)).toEqual(['select', LANDMARK_TOOL]);
		expect(s.tools[1].label).toBe('Centrală');
		expect(s.activeTool).toBe(LANDMARK_TOOL);
		expect(isPlacingTap(s)).toBe(true);
		expect(toolMakes(s)).toBe(LANDMARK_TOOL);
		expect(strokeKind(s)).toBeNull();
	});

	it('takes the tools it is given', () => {
		const s = createSession({
			mode: 'plan',
			tools: [{ id: 'only', label: 'Doar', key: 'o', gesture: 'none' }],
			touchWords: false
		});
		expect(s.activeTool).toBe('only');
		expect(activeToolDef(s)?.label).toBe('Doar');
	});
});

describe('hasAnyWall', () => {
	it('counts a wall but not a Fără perete side', () => {
		const s = planSession();
		expect(hasAnyWall(s)).toBe(false);
		addWall(s, 'open');
		expect(hasAnyWall(s)).toBe(false);
		addWall(s, 'wall');
		expect(hasAnyWall(s)).toBe(true);
	});
});

describe('pickTool', () => {
	it('clears the focus when a making tool comes on', () => {
		const s = planSession();
		s.selection = { segId: 'seg1' };
		s.justMade = 'wall';
		expect(pickTool(s, 'wall')).toBe(true);
		expect(s.activeTool).toBe('wall');
		expect(s.selection).toBeNull();
		expect(s.justMade).toBeNull();
		expect(isMakingStroke(s)).toBe(true);
		expect(strokeKind(s)).toBe('wall');
	});

	it('keeps the focus on a refusal, and says what the line must explain', () => {
		const s = planSession();
		s.selection = { segId: 'seg1' };
		expect(pickTool(s, 'door')).toBe(true);
		expect(s.refusedTool).toBe(true);
		expect(s.activeTool).toBe('select');
		expect(s.selection).toEqual({ segId: 'seg1' });
	});

	it('keeps the focus when the resting tool comes on', () => {
		const s = planSession();
		s.selection = { segId: 'seg1' };
		pickTool(s, 'wall');
		s.selection = { segId: 'seg1' };
		pickTool(s, 'select');
		expect(s.activeTool).toBe('select');
		expect(s.selection).toEqual({ segId: 'seg1' });
	});

	it('does nothing for a tool that is not on the plate', () => {
		const s = planSession();
		expect(pickTool(s, 'nothing')).toBe(false);
		expect(s.activeTool).toBe('select');
	});
});

describe('toolUsed', () => {
	it('keeps a stroke tool on when it made nothing, and remembers nothing made', () => {
		const s = planSession();
		pickTool(s, 'wall');
		toolUsed(s, false, null);
		expect(s.activeTool).toBe('wall');
		expect(s.justMade).toBeNull();
	});

	it('puts a tapping tool down after it made its thing', () => {
		const s = planSession();
		addWall(s, 'wall');
		pickTool(s, 'door');
		expect(s.activeTool).toBe('door');
		toolUsed(s, true, 'door');
		expect(s.activeTool).toBe('select');
		expect(s.justMade).toBe('door');
	});
});

describe('segIsFresh', () => {
	const seg = (id: string, source: 'drawn' | 'typed'): Segment => ({
		id,
		kind: 'wall',
		length: { value: 100, source },
		offsetFromStart: 0,
		sill: null,
		hinge: null,
		hingeSource: null,
		swing: null,
		swingSource: null
	});

	it('holds a drawn piece and the piece in focus back from merging', () => {
		const s = planSession();
		s.selection = { segId: 'seg2' };
		const fresh = segIsFresh(s);
		expect(fresh(seg('seg1', 'drawn'))).toBe(true);
		expect(fresh(seg('seg2', 'typed'))).toBe(true);
		expect(fresh(seg('seg3', 'typed'))).toBe(false);
	});

	it('reads the focus as it is now, not as it was', () => {
		const s = planSession();
		const fresh = segIsFresh(s);
		expect(fresh(seg('seg3', 'typed'))).toBe(false);
		s.selection = { segId: 'seg3' };
		expect(fresh(seg('seg3', 'typed'))).toBe(true);
	});
});
