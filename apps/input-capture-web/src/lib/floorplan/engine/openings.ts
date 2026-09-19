/**
 * The segment algebra inside one wall. Windows, doors and Fără perete stretches
 * all live as segments in a wall's own list; placing, resizing and sliding one
 * are local, conservation-based edits entirely within that wall, and segments
 * always exactly partition the wall's current geometric length — geometry is
 * the single source of truth and segments reconcile to it, never the other way
 * round.
 *
 * `isFresh` arrives as a parameter: a piece still being worked on never merges,
 * and what counts as "being worked on" is partly the editor's own focus.
 */

import {
	DEFAULT_DOOR_W,
	MIN_OPEN,
	clamp,
	findSeg,
	findWall,
	makeSegment,
	r,
	type Hinge,
	type Ids,
	type LengthSource,
	type Model,
	type Segment,
	type SegmentKind,
	type Swing,
	type Wall
} from './model';
import { isFreeEnd, segLen, segTotal, wallLen } from './topology';
import type { Blocker } from './landmarks';

/**
 * A piece is still "being worked on" — and so never merges, however eligible
 * its neighbour — while it carries its rough as-drawn length or is what the
 * canvas is on.
 */
export type IsFresh = (seg: Segment) => boolean;

/** The widths a new opening starts at: a window's carries over from the last one typed. */
export interface OpeningDefaults {
	windowWidth: number;
	sill: number;
}

export type ResizeResult = { ok: true; applied: number } | { ok: false; max?: number };

function isFlex(s: Segment): boolean {
	return s.kind === 'wall' || s.kind === 'open';
}

export function reflow(w: Wall): void {
	let off = 0;
	w.segments.forEach((s) => {
		s.offsetFromStart = off;
		off += s.length.value;
	});
}

/** Two same-kind pieces meeting with nothing between them are one run: fuse them. */
export function mergeAdjacentPlain(w: Wall, isFresh: IsFresh): void {
	let changed = true;
	while (changed) {
		changed = false;
		for (let i = 0; i < w.segments.length - 1; i++) {
			const a = w.segments[i];
			const b = w.segments[i + 1];
			if (isFresh(a) || isFresh(b)) continue;
			if ((a.kind === 'wall' && b.kind === 'wall') || (a.kind === 'open' && b.kind === 'open')) {
				a.length.value += b.length.value;
				a.length.source = a.length.source === b.length.source ? a.length.source : 'computed';
				w.segments.splice(i + 1, 1);
				changed = true;
				break;
			}
		}
	}
	reflow(w);
}

export function dropZero(ids: Ids, w: Wall, isFresh: IsFresh): void {
	w.segments = w.segments.filter((s) => s.length.value > 0);
	if (w.segments.length === 0) {
		w.segments.push(makeSegment(ids, w.isOpen ? 'open' : 'wall', r(wallLen(w)), 'computed'));
	}
	mergeAdjacentPlain(w, isFresh);
}

/**
 * The wall's own length changed: repartition its pieces to match. A piece whose
 * number the tool just changed never keeps reading as the client's own.
 */
export function resizeWallKeepingSegments(ids: Ids, w: Wall, newTotal: number, isFresh: IsFresh): void {
	newTotal = Math.max(0, r(newTotal));
	const cur = segTotal(w);
	const delta = newTotal - cur;
	if (delta === 0) return;
	if (delta > 0) {
		const last = w.segments[w.segments.length - 1];
		if (last && isFlex(last)) {
			last.length.value += delta;
			if (last.length.source === 'typed') last.length.source = 'computed';
		} else {
			w.segments.push(makeSegment(ids, 'wall', delta, 'computed'));
		}
	} else {
		let need = -delta;
		for (let k = w.segments.length - 1; k >= 0 && need > 0; k--) {
			const s = w.segments[k];
			if (!isFlex(s)) continue;
			const take = Math.min(need, s.length.value);
			s.length.value -= take;
			need -= take;
			if (take > 0 && s.length.source === 'typed') s.length.source = 'computed';
		}
		w.segments = w.segments.filter((s) => s.length.value > 0);
		if (w.segments.length === 0) w.segments.push(makeSegment(ids, 'wall', 0, 'computed'));
	}
	mergeAdjacentPlain(w, isFresh);
}

