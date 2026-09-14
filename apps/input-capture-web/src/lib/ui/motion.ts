/* The motion rules (urban-moon-motion.html): 180 ms for touch feedback, 320 ms for state,
   560 ms for what appears or disappears; one exit curve. Everything is instant under
   prefers-reduced-motion. */

export const FAST = 180;
export const BASE = 320;
export const SLOW = 560;

function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
	const sy = (t: number) => ((ay * t + by) * t + cy) * t;
	const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
	return (x) => {
		if (x <= 0) return 0;
		if (x >= 1) return 1;
		let t = x;
		for (let i = 0; i < 8; i++) {
			const e = sx(t) - x;
			if (Math.abs(e) < 1e-5) break;
			const d = dx(t);
			if (Math.abs(d) < 1e-6) break;
			t -= e / d;
		}
		return sy(Math.min(1, Math.max(0, t)));
	};
}

/** cubic-bezier(.2,.7,.2,1) */
export const ease = bezier(0.2, 0.7, 0.2, 1);

export const reduced = (): boolean =>
	typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ms = (d: number): number => (reduced() ? 0 : d);

/** Moving between questions is vertical, like leafing through a long page:
 *  forward, the current question rises and fades and the next comes from below. */
export function pageIn(_node: Element, { dir = 1 }: { dir?: number } = {}) {
	return {
		delay: ms(120),
		duration: ms(BASE),
		easing: ease,
		css: (t: number, u: number) => `opacity:${t};transform:translateY(${u * 16 * dir}px)`
	};
}

export function pageOut(_node: Element, { dir = 1 }: { dir?: number } = {}) {
	return {
		duration: ms(BASE),
		easing: ease,
		css: (t: number, u: number) => `opacity:${t};transform:translateY(${-u * 12 * dir}px)`
	};
}

/** A digit rolls: up when the number grows, down when it shrinks. */
export function roll(_node: Element, { up = true, enter = true }: { up?: boolean; enter?: boolean } = {}) {
	const sign = (enter ? 1 : -1) * (up ? 1 : -1);
	return {
		duration: ms(BASE),
		easing: ease,
		css: (t: number, u: number) => `opacity:${t};transform:translateY(${sign * u * 100}%)`
	};
}

/** The photograph crossfades; it does not move. */
export function crossfade(_node: Element) {
	return { duration: ms(SLOW), easing: ease, css: (t: number) => `opacity:${t}` };
}
