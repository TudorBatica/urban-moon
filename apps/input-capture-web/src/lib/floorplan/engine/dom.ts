/**
 * The editor's own elements. The template goes into the mount root and every
 * lookup is scoped to it, so the ids resolve inside this instance's own subtree
 * rather than the document's and two editors can share a page. The window and
 * the document come from the root itself for the same reason.
 */

import { TEMPLATE } from './template';

export interface Dom {
	root: HTMLElement;
	doc: Document;
	win: Window & typeof globalThis;
	app: HTMLElement;
	stage: HTMLElement;
	svg: SVGSVGElement;
	ctrlLayer: HTMLElement;
	toolPlate: HTMLElement;
	hint: HTMLElement;
	histPlate: HTMLElement;
	viewPlate: HTMLElement;
	toast: HTMLElement;
	toastText: HTMLElement;
	toastDismiss: HTMLElement;
	confirmDialog: HTMLElement;
	confirmDialogText: HTMLElement;
	confirmYes: HTMLElement;
	confirmNo: HTMLElement;
}

/** The window the root lives in: every editor's timers and listeners are its own. */
export function viewOf(root: HTMLElement): Window & typeof globalThis {
	const win = (root.ownerDocument || document).defaultView;
	if (!win) throw new Error('mountFloorplan: the root element is not in a window');
	return win;
}

function htmlById(root: HTMLElement, win: Window & typeof globalThis, id: string): HTMLElement {
	const node = root.querySelector('#' + id);
	if (!(node instanceof win.HTMLElement)) throw new Error('mountFloorplan: no #' + id + ' in the template');
	return node;
}

function svgById(root: HTMLElement, win: Window & typeof globalThis, id: string): SVGSVGElement {
	const node = root.querySelector('#' + id);
	if (!(node instanceof win.SVGSVGElement)) throw new Error('mountFloorplan: no #' + id + ' in the template');
	return node;
}

export function bindDom(root: HTMLElement, mode: 'plan' | 'landmarks'): Dom {
	const win = viewOf(root);
	const doc = root.ownerDocument || document;
	root.classList.add('fp');
	if (mode === 'landmarks') root.classList.add('fp-placing');
	root.innerHTML = TEMPLATE;
	return {
		root,
		doc,
		win,
		app: htmlById(root, win, 'app'),
		stage: htmlById(root, win, 'stage'),
		svg: svgById(root, win, 'roomSvg'),
		ctrlLayer: htmlById(root, win, 'ctrlLayer'),
		toolPlate: htmlById(root, win, 'toolPlate'),
		hint: htmlById(root, win, 'hintLine'),
		histPlate: htmlById(root, win, 'histPlate'),
		viewPlate: htmlById(root, win, 'viewPlate'),
		toast: htmlById(root, win, 'toastEl'),
		toastText: htmlById(root, win, 'toastText'),
		toastDismiss: htmlById(root, win, 'toastDismiss'),
		confirmDialog: htmlById(root, win, 'confirmDialog'),
		confirmDialogText: htmlById(root, win, 'confirmDialogText'),
		confirmYes: htmlById(root, win, 'confirmYesBtn'),
		confirmNo: htmlById(root, win, 'confirmNoBtn')
	};
}

/** The mount root as it was handed over: empty, and carrying none of our classes. */
export function unbindDom(dom: Dom): void {
	dom.root.innerHTML = '';
	dom.root.classList.remove('fp');
	dom.root.classList.remove('fp-placing');
}

/**
 * The nearest element matching `selector` at or above an event's target. The
 * target may be an SVG element (the plan's own hit rects) or outside this
 * window's element tree altogether, so the check is against the root's own view.
 */
export function closestOf(
	win: Window & typeof globalThis,
	target: EventTarget | null,
	selector: string
): Element | null {
	return target instanceof win.Element ? target.closest(selector) : null;
}
