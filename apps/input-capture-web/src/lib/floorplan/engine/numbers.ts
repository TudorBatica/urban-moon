/**
 * What writing a number does. `dims.ts` says which number a chip is, as a
 * descriptor; this binds each descriptor to the operation that carries it out,
 * and to the one answer an operation can need from the client: the question
 * asked when the number did not fit.
 */

import type { Dim } from './dims';
import { findSeg, findWall, r } from './model';
import { resizeSegment } from './openings';
import type { Session } from './session';
import { isClosedLoop } from './topology';
import { commitWallPieceLength, commitWallTotal, type LengthCommit } from './walls';
import type { IsFresh } from './openings';

export interface NumberDeps {
	isFresh: IsFresh;
	pushHistory: () => void;
	render: () => void;
	/** the number did not fit: offer the most that does */
	offerClamp: (res: { max?: number }, apply: (cm: number) => void) => void;
}

export interface Numbers {
	/** a number typed into a chip on the drawing */
	commitDim(dim: Dim, cm: number): void;
	/** a piece's own length, typed on the drawing or on the plate of the piece in focus */
	commitSegmentLength(wallId: string, segId: string, cm: number): void;
}

export function createNumbers(s: Session, deps: NumberDeps): Numbers {
	const { isFresh, pushHistory, render, offerClamp } = deps;

	/** The wall's own number, once the client has said which one to take. */
	function applyWallTotal(anySegId: string, cm: number): void {
		const res = commitWallTotal(s.ids, s.model, anySegId, cm, 'computed', isFresh, pushHistory);
		if (!res.ok) return;
		render();
	}
	function commitWallTotalNow(wallId: string, cm: number): void {
		const w = findWall(s.model, wallId);
		if (!w) return;
		const anySeg = w.segments[0].id;
		const res: LengthCommit = commitWallTotal(s.ids, s.model, anySeg, cm, 'typed', isFresh, pushHistory);
		if (!res.ok) {
			offerClamp(res, (v) => applyWallTotal(anySeg, v));
			return;
		}
		render();
	}
	function commitSegmentLength(wallId: string, segId: string, cm: number): void {
		const f = findSeg(s.model, wallId, segId);
		if (!f) return;
		const seg = f.seg;
		/* A typed window width carries over to the next window, wherever it was
		   typed; a door keeps its own default. */
		if (seg.kind === 'window') s.carried.windowWidth = r(cm);
		if (seg.kind === 'wall' || seg.kind === 'open' || !isClosedLoop(s.model)) {
			const pieceRes = commitWallPieceLength(s.ids, s.model, seg.id, cm, 'typed', isFresh, pushHistory);
			if (!pieceRes.missing) render();
			return;
		}
		const res = resizeSegment(s.ids, s.model, wallId, segId, cm, 'typed', isFresh);
		if (!res.ok) {
			offerClamp(res, (v) => {
				resizeSegment(s.ids, s.model, wallId, segId, v, 'computed', isFresh);
				render();
			});
		} else {
			render();
		}
	}
	function runDimCommit(dim: Dim, cm: number): void {
		const commit = dim.commit;
		if (!commit) return;
		if (commit.kind === 'wallTotal') commitWallTotalNow(commit.wallId, cm);
		else commitSegmentLength(commit.wallId, commit.segId, cm);
	}

	return { commitDim: runDimCommit, commitSegmentLength };
}
