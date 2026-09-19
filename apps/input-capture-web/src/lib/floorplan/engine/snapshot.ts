/**
 * The room snapshot: what the editor reports about the plan. It is the
 * contract — it becomes `drawing.room` in the manifest and the architect's PDF
 * — so outline and index reflect the derived ring order when the room is
 * closed, never array-creation order, while each wall's own from/to/segments
 * are reported exactly as stored, so hinge and swing keep meaning what they say
 * relative to that wall's own from->to.
 */

import type { RoomSegment, RoomSnapshot, RoomWall } from '$lib/types';
import { findWall, r, type LengthSource, type Model, type WallEnd } from './model';
import { findClosedRing, headingOf, isClosedLoop, isFreeEnd, traceChain, wallLen } from './topology';
import { landmarkObstacles, markWallLengthCm } from './landmarkEdits';
import { snapshotLandmarks } from './landmarks';
import { RO } from './copy';

/**
 * What the snapshot reports as not yet answered about the plan itself. Nothing
 * here stops a save: the editor has no checks. The ceiling height is not part
 * of the plan — it is answered on its own screen.
 */
export function computeUnanswered(model: Model): string[] {
	const list: string[] = [];
	if (model.walls.length === 0) {
		list.push(RO.firstWall);
		return list;
	}
	if (!isClosedLoop(model)) {
		let freeEnds = 0;
		model.walls.forEach((w) => {
			if (isFreeEnd(model, w, 'from')) freeEnds++;
			if (isFreeEnd(model, w, 'to')) freeEnds++;
		});
		if (freeEnds > 0) list.push(RO.freeEnds(freeEnds));
		else list.push(RO.notClosed);
	}
	return list;
}

/* The contract's own segment says the hinge and the swing but not who said
   them; the editor reports that too, and has since before the schema was
   written, so the shape here is the wider one. */
type SnapshotSegment = RoomSegment & {
	hingeSource: LengthSource | null;
	swingSource: LengthSource | null;
};
type SnapshotWall = Omit<RoomWall, 'segments'> & { segments: SnapshotSegment[] };

export function buildRoomSnapshot(model: Model): RoomSnapshot {
	const ring = findClosedRing(model);
	const closed = !!ring;
	const visited: Record<string, boolean> = {};
	const chains = [];
	for (const w of model.walls) {
		if (visited[w.id]) continue;
		const startEnd: WallEnd = isFreeEnd(model, w, 'from')
			? 'from'
			: isFreeEnd(model, w, 'to')
				? 'to'
				: 'from';
		const chain = traceChain(model, w, startEnd);
		for (const id in chain.visited) visited[id] = true;
		chains.push(chain);
	}
	const orderedWalls = closed
		? ring.walls.map((e) => e.wall)
		: chains.reduce<Model['walls']>((acc, c) => acc.concat(c.walls.map((e) => e.wall)), []);
	const outline = closed ? ring.points : chains.length ? chains[0].points : [];

	const walls: SnapshotWall[] = orderedWalls.map((w, wi) => {
		const segments: SnapshotSegment[] = w.segments.map((s) => ({
			id: s.id,
			kind: s.kind,
			lengthCm: { value: s.length.value, source: s.length.source },
			offsetFromStartCm: s.offsetFromStart,
			sillCm: s.kind === 'window' ? (s.sill ? s.sill.value : null) : null,
			hinge: s.kind === 'door' ? s.hinge || null : null,
			hingeSource: s.kind === 'door' ? s.hingeSource || null : null,
			swing: s.kind === 'door' ? s.swing || null : null,
			swingSource: s.kind === 'door' ? s.swingSource || null : null
		}));
		return {
			id: w.id,
			index: wi,
			from: [r(w.from.x), r(w.from.y)],
			to: [r(w.to.x), r(w.to.y)],
			heading: headingOf(w),
			lengthCm: { value: r(wallLen(w)), source: w.lengthSource },
			segments
		};
	});

	const openings: SnapshotSegment[] = [];
	walls.forEach((w) => {
		w.segments.forEach((s) => {
			if (s.kind === 'window' || s.kind === 'door') openings.push({ wallId: w.id, ...s });
		});
	});

	/* Each landmark its wall can still hold, with the gaps already measured, so a
	   reader prints the distances the client saw without redoing the geometry. */
	const landmarks = snapshotLandmarks(model.landmarks || [], (m) => {
		const w = findWall(model, m.wallId);
		if (!w) return null;
		return {
			lengthCm: markWallLengthCm(w),
			isOpen: !!w.isOpen,
			obstacles: landmarkObstacles(model, w, m.id)
		};
	});
	const unanswered = computeUnanswered(model);
	/* The ceiling height belongs to the saved drawing, not to the plan the editor
	   holds; whoever saves fills it in. */
	return {
		unit: 'cm',
		ceilingHeightCm: null,
		closed,
		outline,
		walls,
		openings,
		landmarks,
		unanswered,
		finished: unanswered.length === 0
	};
}
