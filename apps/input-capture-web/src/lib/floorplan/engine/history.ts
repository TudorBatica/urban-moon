/**
 * Undo and redo over whole models. Every step is a deep clone, so a step is
 * never changed from under the stack by the edit that follows it.
 *
 * A drag pushes one step when it commits and re-applies every move from its own
 * base; a cancelled drag pops that step, because undoing to the very drawing it
 * started from is not a step the client ever asked for.
 */

import { cloneModel, type EditorLandmark, type Model, type Wall } from './model';

/** The most steps kept: older ones fall off the bottom. */
export const HISTORY_CAP = 300;

export interface History {
	push(model: { walls: Wall[]; landmarks?: EditorLandmark[] }): void;
	/** the model before the last step, or null where there is none */
	undo(model: { walls: Wall[]; landmarks?: EditorLandmark[] }): Model | null;
	redo(model: { walls: Wall[]; landmarks?: EditorLandmark[] }): Model | null;
	/** drops the step just pushed, for a gesture that came to nothing */
	pop(): void;
	clear(): void;
	canUndo(): boolean;
	canRedo(): boolean;
}

export function createHistory(): History {
	let undoStack: Model[] = [];
	let redoStack: Model[] = [];
	return {
		push(model) {
			undoStack.push(cloneModel(model));
			if (undoStack.length > HISTORY_CAP) undoStack.shift();
			redoStack.length = 0;
		},
		undo(model) {
			const prev = undoStack.pop();
			if (!prev) return null;
			redoStack.push(cloneModel(model));
			return prev;
		},
		redo(model) {
			const next = redoStack.pop();
			if (!next) return null;
			undoStack.push(cloneModel(model));
			return next;
		},
		pop() {
			undoStack.pop();
		},
		clear() {
			undoStack = [];
			redoStack = [];
		},
		canUndo() {
			return undoStack.length > 0;
		},
		canRedo() {
			return redoStack.length > 0;
		}
	};
}
