/**
 * The fields: the numbers on the drawing and the ones on the plate of the piece
 * in focus. Each is an ordinary positioned element over the SVG, never inside
 * it, so nothing carrying text or a real input inherits the zoom.
 *
 * A field commits on Enter, on blur and on a press anywhere else; Escape puts
 * the true value back. Focus without a keystroke is not a commit.
 */

import { RO } from './copy';
import { parseLengthInput } from './parseLength';
import type { LengthSource } from './model';

/** Where an element built here ends up: the caller measures and places it. */
export type Place = (el: HTMLElement) => void;

export interface FieldDeps {
	/**
	 * A number that reads like metres is asked about before it is taken. The
	 * confirm is the caller's, so this module never renders.
	 */
	confirm: (message: string, yesLabel: string, onYes: () => void) => void;
}

interface FieldState {
	committed: boolean;
	edited: boolean;
	before: string | null;
	commit: () => boolean;
}

/**
 * A field's own state, off the element rather than on it: the DOM is rebuilt on
 * every render, and an input that has gone carries nothing with it.
 */
const FIELDS = new WeakMap<HTMLInputElement, FieldState>();

/** A press on a chip is the chip's, never the canvas's underneath. */
export function stopChipPointer(node: HTMLElement): void {
	for (const evt of ['pointerdown', 'mousedown', 'click']) {
		node.addEventListener(evt, (e: Event) => e.stopPropagation());
	}
}

/**
 * Whole-cm parsing with the metres-shorthand trap. Returns whether the press
 * that asked may go on: a field waiting on the metres question stops it.
 */
export function bindLengthField(
	inputEl: HTMLInputElement,
	onCommit: (cm: number) => void,
	label: string,
	deps: FieldDeps
): void {
	const state: FieldState = {
		committed: false,
		edited: false,
		before: null,
		commit: () => tryCommit()
	};
	function tryCommit(): boolean {
		if (state.committed) return true;
		state.committed = true;
		if (!state.edited) return true;
		const parsed = parseLengthInput(inputEl.value);
		if (!parsed.ok) return true;
		if (parsed.needsConfirm) {
			const msg = RO.metresQuestion(parsed.raw, label, parsed.cmIfMetres);
			deps.confirm(msg, RO.metresYes(parsed.cmIfMetres), () => onCommit(parsed.cmIfMetres));
			return false;
		}
		onCommit(parsed.cm);
		return true;
	}
	FIELDS.set(inputEl, state);
	inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			tryCommit();
			inputEl.blur();
		} else if (e.key === 'Escape') {
			/* stopPropagation matters even though nothing on the window listens for
			   Escape: editing a number is never a reason for the piece's own canvas
			   focus to vanish out from under it. */
			e.preventDefault();
			e.stopPropagation();
			if (state.before !== null) inputEl.value = state.before;
			state.committed = true;
			inputEl.blur();
		}
	});
	inputEl.addEventListener('blur', () => {
		tryCommit();
	});
	inputEl.addEventListener('focus', () => {
		state.committed = false;
		state.edited = false;
		state.before = inputEl.value;
		inputEl.select();
	});
	inputEl.addEventListener('input', () => {
		state.edited = true;
		state.committed = false;
	});
}

/**
 * Commits whatever field is open. Says whether the press that asked may go on:
 * a field waiting on the metres question holds it back.
 */
export function commitActiveField(doc: Document, win: Window & typeof globalThis): boolean {
	const active = doc.activeElement;
	if (!(active instanceof win.HTMLInputElement)) return true;
	const state = FIELDS.get(active);
	return state ? state.commit() : true;
}

export interface ChipOptions {
	testid: string;
	value: number;
	source: LengthSource;
	label: string;
	/** the number belongs to the piece in focus: framed in ink */
	focused: boolean;
	onCommit: (cm: number) => void;
}

/**
 * A number on the drawing: a white chip with a hairline. Typed is ink, drawn or
 * prefilled is grey italic. Tapping it edits it in place — the chip is the
 * field, so the keyboard never opens on its own.
 */
export function buildChip(doc: Document, opts: ChipOptions, place: Place, deps: FieldDeps): HTMLInputElement {
	const input = doc.createElement('input');
	input.type = 'text';
	input.inputMode = 'decimal';
	input.setAttribute('data-testid', opts.testid);
	input.value = String(opts.value);
	input.className = opts.source === 'typed' ? '' : 'fp-derived';
	const chip = doc.createElement('div');
	chip.className = 'fp-chip' + (opts.focused ? ' on' : '');
	chip.appendChild(input);
	const unit = doc.createElement('span');
	unit.className = 'fp-unit';
	unit.textContent = 'cm';
	chip.appendChild(unit);
	bindLengthField(input, opts.onCommit, opts.label, deps);
	stopChipPointer(chip);
	/* A press usually lands on the chip's padding or its invisible halo, not on
	   the digits themselves — left to the browser that resolves to "nothing
	   focusable here" and takes focus away again on release. So the press is taken
	   on the whole chip and focus put on the input. */
	chip.addEventListener('pointerdown', (e: PointerEvent) => {
		if (doc.activeElement === input) return; // already editing: let the browser place the caret
		e.preventDefault();
		input.focus();
		input.select();
	});
	place(chip);
	return input;
}

/**
 * A number the client cannot write here: a gap in the chain, or a wall's own
 * length on a step that does not change the plan. A length the client typed is
 * still ink: read-only says who may change it, not who said it.
 */
export function buildGapChip(
	doc: Document,
	opts: { testid: string; value: number; source: LengthSource },
	place: Place
): HTMLElement {
	const chip = doc.createElement('div');
	chip.className = 'fp-chip fp-read';
	chip.setAttribute('data-testid', opts.testid);
	const num = doc.createElement('span');
	num.className = 'fp-gapnum' + (opts.source === 'typed' ? '' : ' fp-derived');
	num.textContent = String(opts.value);
	chip.appendChild(num);
	const unit = doc.createElement('span');
	unit.className = 'fp-unit';
	unit.textContent = 'cm';
	chip.appendChild(unit);
	place(chip);
	return chip;
}

/** Read-only: the live length riding the pointer has no piece to attach a field to. */
export function addLabel(doc: Document, text: string, testid: string | null, place: Place): void {
	const div = doc.createElement('div');
	div.className = 'fp-live';
	if (testid) div.setAttribute('data-testid', testid);
	div.textContent = text;
	place(div);
}

/** A field on the plate of the piece in focus: a label, the number, and cm. */
export function plateField(
	doc: Document,
	row: HTMLElement,
	opts: { label: string; value: number; source: LengthSource; testid: string; fieldName: string },
	onCommit: (cm: number) => void,
	deps: FieldDeps
): HTMLInputElement {
	const lbl = doc.createElement('span');
	lbl.className = 'fp-fl';
	lbl.textContent = opts.label;
	const input = doc.createElement('input');
	input.type = 'text';
	input.inputMode = 'decimal';
	input.setAttribute('data-testid', opts.testid);
	input.setAttribute('aria-label', opts.label);
	input.className = 'fp-num' + (opts.source === 'typed' ? '' : ' fp-derived');
	input.value = String(opts.value);
	bindLengthField(input, onCommit, opts.fieldName, deps);
	const unit = doc.createElement('span');
	unit.className = 'fp-unit';
	unit.textContent = 'cm';
	row.appendChild(lbl);
	row.appendChild(input);
	row.appendChild(unit);
	return input;
}
