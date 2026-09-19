/**
 * The floating plates: the tools at the top of the canvas, undo and redo, the
 * view controls, the hint line and the confirm dialog. White, a
 * hairline, 44px rows; the active tool is filled ink. On a wide screen undo and
 * redo sit in the tool plate after a divider, on a phone in their own plate
 * bottom left.
 */

import { glyphSvg as glyph } from '../glyphs';
import { markColour } from '../marks';
import { RO } from './copy';
import type { Dom } from './dom';
import type { Hint } from './hint';
import { LANDMARK_TOOL, type ConfirmState, type Session } from './session';

export interface PlateButtonOptions {
	/** the tool is the one that is on: filled ink */
	on?: boolean;
	iconOnly?: boolean;
	/** the outline breathes until the tool has been used */
	breath?: boolean;
	pressed?: boolean | null;
	disabled?: boolean;
	/** the single key that picks it, for the tooltip a mouse opens */
	key?: string;
	/** the tool that places a mark has no glyph: a small square in the mark's colour */
	swatch?: string | null;
	onClick?: () => void;
}

export function plateButton(
	doc: Document,
	testid: string,
	label: string,
	glyphName: string | null,
	touchWords: boolean,
	opts: PlateButtonOptions = {}
): HTMLButtonElement {
	const btn = doc.createElement('button');
	btn.type = 'button';
	btn.className =
		'fp-tool' + (opts.on ? ' on' : '') + (opts.iconOnly ? ' fp-ico' : '') + (opts.breath ? ' fp-breath' : '');
	btn.setAttribute('data-testid', testid);
	if (opts.pressed != null) btn.setAttribute('aria-pressed', opts.pressed ? 'true' : 'false');
	if (opts.disabled) btn.disabled = true;
	/* The accessible name is the word on the button, so voice control and the eye
	   agree; the key goes in the tooltip, which only a mouse ever opens. */
	btn.setAttribute('aria-label', label);
	btn.title = opts.key && !touchWords ? label + ' (' + opts.key.toUpperCase() + ')' : label;
	if (opts.swatch) {
		btn.innerHTML =
			'<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
			'<rect x="4.5" y="4.5" width="11" height="11" rx="1" style="fill:' +
			opts.swatch +
			';stroke:none"></rect></svg>';
	} else if (glyphName) {
		btn.innerHTML = glyph(glyphName);
	}
	if (!opts.iconOnly) {
		const span = doc.createElement('span');
		span.textContent = label;
		btn.appendChild(span);
	}
	if (opts.onClick) btn.addEventListener('click', opts.onClick);
	return btn;
}

export function divider(doc: Document): HTMLElement {
	const d = doc.createElement('span');
	d.className = 'fp-sep';
	return d;
}

export interface PlatesContext {
	dom: Dom;
	session: Session;
	isNarrow: boolean;
	canUndo: boolean;
	canRedo: boolean;
	on: {
		pick: (id: string) => void;
		undo: () => void;
		redo: () => void;
		zoomIn: () => void;
		zoomOut: () => void;
		fit: () => void;
	};
}

function undoButtons(ctx: PlatesContext, into: HTMLElement): void {
	const doc = ctx.dom.doc;
	const touch = ctx.session.touchWords;
	into.appendChild(
		plateButton(doc, 'undo', RO.undo, 'undo', touch, {
			iconOnly: true,
			disabled: !ctx.canUndo,
			onClick: ctx.on.undo
		})
	);
	into.appendChild(
		plateButton(doc, 'redo', RO.redo, 'redo', touch, {
			iconOnly: true,
			disabled: !ctx.canRedo,
			onClick: ctx.on.redo
		})
	);
}

function renderToolPlate(ctx: PlatesContext): void {
	const { dom, session } = ctx;
	dom.toolPlate.innerHTML = '';
	const empty = session.model.walls.length === 0;
	session.tools.forEach((tool) => {
		const isMark = tool.id === LANDMARK_TOOL;
		const btn = plateButton(dom.doc, 'tool-' + tool.id, tool.label, tool.id, session.touchWords, {
			on: session.activeTool === tool.id,
			pressed: session.activeTool === tool.id,
			key: tool.key,
			swatch: isMark ? markColour(session.landmarkKind ?? '') : null,
			// The drawn outline breathes round Perete until it has been used.
			breath: empty && tool.makes === 'wall',
			onClick: () => ctx.on.pick(tool.id)
		});
		if (isMark && session.landmarkKind) btn.setAttribute('data-kind', session.landmarkKind);
		dom.toolPlate.appendChild(btn);
	});
	if (!ctx.isNarrow) {
		dom.toolPlate.appendChild(divider(dom.doc));
		undoButtons(ctx, dom.toolPlate);
	}
}

function renderCornerPlates(ctx: PlatesContext): void {
	const { dom, session } = ctx;
	dom.histPlate.innerHTML = '';
	dom.viewPlate.innerHTML = '';
	const narrow = ctx.isNarrow;
	dom.histPlate.classList.toggle('fp-off', !narrow);
	if (narrow) undoButtons(ctx, dom.histPlate);
	if (!narrow) {
		dom.viewPlate.appendChild(
			plateButton(dom.doc, 'view-zoom-in', RO.zoomIn, 'zoomIn', session.touchWords, {
				iconOnly: true,
				onClick: ctx.on.zoomIn
			})
		);
		dom.viewPlate.appendChild(
			plateButton(dom.doc, 'view-zoom-out', RO.zoomOut, 'zoomOut', session.touchWords, {
				iconOnly: true,
				onClick: ctx.on.zoomOut
			})
		);
	}
	dom.viewPlate.appendChild(
		plateButton(dom.doc, 'view-fit', RO.fit, 'fit', session.touchWords, {
			iconOnly: true,
			onClick: ctx.on.fit
		})
	);
}

/** The plates the view is fitted around: they are measured, so they go up first. */
export function renderPlates(ctx: PlatesContext): void {
	renderToolPlate(ctx);
	renderCornerPlates(ctx);
}

/**
 * One grey line under the tool plate saying the one next thing. `data-state`
 * names the state it is in.
 */
export function renderHint(dom: Dom, hint: Hint, hasHelp: boolean): void {
	const help = hasHelp
		? '<button type="button" class="fp-help" data-testid="hint-help">' + RO.help + '</button>'
		: '';
	dom.hint.setAttribute('data-state', hint.state);
	dom.hint.innerHTML = hint.text + (hint.text && help ? ' · ' : '') + help;
	dom.hint.classList.toggle('fp-off', !hint.text && !help);
}

export function renderConfirm(dom: Dom, confirm: ConfirmState | null): void {
	if (!confirm) {
		dom.confirmDialog.classList.add('fp-off');
		return;
	}
	dom.confirmDialog.classList.remove('fp-off');
	dom.confirmDialogText.textContent = confirm.message;
	dom.confirmYes.textContent = confirm.yesLabel;
}
