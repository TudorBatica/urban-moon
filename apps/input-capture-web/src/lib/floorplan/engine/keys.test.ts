import { describe, expect, it } from 'vitest';
import { keyAction, preventsDefault, type KeyContext, type KeyPress } from './keys';
import { DRAWING_TOOLS } from './tools';

function press(key: string, over: Partial<KeyPress> = {}): KeyPress {
	return {
		code: key === ' ' ? 'Space' : 'Key' + key.toUpperCase(),
		key,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		...over
	};
}

function ctx(over: Partial<KeyContext> = {}): KeyContext {
	return {
		keysEnabled: true,
		typingInField: false,
		pressingControl: false,
		hasHelp: true,
		hasSelection: false,
		focusedDoor: false,
		tools: DRAWING_TOOLS,
		...over
	};
}

describe('keyAction', () => {
	it('answers to nothing at all while the keys are stood down', () => {
		for (const k of [' ', 'z', '0', 'p', 'Escape', '?']) {
			expect(keyAction(press(k), ctx({ keysEnabled: false }))).toBeNull();
		}
	});

	it('arms the pan on space, except on a field or a control', () => {
		expect(keyAction(press(' '), ctx())).toEqual({ kind: 'space' });
		expect(keyAction(press(' '), ctx({ typingInField: true }))).toBeNull();
		expect(keyAction(press(' '), ctx({ pressingControl: true }))).toBeNull();
	});

	it('undoes and redoes with either accelerator', () => {
		expect(keyAction(press('z', { ctrlKey: true }), ctx())).toEqual({ kind: 'undo' });
		expect(keyAction(press('Z', { metaKey: true }), ctx())).toEqual({ kind: 'undo' });
		expect(keyAction(press('z', { ctrlKey: true, shiftKey: true }), ctx())).toEqual({ kind: 'redo' });
		expect(keyAction(press('y', { metaKey: true }), ctx())).toEqual({ kind: 'redo' });
	});

	it('undoes even while a field is open, because the field never owns it', () => {
		expect(keyAction(press('z', { ctrlKey: true }), ctx({ typingInField: true }))).toEqual({ kind: 'undo' });
	});

	it('leaves every other modified key alone', () => {
		expect(keyAction(press('p', { ctrlKey: true }), ctx())).toBeNull();
		expect(keyAction(press('0', { altKey: true }), ctx())).toBeNull();
		expect(keyAction(press('0', { metaKey: true }), ctx())).toBeNull();
	});

	it('takes Escape whether or not a field is open', () => {
		expect(keyAction(press('Escape'), ctx())).toEqual({ kind: 'escape' });
		expect(keyAction(press('Escape'), ctx({ typingInField: true }))).toEqual({ kind: 'escape' });
	});

	it('gives every other key to a field that is open', () => {
		for (const k of ['?', 'Delete', '+', '0', 'p']) {
			expect(keyAction(press(k), ctx({ typingInField: true, hasSelection: true }))).toBeNull();
		}
	});

	it('asks for the help only where there is a host to show it', () => {
		expect(keyAction(press('?'), ctx())).toEqual({ kind: 'help' });
		expect(keyAction(press('?'), ctx({ hasHelp: false }))).toBeNull();
	});

	it('deletes only what is in focus', () => {
		expect(keyAction(press('Delete'), ctx({ hasSelection: true }))).toEqual({ kind: 'delete' });
		expect(keyAction(press('Backspace'), ctx({ hasSelection: true }))).toEqual({ kind: 'delete' });
		expect(keyAction(press('Delete'), ctx())).toBeNull();
	});

	it('zooms and fits', () => {
		expect(keyAction(press('+'), ctx())).toEqual({ kind: 'zoom', factor: 1.25 });
		expect(keyAction(press('='), ctx())).toEqual({ kind: 'zoom', factor: 1.25 });
		expect(keyAction(press('-'), ctx())).toEqual({ kind: 'zoom', factor: 1 / 1.25 });
		expect(keyAction(press('_'), ctx())).toEqual({ kind: 'zoom', factor: 1 / 1.25 });
		expect(keyAction(press('0'), ctx())).toEqual({ kind: 'fit' });
	});

	it('rotates only a door in focus, and otherwise lets r look for a tool', () => {
		expect(keyAction(press('r'), ctx({ hasSelection: true, focusedDoor: true }))).toEqual({ kind: 'rotate' });
		expect(keyAction(press('R'), ctx({ hasSelection: true, focusedDoor: true }))).toEqual({ kind: 'rotate' });
		expect(keyAction(press('r'), ctx({ hasSelection: true }))).toBeNull();
		expect(keyAction(press('r'), ctx())).toBeNull();
	});

	it('picks a tool by its own key', () => {
		expect(keyAction(press('p'), ctx())).toEqual({ kind: 'pickTool', id: 'wall' });
		expect(keyAction(press('v'), ctx())).toEqual({ kind: 'pickTool', id: 'select' });
		expect(keyAction(press('l'), ctx())).toEqual({ kind: 'pickTool', id: 'open' });
		expect(keyAction(press('f'), ctx())).toEqual({ kind: 'pickTool', id: 'window' });
		expect(keyAction(press('u'), ctx())).toEqual({ kind: 'pickTool', id: 'door' });
		expect(keyAction(press('q'), ctx())).toBeNull();
	});

	it('picks no tool where the plate has none for the key', () => {
		expect(keyAction(press('p'), ctx({ tools: [DRAWING_TOOLS[0]] }))).toBeNull();
	});
});

describe('preventsDefault', () => {
	it('leaves Escape to the page and takes the rest', () => {
		expect(preventsDefault({ kind: 'escape' })).toBe(false);
		expect(preventsDefault({ kind: 'spaceUp' })).toBe(false);
		for (const a of [
			{ kind: 'space' } as const,
			{ kind: 'undo' } as const,
			{ kind: 'redo' } as const,
			{ kind: 'help' } as const,
			{ kind: 'delete' } as const,
			{ kind: 'zoom', factor: 1.25 } as const,
			{ kind: 'fit' } as const,
			{ kind: 'rotate' } as const,
			{ kind: 'pickTool', id: 'wall' } as const
		]) {
			expect(preventsDefault(a)).toBe(true);
		}
	});
});
