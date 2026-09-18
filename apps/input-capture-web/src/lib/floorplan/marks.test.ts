import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LANDMARK_KIND_IDS } from '@urban-moon/domain-data';
import { MARK_COLOURS, markColour, markColourLiteral } from './marks';

/* The page draws a mark from the custom property; the exported plan, which
   carries no stylesheet, draws it from the literal beside it. The two are one
   colour, so this reads the stylesheet and holds them to that. */
const cssPath = fileURLToPath(new URL('../../app.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

function declaredInCss(token: string): string | null {
	const found = new RegExp(`\\${token}\\s*:\\s*([^;]+);`).exec(css);
	return found ? found[1].trim() : null;
}

describe('the mark colours', () => {
	it('covers every kind of landmark, once each', () => {
		expect(Object.keys(MARK_COLOURS).sort()).toEqual([...LANDMARK_KIND_IDS].sort());
		const tokens = Object.values(MARK_COLOURS).map((c) => c.token);
		expect(new Set(tokens).size).toBe(tokens.length);
		const literals = Object.values(MARK_COLOURS).map((c) => c.literal);
		expect(new Set(literals).size).toBe(literals.length);
	});

	it('says the same colour as the stylesheet, token for literal', () => {
		for (const kind of LANDMARK_KIND_IDS) {
			const { token, literal } = MARK_COLOURS[kind];
			expect(declaredInCss(token), `${token} is not declared in app.css`).not.toBeNull();
			expect(declaredInCss(token)?.toUpperCase()).toBe(literal.toUpperCase());
		}
	});

	it('draws from the custom property on the page and from the literal off it', () => {
		expect(markColour('gas')).toBe('var(--gaz)');
		expect(markColourLiteral('gas')).toBe('#C08A1E');
	});

	it('falls back to ink for a kind with no colour of its own', () => {
		expect(markColour('nothing')).toBe('var(--ink)');
		expect(markColourLiteral('nothing')).toBe('#141414');
	});
});
