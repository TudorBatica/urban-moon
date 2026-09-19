import { describe, expect, it } from 'vitest';
import {
	Ids,
	cloneModel,
	findLandmark,
	findSeg,
	findSegAnywhere,
	findWall,
	landmarksOn,
	makeSegment,
	makeWall,
	minFor,
	pointKey,
	pointsEqual,
	r,
	selectedLandmarkId,
	selectedSegId,
	type Model
} from './model';
import { fixture } from './fixtures/load';

describe('Ids', () => {
	it('counts from one, per instance', () => {
		const a = new Ids();
		const b = new Ids();
		expect([a.next('seg'), a.next('seg'), b.next('wall')]).toEqual(['seg1', 'seg2', 'wall1']);
	});

	it('jumps past every id a restored model already holds', () => {
		const ids = new Ids();
		ids.bumpPast(fixture('closed-room').model);
		expect(ids.next('seg')).toBe('seg11');
	});

	it('counts a landmark id in too', () => {
		const ids = new Ids();
		ids.bumpPast(fixture('landmarks').model);
		expect(ids.next('mark')).toBe('mark5');
	});

	it('leaves the counter alone for ids with no number', () => {
		const ids = new Ids();
		ids.bumpPast({ walls: [], landmarks: [] });
		expect(ids.next('wall')).toBe('wall1');
	});
});

describe('makeWall', () => {
	it('refuses a diagonal', () => {
		const ids = new Ids();
		expect(() => makeWall(ids, { x: 0, y: 0 }, { x: 100, y: 50 })).toThrow(/diagonal/);
	});

	it('gives the wall one segment of its own whole length', () => {
		const w = makeWall(new Ids(), { x: 0, y: 0 }, { x: 250, y: 0 }, 'drawn');
		expect(w.isOpen).toBe(false);
		expect(w.lengthSource).toBe('drawn');
		expect(w.segments).toHaveLength(1);
		expect(w.segments[0]).toMatchObject({ kind: 'wall', length: { value: 250, source: 'drawn' } });
	});

	it('an open stroke makes an open wall carrying an open segment', () => {
		const w = makeWall(new Ids(), { x: 0, y: 0 }, { x: 0, y: 120 }, 'drawn', 'open');
		expect(w.isOpen).toBe(true);
		expect(w.segments[0].kind).toBe('open');
	});
});

describe('the arithmetic', () => {
	it('rounds a point key to whole cm', () => {
		expect(pointKey({ x: 10.4, y: -0.6 })).toBe('10,-1');
	});

	it('calls two points half a centimetre apart the same point', () => {
		expect(pointsEqual({ x: 0, y: 0 }, { x: 0.49, y: 0 })).toBe(true);
		expect(pointsEqual({ x: 0, y: 0 }, { x: 0.5, y: 0 })).toBe(false);
	});

	it('an opening may not go under 10 cm, a wall may go to 1', () => {
		expect(minFor('window')).toBe(10);
		expect(minFor('door')).toBe(10);
		expect(minFor('wall')).toBe(1);
		expect(minFor('open')).toBe(1);
	});

	it('makeSegment rounds the length it is given', () => {
		expect(makeSegment(new Ids(), 'wall', 12.6).length).toEqual({ value: 13, source: 'computed' });
	});
});

describe('lookups', () => {
	const model: Model = fixture('closed-room').model;

	it('finds a wall, a piece on it and a piece anywhere', () => {
		expect(findWall(model, 'wall3')?.id).toBe('wall3');
		expect(findSeg(model, 'wall3', 'seg6')?.idx).toBe(1);
		expect(findSegAnywhere(model, 'seg9')?.wall.id).toBe('wall4');
	});

	it('answers nothing for an id that is not there, or for none at all', () => {
		expect(findWall(model, 'wall99')).toBeNull();
		expect(findWall(model, null)).toBeNull();
		expect(findSeg(model, 'wall3', 'seg1')).toBeNull();
		expect(findSegAnywhere(model, null)).toBeNull();
		expect(findLandmark(model, null)).toBeNull();
	});

	it('finds the landmarks of one wall', () => {
		const marks = fixture('landmarks').model;
		expect(landmarksOn(marks, 'wall1').map((m) => m.id)).toEqual(['mark1', 'mark2']);
		expect(landmarksOn(marks, 'wall2')).toEqual([]);
		expect(findLandmark(marks, 'mark2')?.face).toBe('out');
	});
});

describe('selection', () => {
	it('reads only the id it carries', () => {
		expect(selectedSegId({ segId: 'seg1' })).toBe('seg1');
		expect(selectedSegId({ landmarkId: 'mark1' })).toBeNull();
		expect(selectedLandmarkId({ landmarkId: 'mark1' })).toBe('mark1');
		expect(selectedSegId(null)).toBeNull();
		expect(selectedLandmarkId(null)).toBeNull();
	});
});

describe('cloneModel', () => {
	it('shares nothing with what it copied, and gives a model with no landmarks an empty list', () => {
		const src = fixture('legacy-model').model;
		const copy = cloneModel({ walls: src.walls });
		expect(copy.landmarks).toEqual([]);
		copy.walls[0].to.x = 9999;
		expect(src.walls[0].to.x).not.toBe(9999);
	});
});
