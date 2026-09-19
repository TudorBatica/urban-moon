import { describe, expect, it } from 'vitest';
import { HISTORY_CAP, createHistory } from './history';
import type { Model, Wall } from './model';

function wall(id: string, len: number): Wall {
	return {
		id,
		from: { x: 0, y: 0 },
		to: { x: len, y: 0 },
		lengthSource: 'drawn',
		isOpen: false,
		segments: [
			{
				id: id + '-s',
				kind: 'wall',
				length: { value: len, source: 'drawn' },
				offsetFromStart: 0,
				sill: null,
				hinge: null,
				hingeSource: null,
				swing: null,
				swingSource: null
			}
		]
	};
}
const modelOf = (len: number): Model => ({ walls: [wall('a', len)], landmarks: [] });

describe('createHistory', () => {
	it('has nothing to undo or redo when it starts', () => {
		const h = createHistory();
		expect(h.canUndo()).toBe(false);
		expect(h.canRedo()).toBe(false);
		expect(h.undo(modelOf(10))).toBeNull();
		expect(h.redo(modelOf(10))).toBeNull();
	});

	it('gives back the model as it was, and lets redo put it back', () => {
		const h = createHistory();
		h.push(modelOf(100));
		const after = modelOf(200);
		const undone = h.undo(after);
		expect(undone?.walls[0].to.x).toBe(100);
		expect(h.canUndo()).toBe(false);
		expect(h.redo(modelOf(100))?.walls[0].to.x).toBe(200);
	});

	it('keeps a step of its own, not a live reference', () => {
		const h = createHistory();
		const live = modelOf(100);
		h.push(live);
		live.walls[0].to.x = 999;
		expect(h.undo(live)?.walls[0].to.x).toBe(100);
	});

	it('a new step clears what could be redone', () => {
		const h = createHistory();
		h.push(modelOf(100));
		h.undo(modelOf(200));
		expect(h.canRedo()).toBe(true);
		h.push(modelOf(300));
		expect(h.canRedo()).toBe(false);
	});

	it('caps at three hundred steps, dropping the oldest', () => {
		const h = createHistory();
		for (let i = 0; i <= HISTORY_CAP + 5; i++) h.push(modelOf(i));
		let last: Model | null = null;
		let steps = 0;
		while (h.canUndo()) {
			last = h.undo(modelOf(0));
			steps++;
		}
		expect(steps).toBe(HISTORY_CAP);
		/* the six oldest fell off the bottom: the first kept is step six */
		expect(last?.walls[0].to.x).toBe(6);
	});

	it('pop drops the step a cancelled drag pushed', () => {
		const h = createHistory();
		h.push(modelOf(100));
		h.push(modelOf(200));
		h.pop();
		expect(h.undo(modelOf(300))?.walls[0].to.x).toBe(100);
	});

	it('clear forgets both sides', () => {
		const h = createHistory();
		h.push(modelOf(100));
		h.undo(modelOf(200));
		h.clear();
		expect(h.canUndo()).toBe(false);
		expect(h.canRedo()).toBe(false);
	});
});