export function syncSegments(ids: Ids, model: Model, isFresh: IsFresh): void {
	model.walls.forEach((w) => {
		const geomLen = r(wallLen(w));
		if (segTotal(w) !== geomLen) resizeWallKeepingSegments(ids, w, geomLen, isFresh);
	});
}

/** The unbroken run of plain pieces from `startIdx`, walking in `dir`. */
export function flexRun(w: Wall, startIdx: number, dir: 1 | -1): Segment[] {
	const out: Segment[] = [];
	let i = startIdx;
	while (i >= 0 && i < w.segments.length && isFlex(w.segments[i])) {
		out.push(w.segments[i]);
		i += dir;
	}
	return out;
}

export function runRoom(run: readonly Segment[]): number {
	return run.reduce((a, s) => a + s.length.value, 0);
}

function drain(run: readonly Segment[], amount: number): void {
	let remain = amount;
	run.forEach((s) => {
		if (remain <= 0) return;
		const take = Math.min(remain, s.length.value);
		s.length.value -= take;
		remain -= take;
		if (s.length.source === 'typed') s.length.source = 'computed';
	});
}

/**
 * A piece's own length changed: the room comes from the plain run after it first,
 * then the one before. Growing past what both hold reports the most that fits.
 */
export function resizeSegment(ids: Ids, model: Model, wallId: string, segId: string,
	newLength: number, source: LengthSource, isFresh: IsFresh): ResizeResult {
	const f = findSeg(model, wallId, segId);
	if (!f) return { ok: false };
	const { wall: w, seg, idx } = f;
	newLength = Math.max(MIN_OPEN, r(newLength));
	const delta = newLength - seg.length.value;
	if (delta === 0) {
		seg.length.source = source;
		return { ok: true, applied: newLength };
	}
	if (delta > 0) {
		const nextRun = flexRun(w, idx + 1, 1);
		const prevRun = flexRun(w, idx - 1, -1);
		const nextRoom = runRoom(nextRun);
		const prevRoom = runRoom(prevRun);
		const need = Math.min(delta, nextRoom + prevRoom);
		const fromNext = Math.min(need, nextRoom);
		drain(nextRun, fromNext);
		drain(prevRun, need - fromNext);
		seg.length.value += need;
		seg.length.source = source;
		dropZero(ids, w, isFresh);
		if (need < delta) return { ok: false, max: seg.length.value };
		return { ok: true, applied: seg.length.value };
	}
	const free = -delta;
	seg.length.value -= free;
	seg.length.source = source;
	let target: Segment | undefined = w.segments[idx + 1];
	if (!(target && isFlex(target))) target = w.segments[idx - 1];
	if (target && isFlex(target)) target.length.value += free;
	else w.segments.splice(idx + 1, 0, makeSegment(ids, 'wall', free, 'computed'));
	dropZero(ids, w, isFresh);
	return { ok: true, applied: seg.length.value };
}

/** A piece moves along its wall; the wall's own total is conserved. */
export function slideSegment(ids: Ids, model: Model, wallId: string, segId: string,
	newOffset: number, source: LengthSource, isFresh: IsFresh): { ok: boolean } {
	const f = findSeg(model, wallId, segId);
	if (!f) return { ok: false };
	const { wall: w, seg, idx } = f;
	const total = segTotal(w);
	const wantOffset = clamp(r(newOffset), 0, Math.max(0, total - seg.length.value));
	const delta = wantOffset - seg.offsetFromStart;
	if (delta === 0) return { ok: true };
	if (delta > 0) {
		const nextRun = flexRun(w, idx + 1, 1);
		const move = Math.min(delta, runRoom(nextRun));
		if (move <= 0) return { ok: true };
		drain(nextRun, move);
		const prevS = w.segments[idx - 1];
		if (prevS && isFlex(prevS)) prevS.length.value += move;
		else w.segments.splice(idx, 0, makeSegment(ids, 'wall', move, 'computed'));
	} else {
		const prevRun = flexRun(w, idx - 1, -1);
		const move = Math.min(-delta, runRoom(prevRun));
		if (move <= 0) return { ok: true };
		drain(prevRun, move);
		const nextS = w.segments[idx + 1];
		if (nextS && isFlex(nextS)) nextS.length.value += move;
		else w.segments.splice(idx + 1, 0, makeSegment(ids, 'wall', move, 'computed'));
	}
	dropZero(ids, w, isFresh);
	return { ok: true };
}

