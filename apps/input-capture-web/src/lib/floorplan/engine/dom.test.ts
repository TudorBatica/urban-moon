import { describe, expect, it } from 'vitest';
import { TEMPLATE } from './template';
import { loadFixtures } from './fixtures/load';

/**
 * No DOM library is installed, so the template is checked as the string it is:
 * every test id it carries was recorded in every case the old engine was
 * measured on, because the template is what every mounting starts from.
 */
function testidsOf(markup: string): string[] {
	return [...markup.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]).sort();
}

describe('TEMPLATE', () => {
	it('carries the ids every lookup in the editor resolves', () => {
		expect(testidsOf(TEMPLATE)).toEqual([
			'confirm-dialog',
			'confirm-no',
			'confirm-yes',
			'editor-svg',
			'hint',
			'stage'
		]);
	});

	it('names every element the editor binds', () => {
		for (const id of [
			'app',
			'stage',
			'roomSvg',
			'ctrlLayer',
			'toolPlate',
			'hintLine',
			'histPlate',
			'viewPlate',
			'confirmDialog',
			'confirmDialogText',
			'confirmYesBtn',
			'confirmNoBtn'
		]) {
			expect(TEMPLATE).toContain('id="' + id + '"');
		}
	});

	it('is a subset of every recorded case, which was measured with it on screen', () => {
		const ours = testidsOf(TEMPLATE);
		for (const f of loadFixtures()) {
			for (const id of ours) expect(f.testids, f.name).toContain(id);
		}
	});
});
