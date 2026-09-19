import { describe, it, expect } from 'vitest';
import {
  CHAIN_LANE_PX,
  CHAIN_STEP_OUT_PX,
  chainOfPiece,
  placeChainChips,
  type ChainChipInput
} from './chain';

/** a 300 cm wall with a 60 cm window from 150 to 210 */
const wall = { wallLengthCm: 300, pieceStartCm: 150, pieceEndCm: 210 };

describe('chainOfPiece', () => {
  it('runs each gap to the wall\'s own end when nothing else is on it', () => {
    const items = chainOfPiece({ ...wall, obstacles: [] });
    expect(items.map((i) => [i.kind, i.lengthCm])).toEqual([
      ['gap-before', 150],
      ['piece', 60],
      ['gap-after', 90]
    ]);
  });

  it('adds up to the wall\'s length', () => {
    const items = chainOfPiece({ ...wall, obstacles: [] });
    expect(items.reduce((a, i) => a + i.lengthCm, 0)).toBe(300);
    expect(items[0].startCm).toBe(0);
    expect(items[items.length - 1].endCm).toBe(300);
  });

  it('stops a gap at another opening', () => {
    const items = chainOfPiece({ ...wall, obstacles: [{ startCm: 40, endCm: 130 }] });
    expect(items.map((i) => [i.kind, i.startCm, i.lengthCm])).toEqual([
      ['gap-before', 130, 20],
      ['piece', 150, 60],
      ['gap-after', 210, 90]
    ]);
  });

  it('stops a gap where the wall meets a Fără perete side', () => {
    const items = chainOfPiece({ ...wall, obstacles: [{ startCm: 250, endCm: 300 }] });
    expect(items.map((i) => [i.kind, i.lengthCm])).toEqual([
      ['gap-before', 150],
      ['piece', 60],
      ['gap-after', 40]
    ]);
  });

  it('stops at the corner the wall ends in, which the piece can still slide round', () => {
    // capăt---perete---fereastră---ușă, read on the window: the door is on
    // the next wall, so this wall's chain ends at the corner.
    const items = chainOfPiece({ wallLengthCm: 210, pieceStartCm: 150, pieceEndCm: 210, obstacles: [] });
    expect(items.map((i) => [i.kind, i.lengthCm])).toEqual([
      ['gap-before', 150],
      ['piece', 60]
    ]);
  });

  it('drops a gap of zero: the chain starts at the piece', () => {
    const items = chainOfPiece({ ...wall, obstacles: [{ startCm: 60, endCm: 150 }] });
    expect(items.map((i) => i.kind)).toEqual(['piece', 'gap-after']);
  });

  it('ends with the piece when it sits past a free end', () => {
    const items = chainOfPiece({ wallLengthCm: 360, pieceStartCm: 300, pieceEndCm: 360, obstacles: [] });
    expect(items.map((i) => [i.kind, i.lengthCm])).toEqual([
      ['gap-before', 300],
      ['piece', 60]
    ]);
  });
});