/** The plain piece nearest the offset asked for, of at least this width. */
export function bestFlexSegmentFor(w: Wall, widthCm: number, wantOffset: number | null): Segment | null {
	const total = segTotal(w);
	const want = wantOffset == null ? total / 2 : clamp(wantOffset, 0, total);
	let best: Segment | null = null;
	let bestD = Infinity;
	w.segments.forEach((s) => {
		if (!isFlex(s)) return;
		if (s.length.value < widthCm) return;
		const mid = s.offsetFromStart + s.length.value / 2;
		const d = Math.abs(mid - want);
		if (d < bestD) {
			bestD = d;
			best = s;
		}
	});
	return best;
}

/**
 * Cuts the new piece into the plain one it lands on, leaving what is left on
 * each side. The pieces are made in the order they end up in, so the ids they
 * are given run along the wall: what a piece is called is what the saved plan
 * carries and what the markup names it by, so the order is part of the model.
 */
function spliceInto(ids: Ids, w: Wall, target: Segment, makeOpening: () => Segment,
	startInTarget: number, widthCm: number): Segment {
	let idx = -1;
	for (let i = 0; i < w.segments.length; i++) if (w.segments[i].id === target.id) idx = i;
	const before = startInTarget;
	const after = target.length.value - startInTarget - widthCm;
	const newSegs: Segment[] = [];
	if (before > 0) newSegs.push(makeSegment(ids, 'wall', before, 'computed'));
	const opening = makeOpening();
	newSegs.push(opening);
	if (after > 0) newSegs.push(makeSegment(ids, 'wall', after, 'computed'));
	w.segments.splice(idx, 1, ...newSegs);
	reflow(w);
	return opening;
}

/**
 * One tap's worth of opening: as wide as its default allows on the plain piece
 * nearest the tap, and nothing where that piece cannot hold the minimum.
 */
export function addOpening(ids: Ids, model: Model, wallId: string, kind: SegmentKind,
	wantCenterOffset: number | null, defaults: OpeningDefaults): string | null {
	const w = findWall(model, wallId);
	if (!w) return null;
	const byKind: Partial<Record<SegmentKind, number>> = {
		door: DEFAULT_DOOR_W,
		window: defaults.windowWidth
	};
	let width = byKind[kind] || DEFAULT_DOOR_W;
	const total = segTotal(w);
	const want = clamp(wantCenterOffset == null ? total / 2 : wantCenterOffset, 0, total);
	let best: Segment | null = null;
	let bestD = Infinity;
	w.segments.forEach((s) => {
		if (!isFlex(s)) return;
		const mid = s.offsetFromStart + s.length.value / 2;
		const d = Math.abs(mid - want);
		if (d < bestD) {
			bestD = d;
			best = s;
		}
	});
	if (!best) return null;
	const target: Segment = best;
	width = Math.min(width, target.length.value);
	if (width < MIN_OPEN) return null;
	const localWant = clamp(want - target.offsetFromStart, width / 2, target.length.value - width / 2);
	const made = spliceInto(ids, w, target, () => {
		const opening = makeSegment(ids, kind, width, 'computed');
		if (kind === 'window') opening.sill = { value: defaults.sill, source: 'computed' };
		if (kind === 'door') defaultDoorSwing(opening);
		return opening;
	}, r(localWant - width / 2), width);
	return made.id;
}

