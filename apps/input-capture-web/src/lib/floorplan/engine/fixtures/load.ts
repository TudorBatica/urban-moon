/**
 * The recorded cases: one JSON per case, each the model, the room snapshot, the
 * plan markup and the test ids the editor produced for it. They are what the
 * pure modules are held to, so a reader of a test can see the whole scene the
 * numbers come from.
 */

import { readFileSync, readdirSync } from 'node:fs';
import type { RoomSnapshot } from '$lib/types';
import type { Model, Selection } from '../model';
import type { Box } from '../view';

export interface Fixture {
	name: string;
	mode: 'plan' | 'landmarks';
	landmarkKind: string | null;
	selection: Selection;
	/** the gesture of the tool that was on, which decides what the plan offers to the pointer */
	toolGesture: 'none' | 'stroke' | 'tap';
	/** screen px per cm, as the editor measured it when the case was recorded */
	scale: number;
	/** how much of its designed size a label was drawn at, at that zoom */
	labelScale: number;
	visibleBox: Box;
	model: Model;
	room: RoomSnapshot;
	/** the editor's `#roomSvg.innerHTML` */
	svg: string;
	testids: string[];
}

const DIR = new URL('.', import.meta.url).pathname;

export function loadFixtures(): Fixture[] {
	return readdirSync(DIR)
		.filter((f) => f.endsWith('.json'))
		.sort()
		.map((f) => JSON.parse(readFileSync(DIR + f, 'utf8')) as Fixture);
}

export function fixture(name: string): Fixture {
	const found = loadFixtures().find((f) => f.name === name);
	if (!found) throw new Error('no fixture named ' + name);
	return found;
}
