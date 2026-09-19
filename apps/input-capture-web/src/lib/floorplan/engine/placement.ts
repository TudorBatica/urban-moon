/**
 * Where a chip, a name or a plate actually lands. Everything readable or
 * typeable is centred on an anchor in the plan, which is only a starting point:
 * near the edge of a narrow stage the element would hang off screen with nothing
 * to tap, and on top of an obstacle it would cost the client whatever is under
 * it. Pure: boxes in stage pixels in, a centre out.
 */

/** A box in stage pixels, by its four edges. */
export interface Obstacle {
	l: number;
	t: number;
	r: number;
	b: number;
}

export interface Stage {
	width: number;
	height: number;
}

export interface PlaceInput {
	/** where the anchor puts the element's centre */
	pos: { x: number; y: number };
	w: number;
	h: number;
	stage: Stage;
	obstacles: readonly Obstacle[];
}

export interface Placement {
	x: number;
	y: number;
	/** what the element still overlaps: nothing, or the room genuinely has no clear spot */
	remaining: number;
}

/** How far past an obstacle's edge a push goes, so the two do not end up touching. */
const CLEAR_PX = 6;
/** How far from the stage's own edge the whole element must stay. */
const EDGE_PX = 4;
/**
 * Escaping one round's obstacles can reveal another on the far side, so the
 * rounds repeat a small fixed number of times; the stage's own edges make an
 * unbounded search unnecessary.
 */
const ROUNDS = 8;

export function placeClear(input: PlaceInput): Placement {
	const { pos, w, h, stage, obstacles } = input;
	const minX = w / 2 + EDGE_PX;
	const maxX = Math.max(minX, stage.width - w / 2 - EDGE_PX);
	const minY = h / 2 + EDGE_PX;
	const maxY = Math.max(minY, stage.height - h / 2 - EDGE_PX);
	let cx = Math.min(Math.max(pos.x, minX), maxX);
	let cy = Math.min(Math.max(pos.y, minY), maxY);

	const collidingWith = (x: number, y: number): Obstacle[] =>
		obstacles.filter((o) => x - w / 2 < o.r && x + w / 2 > o.l && y - h / 2 < o.b && y + h / 2 > o.t);

	for (let round = 0; round < ROUNDS; round++) {
		const colliding = collidingWith(cx, cy);
		if (!colliding.length) break;
		/* One push per axis and direction, each far enough to clear EVERYTHING
		   overlapping right now rather than only the first obstacle found: a push
		   that clears one can walk the element straight into the next. */
		let pushXOut = 0;
		let pushXIn = 0;
		let pushYOut = 0;
		let pushYIn = 0;
		colliding.forEach((o) => {
			pushXOut = Math.max(pushXOut, o.r - (cx - w / 2) + CLEAR_PX);
			pushXIn = Math.max(pushXIn, cx + w / 2 - o.l + CLEAR_PX);
			pushYOut = Math.max(pushYOut, o.b - (cy - h / 2) + CLEAR_PX);
			pushYIn = Math.max(pushYIn, cy + h / 2 - o.t + CLEAR_PX);
		});
		const options = [
			{ cx: Math.min(Math.max(cx + pushXOut, minX), maxX), cy, dist: pushXOut },
			{ cx: Math.min(Math.max(cx - pushXIn, minX), maxX), cy, dist: pushXIn },
			{ cx, cy: Math.min(Math.max(cy + pushYOut, minY), maxY), dist: pushYOut },
			{ cx, cy: Math.min(Math.max(cy - pushYIn, minY), maxY), dist: pushYIn }
		].sort((a, b) => a.dist - b.dist);
		/* Prefer whichever option clears everything outright; failing that, take
		   whichever clears the most of what is overlapping now, so every round makes
		   real progress instead of trading the same obstacle back and forth. */
		let best = options[0];
		let bestCleared = -1;
		for (const opt of options) {
			const stillColliding = collidingWith(opt.cx, opt.cy).length;
			if (stillColliding === 0) {
				best = opt;
				break;
			}
			const cleared = colliding.length - stillColliding;
			if (cleared > bestCleared) {
				bestCleared = cleared;
				best = opt;
			}
		}
		cx = best.cx;
		cy = best.cy;
	}
	return { x: cx, y: cy, remaining: collidingWith(cx, cy).length };
}