/** An opening turned back into plain wall, fusing with the plain piece on each side. */
export function removeSegmentToWall(model: Model, wallId: string, segId: string, isFresh: IsFresh): boolean {
	const f = findSeg(model, wallId, segId);
	if (!f) return false;
	const { wall: w, seg, idx } = f;
	seg.kind = w.isOpen ? 'open' : 'wall';
	seg.length.source = 'computed';
	seg.sill = null;
	seg.hinge = null;
	seg.hingeSource = null;
	seg.swing = null;
	seg.swingSource = null;
	const nextS = w.segments[idx + 1];
	const prevS = w.segments[idx - 1];
	if (nextS && isFlex(nextS)) {
		seg.length.value += nextS.length.value;
		w.segments.splice(idx + 1, 1);
	}
	if (prevS && isFlex(prevS)) {
		seg.length.value += prevS.length.value;
		w.segments.splice(idx - 1, 1);
	}
	mergeAdjacentPlain(w, isFresh);
	return true;
}

/** The same opening, re-made on another wall: everything it states travels with it. */
export function moveOpeningToWall(ids: Ids, model: Model, fromWallId: string, segId: string,
	toWallId: string, dropOffsetCm: number | null, isFresh: IsFresh
): { ok: false } | { ok: true; newId: string } {
	if (fromWallId === toWallId) return { ok: false };
	const f = findSeg(model, fromWallId, segId);
	if (!f || (f.seg.kind !== 'window' && f.seg.kind !== 'door')) return { ok: false };
	const toWall = findWall(model, toWallId);
	if (!toWall) return { ok: false };
	const widthCm = f.seg.length.value;
	const target = bestFlexSegmentFor(toWall, widthCm, dropOffsetCm);
	if (!target) return { ok: false };
	const saved = {
		kind: f.seg.kind,
		source: f.seg.length.source,
		sill: f.seg.sill ? { value: f.seg.sill.value, source: f.seg.sill.source } : null,
		hinge: f.seg.hinge,
		hingeSource: f.seg.hingeSource,
		swing: f.seg.swing,
		swingSource: f.seg.swingSource
	};
	removeSegmentToWall(model, fromWallId, segId, isFresh);
	const want =
		dropOffsetCm == null
			? target.offsetFromStart + target.length.value / 2
			: clamp(dropOffsetCm, target.offsetFromStart, target.offsetFromStart + target.length.value);
	const localWant = clamp(
		want - target.offsetFromStart,
		widthCm / 2,
		target.length.value - widthCm / 2
	);
	const made = spliceInto(ids, toWall, target, () => {
		const opening = makeSegment(ids, saved.kind, widthCm, saved.source);
		opening.sill = saved.sill;
		opening.hinge = saved.hinge;
		opening.hingeSource = saved.hingeSource;
		opening.swing = saved.swing;
		opening.swingSource = saved.swingSource;
		return opening;
	}, r(localWant - widthCm / 2), widthCm);
	return { ok: true, newId: made.id };
}

/**
 * The [from, to) window of a wall's segment run as its own list, re-based to zero.
 * A piece the cut trimmed becomes a fresh, computed piece of its own; one taken
 * whole keeps its id and everything it states.
 */
export function sliceSegments(ids: Ids, segs: readonly Segment[], from: number, to: number): Segment[] {
	const out: Segment[] = [];
	segs.forEach((s) => {
		const sStart = s.offsetFromStart;
		const sEnd = sStart + segLen(s);
		const a = Math.max(sStart, from);
		const b = Math.min(sEnd, to);
		if (b - a > 0) {
			const clone = JSON.parse(JSON.stringify(s)) as Segment;
			const trimmed = b - a;
			if (Math.abs(trimmed - segLen(s)) > 1e-9) {
				clone.length.value = r(trimmed);
				clone.length.source = 'computed';
				clone.id = ids.next('seg');
			}
			clone.offsetFromStart = r(a - from);
			out.push(clone);
		}
	});
	if (out.length === 0) out.push(makeSegment(ids, 'wall', r(to - from), 'computed'));
	return out;
}

