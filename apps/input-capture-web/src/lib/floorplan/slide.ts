/**
 * How far a window or a door travels while it is dragged: along the run of
 * walls that carry on into one another, round the corners between them, and
 * past a free end at either end of that run.
 *
 * Pure: the engine hands over every wall it has as an id, a length and the
 * two ends it touches; the run, where the opening lands on it, and which
 * way round that is on the wall itself are all decided here.
 */

/** A wall as this module needs it: its two ends as keys equal exactly when the points are. */
export interface RunWallInput {
  id: string;
  lengthCm: number;
  /** a Fără perete side: an opening never travels onto one */
  open: boolean;
  fromKey: string;
  toKey: string;
}

/** A wall of the run, in run order. `forward` is false where the run reads it to->from. */
export interface RunWall {
  id: string;
  lengthCm: number;
  forward: boolean;
  /** cm from the run's start to this wall's own start in run order */
  startArc: number;
}

export interface SlideRun {
  walls: RunWall[];
  /** nothing is joined to the run's first wall at its outer end */
  startFree: boolean;
  /** nothing is joined to the run's last wall at its outer end */
  endFree: boolean;
  /** the run is a ring: its two ends are the same corner, and travel wraps round it */
  closed: boolean;
}

export interface SlidePlacement {
  wallId: string;
  /** the opening's near edge, cm from that wall's own start in run order, once it has grown */
  offsetCm: number;
  /** how much that wall has to grow past its free end to hold the opening */
  extendCm: number;
  /** the growth is at the run's start end rather than its end */
  extendAtStart: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * The run an opening on `startWallId` may travel: the walls that carry on
 * into one another from it, in order. It stops at a free end, at a Fără
 * perete side, and where more than one wall meets — a corner with no single
 * answer is not one an opening can be carried round. A ring comes back as
 * one closed run rather than a path with its two ends at the same corner.
 */
export function buildRun(startWallId: string, walls: RunWallInput[]): SlideRun | null {
  const start = walls.find((w) => w.id === startWallId);
  if (!start) return null;
  const others = (key: string, exceptId: string) =>
    walls.filter((w) => w.id !== exceptId && (w.fromKey === key || w.toKey === key));
  const singleAt = (key: string, exceptId: string) => {
    const found = others(key, exceptId);
    return found.length === 1 ? found[0] : null;
  };

  const entries: RunWall[] = [{ id: start.id, lengthCm: start.lengthCm, forward: true, startArc: 0 }];
  const seen = new Set<string>([start.id]);
  let closed = false;
  let tail = start;
  let tailKey = start.toKey;
  for (;;) {
    const next = singleAt(tailKey, tail.id);
    if (!next || next.open) break;
    if (seen.has(next.id)) {
      // Back at the wall it started from, at that wall's own other end:
      // the run is a ring, not a path that happens to touch itself.
      closed = next.id === start.id && tailKey === start.fromKey;
      break;
    }
    const forward = next.fromKey === tailKey;
    entries.push({ id: next.id, lengthCm: next.lengthCm, forward, startArc: 0 });
    seen.add(next.id);
    tail = next;
    tailKey = forward ? next.toKey : next.fromKey;
  }
  const endFree = !closed && others(tailKey, tail.id).length === 0;

  let head = start;
  let headKey = start.fromKey;
  if (!closed) {
    for (;;) {
      const prev = singleAt(headKey, head.id);
      if (!prev || prev.open || seen.has(prev.id)) break;
      // Walking backwards: the run reaches this wall's shared end last, so
      // it reads from->to only when that end is its own 'to'.
      const forward = prev.toKey === headKey;
      entries.unshift({ id: prev.id, lengthCm: prev.lengthCm, forward, startArc: 0 });
      seen.add(prev.id);
      head = prev;
      headKey = forward ? prev.fromKey : prev.toKey;
    }
  }
  const startFree = !closed && others(headKey, head.id).length === 0;

  let arc = 0;
  for (const e of entries) {
    e.startArc = arc;
    arc += e.lengthCm;
  }
  return { walls: entries, startFree, endFree, closed };
}

/** the run's own stretch of arc: from its first wall's start to its last wall's end */
export function runSpan(run: SlideRun): { startArc: number; lengthCm: number } {
  const first = run.walls[0];
  const last = run.walls[run.walls.length - 1];
  return { startArc: first.startArc, lengthCm: last.startArc + last.lengthCm - first.startArc };
}

/**
 * Where an opening of `widthCm` lands when its middle is asked to sit at
 * `wantCentreArcCm`, measured from the run's start.
 *
 * It is always wholly on one wall — the one its middle is on, so it moves
 * over exactly as the middle passes a corner. It stops where the run stops:
 * a corner into nothing, a Fără perete side, a junction. At a free end it
 * may carry on until its near jamb reaches the wall's end, the wall growing
 * behind it so the opening becomes the last piece of the run. A closed run
 * has no end to stop at: travel wraps round it.
 */
export function placeAlongRun(
  run: SlideRun,
  widthCm: number,
  wantCentreArcCm: number
): SlidePlacement | null {
  if (!run.walls.length) return null;
  // Arcs are the run's own: a run of one wall taken out of a longer one
  // keeps that wall's place in it, so a caller never has to rebase.
  const span = runSpan(run);
  const base = span.startArc;
  const total = span.lengthCm;
  const half = widthCm / 2;
  let centre: number;
  if (run.closed && total > 0) {
    centre = base + (((wantCentreArcCm - base) % total) + total) % total;
  } else {
    const minCentre = base + (run.startFree ? -half : half);
    const maxCentre = base + total - (run.endFree ? -half : half);
    centre = clamp(wantCentreArcCm, Math.min(minCentre, maxCentre), Math.max(minCentre, maxCentre));
  }

  let idx = run.walls.length - 1;
  for (let i = 0; i < run.walls.length; i++) {
    if (centre < run.walls[i].startArc + run.walls[i].lengthCm) {
      idx = i;
      break;
    }
  }

  const wall = run.walls[idx];
  const wanted = centre - half - wall.startArc;
  const room = wall.lengthCm - widthCm;

  if (!run.closed && idx === 0 && run.startFree && wanted < 0) {
    return { wallId: wall.id, offsetCm: 0, extendCm: -wanted, extendAtStart: true };
  }
  if (!run.closed && idx === run.walls.length - 1 && run.endFree && wanted > room) {
    return { wallId: wall.id, offsetCm: wanted, extendCm: wanted - room, extendAtStart: false };
  }
  return { wallId: wall.id, offsetCm: clamp(wanted, 0, Math.max(0, room)), extendCm: 0, extendAtStart: false };
}

/** Which of the wall's own ends grows, once the run's direction is put back on it. */
export function extendEndOf(wall: RunWall, placement: SlidePlacement): 'from' | 'to' | null {
  if (placement.extendCm <= 0) return null;
  if (placement.extendAtStart) return wall.forward ? 'from' : 'to';
  return wall.forward ? 'to' : 'from';
}

/**
 * The opening's offset from the wall's OWN start, which is the run's start
 * only where the run reads that wall forward. A wall that grew holds the
 * opening flush against the end that grew.
 */
export function ownOffsetOf(wall: RunWall, placement: SlidePlacement, widthCm: number): number {
  const end = extendEndOf(wall, placement);
  if (end === 'from') return 0;
  if (end === 'to') return wall.lengthCm + placement.extendCm - widthCm;
  return wall.forward ? placement.offsetCm : wall.lengthCm - placement.offsetCm - widthCm;
}
