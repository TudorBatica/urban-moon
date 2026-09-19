import { describe, expect, it } from 'vitest';
import { hintFor, type HintInput } from './hint';
import { DRAWING_TOOLS, type ToolDef } from './tools';

const LANDMARK_TOOLS: ToolDef[] = [
	DRAWING_TOOLS[0],
	{ id: 'landmark', label: 'Calorifer', key: '', gesture: 'tap', makes: 'landmark', needsWall: true }
];

function input(over: Partial<HintInput> = {}): HintInput {
	return {
		hintState: null,
		refusedTool: false,
		drag: null,
		zoomHintOn: false,
		mode: 'plan',
		tools: DRAWING_TOOLS,
		activeTool: 'select',
		landmarkKind: null,
		landmarkFocused: false,
		anyLandmarkShown: false,
		focus: null,
		justMade: null,
		hasWalls: true,
		touchWords: false,
		...over
	};
}
const state = (over: Partial<HintInput>) => hintFor(input(over)).state;

describe('hintFor', () => {
	it('an override the host names wins, and one with no line shows nothing', () => {
		expect(hintFor(input({ hintState: 'saving' }))).toEqual({
			state: 'saving',
			text: 'Se salvează…'
		});
		expect(hintFor(input({ hintState: 'nothing-like-this' }))).toEqual({
			state: 'nothing-like-this',
			text: ''
		});
	});

	it('an override for a line that names a landmark has no kind to name', () => {
		expect(hintFor(input({ hintState: 'landmarkOn', landmarkKind: 'radiator' })).text).toBe(
			'Dă clic pe peretele unde e .'
		);
	});

	it('a tool that cannot be used yet says what to do first', () => {
		expect(hintFor(input({ refusedTool: true, hasWalls: false }))).toEqual({
			state: 'no-wall',
			text: 'Desenează întâi un perete.'
		});
	});

	it('a live stroke says how to end it, in either words', () => {
		expect(hintFor(input({ drag: { kind: 'draw' } })).text).toBe(
			'Dă drumul butonului ca să termini peretele. Esc renunță.'
		);
		expect(hintFor(input({ drag: { kind: 'draw' }, touchWords: true })).text).toBe(
			'Ridică degetul ca să termini peretele.'
		);
	});

	it('a sliding opening names itself, and says so again past a free end', () => {
		expect(
			hintFor(input({ drag: { kind: 'opening', slidingKind: 'door', pastFreeEnd: false } }))
		).toEqual({
			state: 'opening-slides',
			text: 'Ușa merge pe perete și după colț, cât timp peretele continuă.'
		});
		expect(
			hintFor(input({ drag: { kind: 'opening', slidingKind: 'window', pastFreeEnd: true } }))
		).toEqual({
			state: 'opening-past-end',
			text: 'Fereastra poate trece de capătul liber. Apoi continuă peretele din capătul ei.'
		});
		/* a piece the drag can no longer find is spoken of as a window */
		expect(
			hintFor(input({ drag: { kind: 'opening', slidingKind: null, pastFreeEnd: false } })).text
		).toMatch(/^Fereastra/);
	});

	it('the zoom line comes before anything the canvas is on', () => {
		expect(state({ zoomHintOn: true, focus: { kind: 'wall', atFreeEnd: false } })).toBe('zoom');
		expect(hintFor(input({ zoomHintOn: true, touchWords: true })).text).toBe(
			'Apropie sau depărtează două degete ca să mărești. Cu două degete muți planul.'
		);
	});

	it('each making tool says where to use it', () => {
		expect(state({ activeTool: 'wall' })).toBe('wall-on');
		expect(state({ activeTool: 'open' })).toBe('open-on');
		expect(state({ activeTool: 'window' })).toBe('window-on');
		expect(state({ activeTool: 'door' })).toBe('door-on');
		expect(hintFor(input({ activeTool: 'door', touchWords: true })).text).toBe(
			'Atinge peretele pe care e ușa.'
		);
	});

	it('names the piece the canvas is on', () => {
		expect(state({ focus: { kind: 'window', atFreeEnd: false } })).toBe('window-focus');
		expect(state({ focus: { kind: 'door', atFreeEnd: false } })).toBe('door-focus');
		expect(state({ focus: { kind: 'open', atFreeEnd: false } })).toBe('open-focus');
		expect(state({ focus: { kind: 'wall', atFreeEnd: false } })).toBe('wall-focus');
		expect(state({ focus: { kind: 'wall', atFreeEnd: false }, justMade: 'wall' })).toBe('wall-made');
		expect(hintFor(input({ focus: { kind: 'wall', atFreeEnd: false }, touchWords: true })).text).toBe(
			'Trage peretele ca să-l muți. Atinge numărul ca să schimbi lungimea.'
		);
	});

	it('an opening resting past a free end says what joins it next', () => {
		expect(state({ focus: { kind: 'door', atFreeEnd: true } })).toBe('opening-past-end');
		/* a plain piece at a free end is still just the piece in focus */
		expect(state({ focus: { kind: 'wall', atFreeEnd: true } })).toBe('wall-focus');
	});

	it('an empty canvas asks for the first wall, and a full one with nothing in focus says nothing', () => {
		expect(hintFor(input({ hasWalls: false })).state).toBe('empty');
		expect(hintFor(input({ hasWalls: false, touchWords: true })).text).toBe(
			'Alege <b>Perete</b>, apoi trage cu degetul ca să faci primul perete.'
		);
		expect(hintFor(input({}))).toEqual({ state: 'idle', text: '' });
	});

	it('the landmark step speaks only of squares', () => {
		const mark = { mode: 'landmarks' as const, tools: LANDMARK_TOOLS, landmarkKind: 'radiator' };
		expect(hintFor(input({ ...mark, activeTool: 'landmark' }))).toEqual({
			state: 'landmark-on',
			text: 'Dă clic pe peretele unde e caloriferul.'
		});
		expect(hintFor(input({ ...mark, activeTool: 'landmark', touchWords: true })).text).toBe(
			'Atinge peretele unde e caloriferul.'
		);
		expect(state({ ...mark, landmarkFocused: true })).toBe('landmark-focus');
		expect(state({ ...mark, anyLandmarkShown: true })).toBe('landmark-idle');
		expect(hintFor(input({ ...mark, anyLandmarkShown: true, touchWords: true })).text).toBe(
			'Atinge un pătrat ca să-l muți sau să-l ștergi.'
		);
		/* nothing placed yet and the tool down: a line pointing at squares would point at none */
		expect(hintFor(input({ ...mark }))).toEqual({ state: 'idle', text: '' });
		/* a piece of the plan is never spoken of on this step */
		expect(state({ ...mark, focus: { kind: 'door', atFreeEnd: false } })).toBe('idle');
	});
});
