import { describe, expect, it } from 'vitest';
import {
	DRAWING_TOOLS,
	applyToolEvent,
	restingTool,
	toolById,
	toolForKey,
	type ToolContext,
	type ToolEvent,
	type ToolId
} from './tools';

const drawn: ToolContext = { hasWall: true };
const empty: ToolContext = { hasWall: false };

function apply(active: ToolId, event: ToolEvent, ctx: ToolContext = drawn) {
	return applyToolEvent(DRAWING_TOOLS, active, event, ctx);
}

const making: ToolId[] = ['wall', 'open', 'window', 'door'];

describe('the list of tools', () => {
	it('rests on Selectează and offers the four that make something', () => {
		expect(restingTool(DRAWING_TOOLS)).toBe('select');
		expect(DRAWING_TOOLS.map((t) => t.id)).toEqual(['select', 'wall', 'open', 'window', 'door']);
		expect(DRAWING_TOOLS.map((t) => t.key)).toEqual(['v', 'p', 'l', 'f', 'u']);
	});

	it('draws with a drag and places with a tap', () => {
		expect(toolById(DRAWING_TOOLS, 'wall')?.gesture).toBe('stroke');
		expect(toolById(DRAWING_TOOLS, 'open')?.gesture).toBe('stroke');
		expect(toolById(DRAWING_TOOLS, 'window')?.gesture).toBe('tap');
		expect(toolById(DRAWING_TOOLS, 'door')?.gesture).toBe('tap');
	});

	it('finds a tool by its key, whatever the case', () => {
		expect(toolForKey(DRAWING_TOOLS, 'P')?.id).toBe('wall');
		expect(toolForKey(DRAWING_TOOLS, 'u')?.id).toBe('door');
		expect(toolForKey(DRAWING_TOOLS, 'q')).toBeNull();
	});
});

describe('one use, then back to Selectează', () => {
	for (const id of making) {
		it(`${id} turns itself off the moment it has made one thing`, () => {
			const on = apply('select', { type: 'pick', id });
			expect(on.active).toBe(id);
			expect(on.refused).toBe(false);
			expect(apply(id, { type: 'use', made: true }).active).toBe('select');
		});

		it(`${id} stays on after a use that made nothing`, () => {
			const after = apply(id, { type: 'use', made: false });
			expect(after.active).toBe(id);
			expect(after.handled).toBe(true);
		});
	}

	it('a use of the resting tool changes nothing', () => {
		expect(apply('select', { type: 'use', made: true })).toEqual({
			active: 'select',
			handled: false,
			refused: false
		});
	});
});

describe('turning a tool off', () => {
	it('tapping the tool that is on turns it off', () => {
		expect(apply('wall', { type: 'pick', id: 'wall' }).active).toBe('select');
		expect(apply('door', { type: 'key', key: 'u' }).active).toBe('select');
	});

	it('tapping Selectează turns it off', () => {
		expect(apply('window', { type: 'pick', id: 'select' }).active).toBe('select');
	});

	it('Escape turns it off', () => {
		expect(apply('open', { type: 'escape' })).toEqual({
			active: 'select',
			handled: true,
			refused: false
		});
		expect(apply('select', { type: 'escape' }).handled).toBe(false);
	});

	it('picking another tool swaps them outright', () => {
		expect(apply('wall', { type: 'pick', id: 'open' }).active).toBe('open');
	});
});

describe('an empty canvas', () => {
	it('refuses Fereastră and Ușă, and says nothing turned on', () => {
		for (const id of ['window', 'door'] as ToolId[]) {
			const res = apply('select', { type: 'pick', id }, empty);
			expect(res).toEqual({ active: 'select', handled: true, refused: true });
		}
	});

	it('refuses them by key too', () => {
		expect(apply('select', { type: 'key', key: 'f' }, empty).refused).toBe(true);
	});

	it('still lets Perete and Fără perete on', () => {
		expect(apply('select', { type: 'pick', id: 'wall' }, empty).active).toBe('wall');
		expect(apply('select', { type: 'pick', id: 'open' }, empty).active).toBe('open');
	});

	it('does not turn the tool on the client already has off', () => {
		expect(apply('wall', { type: 'pick', id: 'window' }, empty).active).toBe('wall');
	});

	it('still turns Fereastră and Ușă off once the last wall is gone', () => {
		for (const id of ['window', 'door'] as ToolId[]) {
			expect(apply(id, { type: 'pick', id }, empty)).toEqual({
				active: 'select',
				handled: true,
				refused: false
			});
		}
		expect(apply('window', { type: 'key', key: 'f' }, empty).active).toBe('select');
		expect(apply('door', { type: 'escape' }, empty).active).toBe('select');
		expect(apply('window', { type: 'pick', id: 'select' }, empty).active).toBe('select');
	});
});

describe('events this machine does not know', () => {
	it('leaves an unknown tool and an unknown key alone', () => {
		expect(apply('wall', { type: 'pick', id: 'landmark' })).toEqual({
			active: 'wall',
			handled: false,
			refused: false
		});
		expect(apply('wall', { type: 'key', key: 'z' }).handled).toBe(false);
	});
});

describe('another list of tools', () => {
	const marks = [
		{ id: 'select', label: 'Selectează', key: 'v', gesture: 'none' as const },
		{ id: 'gaz', label: 'Gaz', key: 'g', gesture: 'tap' as const, needsWall: true }
	];

	it('rests on its own first tool and follows the same rules', () => {
		expect(restingTool(marks)).toBe('select');
		expect(applyToolEvent(marks, 'select', { type: 'pick', id: 'gaz' }, drawn).active).toBe('gaz');
		expect(applyToolEvent(marks, 'gaz', { type: 'use', made: true }, drawn).active).toBe('select');
		expect(applyToolEvent(marks, 'select', { type: 'pick', id: 'wall' }, drawn).handled).toBe(false);
	});
});
