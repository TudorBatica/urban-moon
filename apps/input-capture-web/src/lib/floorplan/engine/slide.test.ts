import { describe, it, expect } from 'vitest';
import {
  buildRun,
  extendEndOf,
  ownOffsetOf,
  placeAlongRun,
  type RunWall,
  type RunWallInput,
  type SlideRun
} from './slide';

const WIDTH = 60;

/** two 300 cm walls joined at a corner, both outer ends joined to something else */
const closedRun: SlideRun = {
  walls: [
    { id: 'wallA', lengthCm: 300, forward: true, startArc: 0 },
    { id: 'wallB', lengthCm: 300, forward: true, startArc: 300 }
  ],
  startFree: false,
  endFree: false,
  closed: false
};

/** a 300x300 room: four walls, drawn round the ring */
const room: RunWallInput[] = [
  { id: 'top', lengthCm: 300, open: false, fromKey: '0,0', toKey: '300,0' },
  { id: 'right', lengthCm: 300, open: false, fromKey: '300,0', toKey: '300,300' },
  { id: 'bottom', lengthCm: 300, open: false, fromKey: '300,300', toKey: '0,300' },
  { id: 'left', lengthCm: 300, open: false, fromKey: '0,300', toKey: '0,0' }
];

describe('buildRun', () => {
  it('walks both ways from the wall the opening is on, to the free ends', () => {
    const walls: RunWallInput[] = [
      { id: 'a', lengthCm: 100, open: false, fromKey: '0,0', toKey: '100,0' },
      { id: 'b', lengthCm: 200, open: false, fromKey: '100,0', toKey: '100,200' }
    ];
    const run = buildRun('b', walls);
    expect(run?.walls.map((w) => w.id)).toEqual(['a', 'b']);
    expect(run?.startFree).toBe(true);
    expect(run?.endFree).toBe(true);
    expect(run?.closed).toBe(false);
    expect(run?.walls.map((w) => w.startArc)).toEqual([0, 100]);
  });

  it('reads a wall drawn the other way round backwards, and says so', () => {
    // 'b' was drawn toward the corner it shares with 'a', so the run reads it to->from
    const walls: RunWallInput[] = [
      { id: 'a', lengthCm: 100, open: false, fromKey: '0,0', toKey: '100,0' },
      { id: 'b', lengthCm: 200, open: false, fromKey: '100,200', toKey: '100,0' }
    ];
    const run = buildRun('a', walls);
    expect(run?.walls.map((w) => [w.id, w.forward, w.startArc])).toEqual([
      ['a', true, 0],
      ['b', false, 100]
    ]);
  });

  it('reads a backward wall found by the walk behind the start too', () => {
    const walls: RunWallInput[] = [
      { id: 'a', lengthCm: 100, open: false, fromKey: '0,0', toKey: '100,0' },
      { id: 'b', lengthCm: 200, open: false, fromKey: '0,0', toKey: '0,-200' }
    ];
    const run = buildRun('a', walls);
    expect(run?.walls.map((w) => [w.id, w.forward, w.startArc])).toEqual([
      ['b', false, 0],
      ['a', true, 200]
    ]);
  });

  it('does not travel onto a Fără perete side', () => {
    const walls: RunWallInput[] = [
      { id: 'a', lengthCm: 100, open: false, fromKey: '0,0', toKey: '100,0' },
      { id: 'gap', lengthCm: 200, open: true, fromKey: '100,0', toKey: '100,200' }
    ];
    const run = buildRun('a', walls);
    expect(run?.walls.map((w) => w.id)).toEqual(['a']);
    // the run ends there, and that end is not free: nothing travels past it
    expect(run?.endFree).toBe(false);
  });

  it('stops where more than one wall meets', () => {
    const walls: RunWallInput[] = [
      { id: 'a', lengthCm: 100, open: false, fromKey: '0,0', toKey: '100,0' },
      { id: 'b', lengthCm: 200, open: false, fromKey: '100,0', toKey: '100,200' },
      { id: 'c', lengthCm: 200, open: false, fromKey: '100,0', toKey: '100,-200' }
    ];
    const run = buildRun('a', walls);
    expect(run?.walls.map((w) => w.id)).toEqual(['a']);
    expect(run?.endFree).toBe(false);
  });

  it('comes back as one closed run for a room, not a path that meets itself', () => {
    const run = buildRun('top', room);
    expect(run?.closed).toBe(true);
    expect(run?.walls.map((w) => w.id)).toEqual(['top', 'right', 'bottom', 'left']);
    expect(run?.walls.map((w) => w.startArc)).toEqual([0, 300, 600, 900]);
    expect(run?.startFree).toBe(false);
    expect(run?.endFree).toBe(false);
  });

  it('has no run for a wall it cannot find', () => {
    expect(buildRun('nowhere', room)).toBeNull();
  });
});

