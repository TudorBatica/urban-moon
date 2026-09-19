/**
 * The keyboard: which of the editor's few actions a key press is, and nothing
 * about carrying it out. `keyAction` is pure, so every key the editor answers to
 * is decided from a press and what the canvas holds, with no window in sight.
 */

import { toolForKey, type ToolDef, type ToolId } from './tools';

/** A key press, as much of it as the decision needs. */
export interface KeyPress {
	code: string;
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

export interface KeyContext {
	keysEnabled: boolean;
	/** the press landed in a field: the keys are that field's */
	typingInField: boolean;
	/** the press landed on a control: space is that control's own press */
	pressingControl: boolean;
	/** the host offers the help; without one there is none to ask for */
	hasHelp: boolean;
	hasSelection: boolean;
	/** the piece in focus is a door, the one thing rotating means anything to */
	focusedDoor: boolean;
	tools: readonly ToolDef[];
}

export type KeyAction =
	/** space arms the pan for as long as it is held */
	| { kind: 'space' }
	| { kind: 'spaceUp' }
	| { kind: 'undo' }
	| { kind: 'redo' }
	| { kind: 'escape' }
	| { kind: 'help' }
	| { kind: 'delete' }
	| { kind: 'zoom'; factor: number }
	| { kind: 'fit' }
	| { kind: 'rotate' }
	| { kind: 'pickTool'; id: ToolId };

const ZOOM_STEP = 1.25;

/**
 * Escape is the one action the page keeps: it means "stop what you are doing"
 * everywhere, and the editor taking it away from a host's own dialog would be a
 * key that goes missing.
 */
export function preventsDefault(action: KeyAction): boolean {
	return action.kind !== 'escape' && action.kind !== 'spaceUp';
}

export function keyAction(e: KeyPress, ctx: KeyContext): KeyAction | null {
	if (!ctx.keysEnabled) return null;
	if (e.code === 'Space') {
		/* Space on a focused control is that control's own press, and anywhere else
		   it would scroll the page rather than arm the pan. */
		if (ctx.typingInField || ctx.pressingControl) return null;
		return { kind: 'space' };
	}
	const accel = e.ctrlKey || e.metaKey;
	const lower = e.key.toLowerCase();
	if (accel && lower === 'z' && !e.shiftKey) return { kind: 'undo' };
	if (accel && (lower === 'y' || (lower === 'z' && e.shiftKey))) return { kind: 'redo' };
	if (accel || e.altKey) return null;
	if (e.key === 'Escape') return { kind: 'escape' };
	if (ctx.typingInField) return null;
	if (e.key === '?') return ctx.hasHelp ? { kind: 'help' } : null;
	if ((e.key === 'Delete' || e.key === 'Backspace') && ctx.hasSelection) return { kind: 'delete' };
	if (e.key === '+' || e.key === '=') return { kind: 'zoom', factor: ZOOM_STEP };
	if (e.key === '-' || e.key === '_') return { kind: 'zoom', factor: 1 / ZOOM_STEP };
	if (e.key === '0') return { kind: 'fit' };
	if (lower === 'r' && ctx.hasSelection && ctx.focusedDoor) return { kind: 'rotate' };
	const picked = toolForKey(ctx.tools, e.key);
	return picked ? { kind: 'pickTool', id: picked.id } : null;
}

export interface KeyDeps {
	/** what the canvas holds right now, read at the moment of the press */
	context: (e: KeyboardEvent) => KeyContext;
	apply: (action: KeyAction) => void;
}

export function installKeys(win: Window & typeof globalThis, deps: KeyDeps): () => void {
	const onKeyDown = (e: KeyboardEvent): void => {
		const action = keyAction(e, deps.context(e));
		if (!action) return;
		if (preventsDefault(action)) e.preventDefault();
		deps.apply(action);
	};
	const onKeyUp = (e: KeyboardEvent): void => {
		if (e.code === 'Space') deps.apply({ kind: 'spaceUp' });
	};
	/* A tab switch swallows the keyup, and the pan would stay armed. */
	const onBlur = (): void => deps.apply({ kind: 'spaceUp' });
	win.addEventListener('keyup', onKeyUp);
	win.addEventListener('blur', onBlur);
	win.addEventListener('keydown', onKeyDown);
	return () => {
		win.removeEventListener('keyup', onKeyUp);
		win.removeEventListener('blur', onBlur);
		win.removeEventListener('keydown', onKeyDown);
	};
}

/** Whether a press landed in a field, and so belongs to that field. */
export function typingInField(target: EventTarget | null, win: Window & typeof globalThis): boolean {
	if (!(target instanceof win.Element)) return false;
	return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

/** Whether a press landed on a control, whose own key handling comes first. */
export function pressingControl(target: EventTarget | null, win: Window & typeof globalThis): boolean {
	if (!(target instanceof win.Element)) return false;
	const tag = target.tagName;
	return tag === 'BUTTON' || tag === 'A' || tag === 'SELECT';
}