describe('a landmark in the chain', () => {
  /** a 30 cm square, on either face, as an obstacle */
  const square = (startCm: number) => ({ startCm, endCm: startCm + 30 });

  it('stops a window\'s gap, whichever face it is on', () => {
    const items = chainOfPiece({ ...wall, obstacles: [square(100), square(240)] });
    expect(items.map((i) => [i.kind, i.lengthCm])).toEqual([
      ['gap-before', 20],
      ['piece', 60],
      ['gap-after', 30]
    ]);
  });

  it('stops another landmark\'s gap', () => {
    // the square from 150 to 180, with one at 60 and one at 250
    const items = chainOfPiece({
      wallLengthCm: 300,
      pieceStartCm: 150,
      pieceEndCm: 180,
      obstacles: [square(60), square(250)],
      pieceShowsNumber: false
    });
    expect(items.map((i) => [i.kind, i.lengthCm])).toEqual([
      ['gap-before', 60],
      ['piece', 30],
      ['gap-after', 70]
    ]);
  });

  it('is a break in the line with no number of its own', () => {
    const items = chainOfPiece({
      wallLengthCm: 300,
      pieceStartCm: 150,
      pieceEndCm: 180,
      obstacles: [],
      pieceShowsNumber: false
    });
    expect(items.map((i) => [i.kind, i.showsNumber])).toEqual([
      ['gap-before', true],
      ['piece', false],
      ['gap-after', true]
    ]);
  });

  it('sits under a window and stops at its jambs on both sides', () => {
    // a 60 cm window from 140 to 200 with the square at 150 to 180 inside it:
    // the run a client can hold a tape to reaches the jamb, not past it
    const items = chainOfPiece({
      wallLengthCm: 300,
      pieceStartCm: 150,
      pieceEndCm: 180,
      obstacles: [{ startCm: 140, endCm: 200 }, square(60)],
      pieceShowsNumber: false
    });
    expect(items.map((i) => [i.kind, i.startCm, i.endCm, i.lengthCm])).toEqual([
      ['gap-before', 140, 150, 10],
      ['piece', 150, 180, 30],
      ['gap-after', 180, 200, 20]
    ]);
  });

  it('stops at the one jamb it is under when it only half overlaps', () => {
    // the square from 190 to 220 under a window from 140 to 200: the near jamb
    // is the one behind it, and nothing is drawn across the window
    const items = chainOfPiece({
      wallLengthCm: 300,
      pieceStartCm: 190,
      pieceEndCm: 220,
      obstacles: [{ startCm: 140, endCm: 200 }],
      pieceShowsNumber: false
    });
    expect(items.map((i) => [i.kind, i.startCm, i.endCm])).toEqual([
      ['gap-before', 140, 190],
      ['piece', 190, 220],
      ['gap-after', 220, 300]
    ]);
  });

  it('stops at the nearer jamb when two openings reach over it', () => {
    const items = chainOfPiece({
      wallLengthCm: 300,
      pieceStartCm: 150,
      pieceEndCm: 180,
      obstacles: [
        { startCm: 100, endCm: 190 },
        { startCm: 120, endCm: 260 }
      ],
      pieceShowsNumber: false
    });
    expect(items.map((i) => [i.kind, i.startCm, i.endCm])).toEqual([
      ['gap-before', 120, 150],
      ['piece', 150, 180],
      ['gap-after', 180, 190]
    ]);
  });

  it('is bounded by nothing that sits wholly inside it', () => {
    const items = chainOfPiece({
      wallLengthCm: 300,
      pieceStartCm: 150,
      pieceEndCm: 180,
      obstacles: [{ startCm: 160, endCm: 170 }],
      pieceShowsNumber: false
    });
    expect(items.map((i) => [i.kind, i.lengthCm])).toEqual([
      ['gap-before', 150],
      ['piece', 30],
      ['gap-after', 120]
    ]);
  });

  it('never reads a gap backwards, however the piece and an obstacle overlap', () => {
    const spans = [
      [0, 300],
      [140, 200],
      [149, 151],
      [179, 181],
      [150, 180],
      [0, 150],
      [180, 300]
    ];
    for (const [startCm, endCm] of spans) {
      const items = chainOfPiece({
        wallLengthCm: 300,
        pieceStartCm: 150,
        pieceEndCm: 180,
        obstacles: [{ startCm, endCm }],
        pieceShowsNumber: false
      });
      for (const it of items) expect(it.lengthCm).toBeGreaterThan(0);
      const before = items.find((i) => i.kind === 'gap-before');
      const after = items.find((i) => i.kind === 'gap-after');
      if (before) expect(before.endCm).toBe(150);
      if (after) expect(after.startCm).toBe(180);
    }
  });

  it('states its own size like an opening when it is asked to', () => {
    const items = chainOfPiece({ ...wall, obstacles: [] });
    expect(items.every((i) => i.showsNumber)).toBe(true);
  });
});

describe('placeChainChips', () => {
  const chip = (startPx: number, endPx: number, chipLengthPx = 80): ChainChipInput => ({
    startPx,
    endPx,
    chipLengthPx
  });

  it('keeps a number that fits its span in the lane, centred on it', () => {
    const [p] = placeChainChips([chip(0, 200)], 'horizontal');
    expect(p.steppedOut).toBe(false);
    expect(p.outPx).toBe(CHAIN_LANE_PX);
    expect(p.alongPx).toBe(100);
  });

  it('steps a number too narrow for its span out one lane, by the wall\'s axis', () => {
    const [flat] = placeChainChips([chip(0, 20)], 'horizontal');
    const [upright] = placeChainChips([chip(0, 20)], 'vertical');
    expect(flat.steppedOut).toBe(true);
    expect(flat.outPx).toBe(CHAIN_STEP_OUT_PX.horizontal);
    expect(upright.outPx).toBe(CHAIN_STEP_OUT_PX.vertical);
    expect(CHAIN_STEP_OUT_PX.vertical).toBeGreaterThan(CHAIN_STEP_OUT_PX.horizontal);
  });

  it('pushes two stepped-out neighbours apart along the wall', () => {
    const places = placeChainChips([chip(0, 20), chip(20, 50)], 'horizontal');
    expect(places.every((p) => p.steppedOut)).toBe(true);
    expect(places[1].alongPx - places[0].alongPx).toBe(80);
    // the leader says where each number really belongs
    expect(places[1].spanMidPx).toBe(35);
  });

  it('leaves a number that fits where it is, whatever its neighbours do', () => {
    const places = placeChainChips([chip(0, 20), chip(20, 400)], 'horizontal');
    expect(places[1].steppedOut).toBe(false);
    expect(places[1].alongPx).toBe(210);
  });
});