describe('placeAlongRun', () => {
  it('keeps the opening on its own wall while its middle is on it', () => {
    const place = placeAlongRun(closedRun, WIDTH, 200);
    expect(place).toEqual({ wallId: 'wallA', offsetCm: 170, extendCm: 0, extendAtStart: false });
  });

  it('carries it onto the next wall once its middle passes the corner', () => {
    const before = placeAlongRun(closedRun, WIDTH, 290);
    const after = placeAlongRun(closedRun, WIDTH, 310);
    expect(before?.wallId).toBe('wallA');
    // wholly on the wall it is on: the corner pushes it clear
    expect(before?.offsetCm).toBe(240);
    expect(after?.wallId).toBe('wallB');
    expect(after?.offsetCm).toBe(0);
  });

  it('stops at an end the run does not carry on past', () => {
    const place = placeAlongRun(closedRun, WIDTH, 5000);
    expect(place).toEqual({ wallId: 'wallB', offsetCm: 240, extendCm: 0, extendAtStart: false });
  });

  it('goes past a free end until its near jamb meets the wall\'s end', () => {
    const run: SlideRun = { ...closedRun, endFree: true };
    const place = placeAlongRun(run, WIDTH, 5000);
    // the far jamb is 60 cm past where the wall ended: the wall grew by that much
    expect(place).toEqual({ wallId: 'wallB', offsetCm: 300, extendCm: 60, extendAtStart: false });
  });

  it('goes past a free end at the run\'s start the same way', () => {
    const run: SlideRun = { ...closedRun, startFree: true };
    const place = placeAlongRun(run, WIDTH, -5000);
    expect(place).toEqual({ wallId: 'wallA', offsetCm: 0, extendCm: 60, extendAtStart: true });
  });

  it('asks for no growth once it slides back onto the wall', () => {
    const run: SlideRun = { ...closedRun, endFree: true };
    const out = placeAlongRun(run, WIDTH, 620);
    const back = placeAlongRun(run, WIDTH, 400);
    expect(out?.extendCm).toBeGreaterThan(0);
    expect(back).toEqual({ wallId: 'wallB', offsetCm: 70, extendCm: 0, extendAtStart: false });
  });

  it('carries on round a closed run instead of stopping at the corner it began at', () => {
    const run = buildRun('top', room) as SlideRun;
    // dragged backwards past the room's first corner: it lands on the last
    // wall of the ring, not pinned to the start of the first
    const back = placeAlongRun(run, WIDTH, -150);
    expect(back).toEqual({ wallId: 'left', offsetCm: 120, extendCm: 0, extendAtStart: false });
    // and the same going forward past the end of the ring
    const on = placeAlongRun(run, WIDTH, 1350);
    expect(on).toEqual({ wallId: 'top', offsetCm: 120, extendCm: 0, extendAtStart: false });
    // a closed run never grows a wall: there is no free end on it
    expect(back?.extendCm).toBe(0);
  });

  it('places on one wall of a run without the caller rebasing its arcs', () => {
    const run = buildRun('top', room) as SlideRun;
    const bottom = run.walls[2];
    const solo: SlideRun = { walls: [bottom], startFree: false, endFree: false, closed: false };
    expect(placeAlongRun(solo, WIDTH, 700)).toEqual({
      wallId: 'bottom', offsetCm: 70, extendCm: 0, extendAtStart: false
    });
  });

  it('has nowhere to put an opening with no run', () => {
    expect(placeAlongRun({ walls: [], startFree: true, endFree: true, closed: false }, WIDTH, 0)).toBeNull();
  });
});

describe('ownOffsetOf and extendEndOf', () => {
  const forward: RunWall = { id: 'w', lengthCm: 300, forward: true, startArc: 0 };
  const backward: RunWall = { id: 'w', lengthCm: 300, forward: false, startArc: 0 };
  const at = (offsetCm: number, extendCm = 0, extendAtStart = false) => ({
    wallId: 'w', offsetCm, extendCm, extendAtStart
  });

  it('takes the run\'s offset as the wall\'s own where the run reads it forward', () => {
    expect(ownOffsetOf(forward, at(100), WIDTH)).toBe(100);
    expect(extendEndOf(forward, at(100))).toBeNull();
  });

  it('mirrors it where the run reads the wall backwards', () => {
    // 100 cm along the run from that wall's run-start is 140 cm from its own start
    expect(ownOffsetOf(backward, at(100), WIDTH)).toBe(140);
  });

  it('grows the end of the wall the run\'s own end is at', () => {
    expect(extendEndOf(forward, at(300, 60))).toBe('to');
    expect(extendEndOf(backward, at(300, 60))).toBe('from');
    expect(extendEndOf(forward, at(0, 60, true))).toBe('from');
    expect(extendEndOf(backward, at(0, 60, true))).toBe('to');
  });

  it('holds the opening flush against the end that grew', () => {
    // grown at its own 'to': the far jamb is the new end of the wall
    expect(ownOffsetOf(forward, at(300, 60), WIDTH)).toBe(300);
    expect(ownOffsetOf(backward, at(0, 60, true), WIDTH)).toBe(300);
    // grown at its own 'from': the opening starts the wall
    expect(ownOffsetOf(forward, at(0, 60, true), WIDTH)).toBe(0);
    expect(ownOffsetOf(backward, at(300, 60), WIDTH)).toBe(0);
  });
});
