/* Tool glyphs and the two view glyphs: 20x20, 1.5px, round caps, no fill.
   The paths are shared by the editor's plates and by anything else that has
   to name a tool, so one tool has one drawing wherever it appears. */

export const GLYPH: Record<string, string> = {
	select: '<path d="M5 3.5l10 5.8-4.4 1.1L8.4 15z"/>',
	wall: '<path d="M3 16.5V3.5h13.5"/><path d="M7 16.5V7.5h9.5"/>',
	open: '<path d="M3.5 10h13" stroke-dasharray="2 2.6"/><path d="M3 6.5v7M17 6.5v7"/>',
	window: '<path d="M2.5 7.5h15M2.5 10h15M2.5 12.5h15M2.5 7.5v5M17.5 7.5v5"/>',
	door: '<path d="M4 16.5h3.5M4 16.5V5.5"/><path d="M4 5.5a11 11 0 0111 11" stroke-dasharray="2 2"/>',
	undo: '<path d="M7.5 4.5L4 8l3.5 3.5"/><path d="M4 8h8a4 4 0 010 8H9"/>',
	redo: '<path d="M12.5 4.5L16 8l-3.5 3.5"/><path d="M16 8H8a4 4 0 000 8h3"/>',
	zoomIn: '<path d="M10 4.5v11M4.5 10h11"/>',
	zoomOut: '<path d="M4.5 10h11"/>',
	fit: '<path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/>',
	rotate: '<path d="M15.5 9a5.5 5.5 0 10-1.6 4.4"/><path d="M15.8 4.5V9h-4.5"/>',
	del: '<path d="M4.5 6h11M8 6V4h4v2M6 6l.8 10h6.4L14 6"/>'
};

/** The glyph as a decorative `<svg>`; an unknown name draws nothing. */
export function glyphSvg(name: string): string {
	if (!GLYPH[name]) return '';
	return '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' + GLYPH[name] + '</svg>';
}
