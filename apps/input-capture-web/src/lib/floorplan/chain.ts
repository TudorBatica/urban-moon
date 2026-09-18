/**
 * The chain a wall shows while a piece on it is in focus — gap, the piece,
 * gap — and where each of its numbers sits in the lane beside the wall.
 *
 * Pure: cm along one wall in, cm and screen px out. The engine owns the
 * model and the view transform.
 */

/** Anything a gap stops at, as the span it covers, in cm from the wall's start. */
export interface ChainObstacle {
  startCm: number;
  endCm: number;
}

export interface ChainInput {
  /** the wall's own length; both of its ends stop a gap */
  wallLengthCm: number;
  pieceStartCm: number;
  pieceEndCm: number;
  /** everything else along this wall a gap stops at, the piece excluded */
  obstacles: ChainObstacle[];
}

export type ChainItemKind = 'gap-before' | 'piece' | 'gap-after';

export interface ChainItem {
  kind: ChainItemKind;
  /** cm from the wall's start */
  startCm: number;
  endCm: number;
  lengthCm: number;
}

export type WallAxis = 'horizontal' | 'vertical';

/** How far out of the wall's face the lane sits, in screen px. */
export const CHAIN_LANE_PX = 34;

/**
 * The one lane further out a number steps into when its own span is too
 * narrow to hold it. Chips sit side by side on a vertical wall, where the
 * lane has to clear a whole chip width rather than its height.
 */
export const CHAIN_STEP_OUT_PX: Record<WallAxis, number> = {
  horizontal: 68,
  vertical: 96
};

/**
 * The chain of a focused piece: the gap on each side runs from the piece's
 * edge to the first obstacle there, and the wall's own two ends are
 * obstacles as much as anything on it — which is what stops the chain at a
 * corner the piece can still slide round, at a free end, and where the wall
 * meets a Fără perete side. A gap of zero is dropped: the chain simply
 * starts (or ends) with the piece.
 */
export function chainOfPiece(input: ChainInput): ChainItem[] {
  const pieceStart = input.pieceStartCm;
  const pieceEnd = input.pieceEndCm;
  let before = 0;
  let after = input.wallLengthCm;
  for (const o of input.obstacles) {
    if (o.endCm <= pieceStart && o.endCm > before) before = o.endCm;
    if (o.startCm >= pieceEnd && o.startCm < after) after = o.startCm;
  }
  const items: ChainItem[] = [];
  if (pieceStart - before > 0) {
    items.push({ kind: 'gap-before', startCm: before, endCm: pieceStart, lengthCm: pieceStart - before });
  }
  items.push({ kind: 'piece', startCm: pieceStart, endCm: pieceEnd, lengthCm: pieceEnd - pieceStart });
  if (after - pieceEnd > 0) {
    items.push({ kind: 'gap-after', startCm: pieceEnd, endCm: after, lengthCm: after - pieceEnd });
  }
  return items;
}

/** One number to place: the span it measures and the room its chip needs, both along the wall. */
export interface ChainChipInput {
  startPx: number;
  endPx: number;
  /** the chip's own extent along the wall, in screen px */
  chipLengthPx: number;
}

export interface ChainChipPlacement {
  /** the middle of the span, px along the wall: where a leader starts */
  spanMidPx: number;
  /** the chip's own centre, px along the wall */
  alongPx: number;
  /** how far out of the wall's face the chip sits, in screen px */
  outPx: number;
  /** too narrow for its span, so it stepped out of the lane onto a leader */
  steppedOut: boolean;
}

/**
 * Where each of the chain's numbers goes. One that fits its span stays in
 * the lane, centred on it. One that does not steps out to the single outer
 * lane rather than shrinking or overlapping, and two stepped-out numbers in
 * a row are pushed apart along the wall until their chips clear each other:
 * they no longer sit over their own spans, which is what their leaders say.
 */
export function placeChainChips(items: ChainChipInput[], axis: WallAxis): ChainChipPlacement[] {
  const stepOut = CHAIN_STEP_OUT_PX[axis];
  const placements: ChainChipPlacement[] = items.map((it) => {
    const mid = (it.startPx + it.endPx) / 2;
    const fits = it.endPx - it.startPx >= it.chipLengthPx;
    return {
      spanMidPx: mid,
      alongPx: mid,
      outPx: fits ? CHAIN_LANE_PX : stepOut,
      steppedOut: !fits
    };
  });
  let prev: { alongPx: number; chipLengthPx: number } | null = null;
  placements.forEach((p, i) => {
    if (!p.steppedOut) return;
    const chipLengthPx = items[i].chipLengthPx;
    if (prev) {
      const clear = (prev.chipLengthPx + chipLengthPx) / 2;
      if (p.alongPx - prev.alongPx < clear) p.alongPx = prev.alongPx + clear;
    }
    prev = { alongPx: p.alongPx, chipLengthPx };
  });
  return placements;
}
