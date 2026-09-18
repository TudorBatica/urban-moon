/* The one map from a landmark kind to its colour. The token is what the canvas
   and the plates draw in, so the page's own custom properties stay the source
   on screen; the literal is for the exported plan, which is built as a
   standalone SVG string with no page to read a custom property from. */

import type { LandmarkKind } from '$lib/types';

export interface MarkColour {
	/** the custom property `app.css` defines */
	token: string;
	/** the same colour as a literal, for a document that carries no stylesheet */
	literal: string;
}

export const MARK_COLOURS: Record<LandmarkKind, MarkColour> = {
	water: { token: '--apa', literal: '#2F6F9F' },
	gas: { token: '--gaz', literal: '#C08A1E' },
	boiler: { token: '--centrala', literal: '#3E7D5A' },
	airConditioning: { token: '--aer', literal: '#6E63A6' },
	fireplace: { token: '--semineu', literal: '#B4553A' },
	radiator: { token: '--calorifer', literal: '#8A6244' },
	hoodVent: { token: '--hota', literal: '#9B4A86' }
};

const INK = '#141414';

/** The colour to paint a mark with on screen; a kind with no colour falls back to ink. */
export function markColour(kind: string): string {
	const found = MARK_COLOURS[kind as LandmarkKind];
	return found ? `var(${found.token})` : 'var(--ink)';
}

/** The same colour as a literal, for the exported plan. */
export function markColourLiteral(kind: string): string {
	const found = MARK_COLOURS[kind as LandmarkKind];
	return found ? found.literal : INK;
}
