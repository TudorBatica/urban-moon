/**
 * Keeping two numbers out of each other's lane. Each wall's own number sits in
 * the lane beside it, over the middle of the wall; on the inside of a reentrant
 * corner two short walls put their lanes in the same place, and the two chips
 * land on top of each other. Whichever comes second steps out one lane and then
 * slides along its own wall until it clears — the same rule the chain follows
 * for the numbers on a single wall.
 *
 * Pure: boxes in label px in, the move one of them has to make out. Label px
 * are screen px at the size labels are designed for, so a chip's own footprint
 * is the same number here whatever the zoom, and so is the room between two
 * chips: comparing there is comparing what the client sees.
 */

/** A chip's footprint, by its centre and its half extents. */
export interface LaneBox {
	cx: number;
	cy: number;
	hw: number;
	hh: number;
}

/** A unit direction; walls are axis-aligned, so these are ±x or ±y. */
export interface LaneDir {
	x: number;
	y: number;
}

/** How far a number has to move to clear its neighbours, in label px. */
export interface LaneMove {
	/** out of the lane, along the wall's outward normal */
	outPx: number;
	/** off the middle of the wall, along the wall itself */
	alongPx: number;
}

/** How much room is left between two chips that have been pushed apart. */
const LANE_GAP_PX = 6;

export function lanesOverlap(a: LaneBox, b: LaneBox): boolean {
	return Math.abs(a.cx - b.cx) < a.hw + b.hw && Math.abs(a.cy - b.cy) < a.hh + b.hh;
}

function movedBy(box: LaneBox, dir: LaneDir, by: number): LaneBox {
	return { ...box, cx: box.cx + dir.x * by, cy: box.cy + dir.y * by };
}

/** A box's centre and half extent on one axis-aligned direction. */
function onAxis(box: LaneBox, dir: LaneDir): { at: number; half: number } {
	return dir.x !== 0
		? { at: box.cx * Math.sign(dir.x), half: box.hw }
		: { at: box.cy * Math.sign(dir.y), half: box.hh };
}

/**
 * How far along `dir` the box has to go to clear everything it overlaps, in
 * whichever of the two directions is the shorter move. One pass: a slide can in
 * principle carry a number into a third one, and a number that has wandered any
 * further than this from the wall it measures says less than it costs.
 */
function slideClear(box: LaneBox, dir: LaneDir, hitting: readonly LaneBox[]): number {
	let forward = 0;
	let back = 0;
	const self = onAxis(box, dir);
	for (const other of hitting) {
		const o = onAxis(other, dir);
		forward = Math.max(forward, o.at + o.half - (self.at - self.half) + LANE_GAP_PX);
		back = Math.max(back, self.at + self.half - (o.at - o.half) + LANE_GAP_PX);
	}
	if (forward === 0 && back === 0) return 0;
	return forward <= back ? forward : -back;
}

/**
 * Where a number has to go to be readable beside the ones already placed:
 * nowhere while its lane is its own, one lane further out the moment it is not,
 * and along the wall after that. The caller ties a number that moved back to
 * its own run with a leader.
 */
export function clearLane(
	box: LaneBox,
	normal: LaneDir,
	along: LaneDir,
	stepOutPx: number,
	placed: readonly LaneBox[]
): LaneMove {
	const hitting = (b: LaneBox): LaneBox[] => placed.filter((p) => lanesOverlap(b, p));
	if (hitting(box).length === 0) return { outPx: 0, alongPx: 0 };
	const steppedOut = movedBy(box, normal, stepOutPx);
	const stillHitting = hitting(steppedOut);
	if (stillHitting.length === 0) return { outPx: stepOutPx, alongPx: 0 };
	return { outPx: stepOutPx, alongPx: slideClear(steppedOut, along, stillHitting) };
}
