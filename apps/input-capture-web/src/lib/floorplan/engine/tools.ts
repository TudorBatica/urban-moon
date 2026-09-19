/* Which tool is on, and what turns it off again. Pure: the engine hands in
   what happened and what the canvas holds, and gets back the tool that is on
   now plus anything the hint has to say. The list of tools is data, so a later
   step can mount the engine with a different one. */

export type ToolId = string;

/** How a tool makes its thing: one drag end to end, one tap on a wall, or not at all. */
export type ToolGesture = 'none' | 'stroke' | 'tap';

export interface ToolDef {
	id: ToolId;
	label: string;
	/** the single key that picks it on a keyboard */
	key: string;
	gesture: ToolGesture;
	/** what the tool makes, for the engine to act on */
	makes?: 'wall' | 'open' | 'window' | 'door' | 'landmark';
	/** it has nothing to work on until there is a wall */
	needsWall?: boolean;
}

/** The five tools of the drawing editor, resting tool first. */
export const DRAWING_TOOLS: ToolDef[] = [
	{ id: 'select', label: 'Selectează', key: 'v', gesture: 'none' },
	{ id: 'wall', label: 'Perete', key: 'p', gesture: 'stroke', makes: 'wall' },
	{ id: 'open', label: 'Fără perete', key: 'l', gesture: 'stroke', makes: 'open' },
	{ id: 'window', label: 'Fereastră', key: 'f', gesture: 'tap', makes: 'window', needsWall: true },
	{ id: 'door', label: 'Ușă', key: 'u', gesture: 'tap', makes: 'door', needsWall: true }
];

export type ToolEvent =
	| { type: 'pick'; id: ToolId }
	| { type: 'key'; key: string }
	| { type: 'escape' }
	/** the active tool was used: it either made its thing or it made nothing */
	| { type: 'use'; made: boolean };

export interface ToolContext {
	/** whether the canvas has a wall a window or a door could go on */
	hasWall: boolean;
}

export interface ToolResult {
	/** the tool that is on now */
	active: ToolId;
	/** the event was one this machine knows */
	handled: boolean;
	/** the tool cannot be used yet: say what to do first */
	refused: boolean;
}

/** The resting tool: the first in the list. */
export function restingTool(tools: readonly ToolDef[]): ToolId {
	return tools[0].id;
}

export function toolById(tools: readonly ToolDef[], id: ToolId): ToolDef | null {
	return tools.find((t) => t.id === id) ?? null;
}

/** A tool with no key of its own is reachable by pointer only: no key picks it. */
export function toolForKey(tools: readonly ToolDef[], key: string): ToolDef | null {
	const k = key.toLowerCase();
	if (k === '') return null;
	return tools.find((t) => t.key === k) ?? null;
}

function pick(tools: readonly ToolDef[], active: ToolId, id: ToolId, ctx: ToolContext): ToolResult {
	const resting = restingTool(tools);
	const tool = toolById(tools, id);
	if (!tool) return { active, handled: false, refused: false };
	if (tool.gesture === 'none') return { active: resting, handled: true, refused: false };
	// Picking the tool that is already on turns it off, the same as Escape —
	// before any refusal, so a tool left on when its last wall goes can still
	// be put down.
	if (active === id) return { active: resting, handled: true, refused: false };
	if (tool.needsWall && !ctx.hasWall) return { active, handled: true, refused: true };
	return { active: id, handled: true, refused: false };
}

/** What a tool event does to the tool that is on. */
export function applyToolEvent(
	tools: readonly ToolDef[],
	active: ToolId,
	event: ToolEvent,
	ctx: ToolContext
): ToolResult {
	const resting = restingTool(tools);
	switch (event.type) {
		case 'pick':
			return pick(tools, active, event.id, ctx);
		case 'key': {
			const tool = toolForKey(tools, event.key);
			if (!tool) return { active, handled: false, refused: false };
			return pick(tools, active, tool.id, ctx);
		}
		case 'escape':
			return { active: resting, handled: active !== resting, refused: false };
		case 'use': {
			if (active === resting) return { active, handled: false, refused: false };
			// One use, then back to the resting tool; a use that made nothing keeps it on.
			return { active: event.made ? resting : active, handled: true, refused: false };
		}
	}
}