export function setSegSill(model: Model, wallId: string, segId: string, value: number, source: LengthSource): void {
	const f = findSeg(model, wallId, segId);
	if (f) f.seg.sill = { value: r(value), source };
}

/* Rotate asks for a side or a direction and nothing else, and what it states is
   the client's own answer; the door-creation path is the one caller that says
   'computed' instead. */
export function setSegHinge(model: Model, wallId: string, segId: string, side: Hinge, source?: LengthSource): void {
	const f = findSeg(model, wallId, segId);
	if (f) {
		f.seg.hinge = side;
		f.seg.hingeSource = source || 'typed';
	}
}

export function setSegSwing(model: Model, wallId: string, segId: string, dir: Swing, source?: LengthSource): void {
	const f = findSeg(model, wallId, segId);
	if (f) {
		f.seg.swing = dir;
		f.seg.swingSource = source || 'typed';
	}
}

/** The four hinge/swing combinations as one cycle: a single button, not four. */
export const DOOR_SWING_COMBOS: { hinge: Hinge; swing: Swing }[] = [
	{ hinge: 'start', swing: 'in' },
	{ hinge: 'end', swing: 'in' },
	{ hinge: 'end', swing: 'out' },
	{ hinge: 'start', swing: 'out' }
];

/**
 * A door arrives already hung a sensible way, so Rotate is a correction rather than
 * the only way to get a first answer. Combo 0 is hinged at the wall's own start
 * swinging 'in' — the wall normal's positive side, the side a push treats as the
 * interior and the leaf is drawn against — and lands `computed`, a guess.
 */
export function defaultDoorSwing(seg: Segment): void {
	const combo = DOOR_SWING_COMBOS[0];
	seg.hinge = combo.hinge;
	seg.hingeSource = 'computed';
	seg.swing = combo.swing;
	seg.swingSource = 'computed';
}

export function cycleDoorSwing(model: Model, wallId: string, segId: string): void {
	const f = findSeg(model, wallId, segId);
	if (!f) return;
	const seg = f.seg;
	let idx = -1;
	if (seg.hinge != null && seg.swing != null) {
		for (let i = 0; i < DOOR_SWING_COMBOS.length; i++) {
			if (DOOR_SWING_COMBOS[i].hinge === seg.hinge && DOOR_SWING_COMBOS[i].swing === seg.swing) {
				idx = i;
				break;
			}
		}
	}
	const next = DOOR_SWING_COMBOS[(idx + 1) % DOOR_SWING_COMBOS.length];
	setSegHinge(model, wallId, segId, next.hinge);
	setSegSwing(model, wallId, segId, next.swing);
}

/** How much of a wall its openings already take: the floor its length cannot go under. */
export function openingsTotalCm(w: Wall): number {
	let total = 0;
	w.segments.forEach((s) => {
		if (s.kind === 'window' || s.kind === 'door') total += s.length.value;
	});
	return total;
}

/**
 * What a landmark on this wall may not overlap of the wall's own pieces: a
 * stretch with nothing built. A window or a door is not one of them — a
 * radiator sits under a window.
 */
export function openSpansOf(w: Wall): Blocker[] {
	const out: Blocker[] = [];
	w.segments.forEach((s) => {
		if (s.kind !== 'open') return;
		out.push({ startCm: s.offsetFromStart, endCm: s.offsetFromStart + s.length.value });
	});
	return out;
}

/** The opening is the last piece of its wall, and that end of the wall is joined to nothing. */
export function openingAtFreeEnd(model: Model, w: Wall, seg: Segment): boolean {
	const idx = w.segments.indexOf(seg);
	if (idx === 0 && isFreeEnd(model, w, 'from')) return true;
	return idx === w.segments.length - 1 && isFreeEnd(model, w, 'to');
}
