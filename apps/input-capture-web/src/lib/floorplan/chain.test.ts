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
