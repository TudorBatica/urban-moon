/**
 * A touch snaps an imprecise press to the nearest interactive element within a
 * small radius, retargeting the event but not its coordinates. Caught in the
 * capture phase: when the real coordinates fall outside that element's real box,
 * this was never a press on it, so it goes to the canvas underneath at its real
 * coordinates.
 */

import { closestOf } from './dom';

interface Press {
	x: number;
	y: number;
}

/** A chip's real box includes its own invisible halo: a press there is a genuine press on it. */
const CHIP_HALO_PX = 7;

function touchPress(e: TouchEvent): Press {
	const list = e.touches.length ? e.touches : e.changedTouches;
	const first = list.item(0);
	return first ? { x: first.clientX, y: first.clientY } : { x: NaN, y: NaN };
}

/**
 * The control an event was retargeted onto and never really pressed, or null
 * where the press is genuine.
 */
export function realBoxMisses(
	win: Window & typeof globalThis,
	target: EventTarget | null,
	press: Press
): Element | null {
	const el = closestOf(win, target, '.fp-plate, .fp-chip, .fp-hint');
	if (!el) return null;
	/* A rect's own bottom and right are the first row and column beyond it, so a
	   press exactly at that edge is already past the box. */
	const rb = el.getBoundingClientRect();
	const pad = el.classList.contains('fp-chip') ? CHIP_HALO_PX : 0;
	const inside =
		press.x >= rb.left - pad && press.x < rb.right + pad && press.y >= rb.top - pad && press.y < rb.bottom + pad;
	return inside ? null : el;
}

/**
 * Guards the whole subtree from the capture phase, so each guard runs before the
 * element's own listener. A press that missed goes to the canvas through
 * `onMissedPress`.
 */
export function installRetarget(
	root: HTMLElement,
	win: Window & typeof globalThis,
	onMissedPress: (e: PointerEvent) => void
): () => void {
	const onTouchStart = (e: TouchEvent): void => {
		if (!realBoxMisses(win, e.target, touchPress(e))) return;
		/* Whether a movement may become a native scroll is decided from the
		   originally hit-tested element's own CSS, before any of this runs, so only
		   preventDefault on the touch event itself stops it. */
		e.preventDefault();
	};
	const onPointerDown = (e: PointerEvent): void => {
		if (!realBoxMisses(win, e.target, { x: e.clientX, y: e.clientY })) return;
		e.stopImmediatePropagation();
		onMissedPress(e);
	};
	const onClick = (e: MouseEvent): void => {
		if (!realBoxMisses(win, e.target, { x: e.clientX, y: e.clientY })) return;
		e.stopImmediatePropagation();
		e.preventDefault();
	};
	root.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
	root.addEventListener('pointerdown', onPointerDown, true);
	root.addEventListener('click', onClick, true);
	return () => {
		root.removeEventListener('touchstart', onTouchStart, { capture: true });
		root.removeEventListener('pointerdown', onPointerDown, true);
		root.removeEventListener('click', onClick, true);
	};
}
