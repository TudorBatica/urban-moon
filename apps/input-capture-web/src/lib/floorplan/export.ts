/* A room snapshot rendered as a printable plan, in the same look the
   editor's own canvas draws: a solid ink band for a wall, a cut-out for a
   window or a door, a dashed grey line for a side with nothing built.
   Pure string building — roomToSvg has no DOM dependency at all, so it is
   unit-testable in node. Only svgToPngDataUrl needs a browser. */

import { LANDMARK_SIZE_CM, landmarkKindOf } from '@urban-moon/domain-data';
import type { RoomSegment, RoomSnapshot, RoomWall } from '$lib/types';
import { markColourLiteral } from './marks';

type Pt = [number, number];

const WALL_T = 20; // cm — the same solid band thickness the editor draws
const WELD_EPS = 0.6; // cm — two endpoints this close are the same point

/* The same tokens the editor's own canvas draws in. */
const INK = '#141414';
const HAIR = '#E0DFD9';
const GREY = '#7A7975';
const PAPER = '#FFFFFF';
const SANS = "Figtree, 'Helvetica Neue', Arial, sans-serif";

function esc(s: string | number): string {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
function n(v: number): number {
	return Math.round(v * 1000) / 1000;
}
function add(a: Pt, b: Pt): Pt {
	return [a[0] + b[0], a[1] + b[1]];
}
function mul(a: Pt, k: number): Pt {
	return [a[0] * k, a[1] * k];
}
function same(a: Pt, b: Pt): boolean {
	return Math.abs(a[0] - b[0]) < WELD_EPS && Math.abs(a[1] - b[1]) < WELD_EPS;
}
function poly(pts: Pt[]): string {
	return pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ');
}

function dirOf(w: { from: Pt; to: Pt }): Pt {
	const dx = w.to[0] - w.from[0];
	const dy = w.to[1] - w.from[1];
	const L = Math.hypot(dx, dy) || 1;
	return [dx / L, dy / L];
}
function normOf(d: Pt): Pt {
	return [-d[1], d[0]];
}

interface Run {
	solid: boolean;
	seg: RoomSegment;
	start: number;
	end: number;
}

/* Merge a wall's segments into runs of the same "solid or not" nature, so a
   stretch of plain wall broken by nothing renders as one poché block. */
function runsOf(wall: RoomWall): Run[] {
	const segs = wall.segments || [];
	const out: Run[] = [];
	let cur: Run | null = null;
	for (const s of segs) {
		const solid = s.kind === 'wall';
		const off = s.offsetFromStartCm;
		const len = s.lengthCm ? s.lengthCm.value : 0;
		if (cur && cur.solid === solid && solid) {
			cur.end = off + len;
			continue;
		}
		cur = { solid, seg: s, start: off, end: off + len };
		out.push(cur);
	}
	return out;
}

/** Render a RoomSnapshot as a standalone SVG document string. Pure. */
export function roomToSvg(room: RoomSnapshot, opts?: { widthPx?: number }): string {
	const widthPx = opts?.widthPx || 1200;
	const walls: RoomWall[] = room?.walls ?? [];

	/* ---- fit ---------------------------------------------------------- */
	let pts: Pt[] = [];
	walls.forEach((w) => {
		pts.push(w.from);
		pts.push(w.to);
	});
	if (!pts.length) pts = [[0, 0] as Pt, [100, 100] as Pt];
	let minX = pts[0][0];
	let maxX = pts[0][0];
	let minY = pts[0][1];
	let maxY = pts[0][1];
	pts.forEach((p) => {
		minX = Math.min(minX, p[0]);
		maxX = Math.max(maxX, p[0]);
		minY = Math.min(minY, p[1]);
		maxY = Math.max(maxY, p[1]);
	});
	const roomW = Math.max(maxX - minX, 1);
	const roomH = Math.max(maxY - minY, 1);
	// Margin has to hold the band, the dimension lane and its label, plus the
	// footer note — expressed as a fraction of the plan's own extent so it
	// scales the same at every room size (SPEC-lessons #14).
	const margin = Math.max(WALL_T * 2.6, Math.max(roomW, roomH) * 0.18);
	const vbX = minX - margin;
	const vbY = minY - margin;
	const vbW = roomW + 2 * margin;
	const vbH = roomH + 2 * margin + margin * 0.45; // footer strip
	const heightPx = Math.round((widthPx * vbH) / vbW);
	const k = vbW / widthPx; // cm per rendered px
	const px = (v: number): number => v * k; // px -> cm, for strokes and type

	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;

	const body: string[] = [];
	const dims: string[] = [];

	/* ---- helpers ------------------------------------------------------ */
	function isWelded(pt: Pt, selfId: string): boolean {
		return walls.some((w) => w.id !== selfId && (same(w.from, pt) || same(w.to, pt)));
	}
	function segPoints(w: RoomWall, offset: number, len: number): [Pt, Pt] {
		const d = dirOf(w);
		return [add(w.from, mul(d, offset)), add(w.from, mul(d, offset + len))];
	}
	function bandPoly(p0: Pt, p1: Pt, nrm: Pt, t: number): string {
		const h = mul(nrm, t / 2);
		return poly([add(p0, h), add(p1, h), add(p1, mul(h, -1)), add(p0, mul(h, -1))]);
	}
	function textEl(
		x: number,
		y: number,
		str: string,
		size: number,
		fill: string,
		anchor?: string,
		italic?: boolean
	): string {
		return (
			`<text x="${n(x)}" y="${n(y)}" font-family="${esc(SANS)}" font-size="${n(size)}"` +
			` fill="${fill}" text-anchor="${anchor || 'middle'}"` +
			(italic ? ' font-style="italic"' : '') +
			` dominant-baseline="middle">${esc(str)}</text>`
		);
	}
	/* One dimension: extension lines off the wall, a run between them, a 45°
	   tick at each end, and the number on a small paper patch so it stays
	   readable wherever it lands. */
	function dimension(
		p0: Pt,
		p1: Pt,
		nrm: Pt,
		outCm: number,
		label: string,
		typed: boolean
	): void {
		const colour = typed ? INK : GREY;
		const o = mul(nrm, outCm);
		const a = add(p0, o);
		const b = add(p1, o);
		const e0 = add(p0, mul(nrm, WALL_T / 2 + px(2)));
		const e1 = add(p1, mul(nrm, WALL_T / 2 + px(2)));
		const over = mul(nrm, outCm + px(5));
		const sw = n(px(1));
		const t = px(4.5);
		const d = dirOf({ from: p0, to: p1 });
		const tick: Pt = [(d[0] + nrm[0]) * t, (d[1] + nrm[1]) * t];
		const g: string[] = [];
		g.push(
			`<line x1="${n(e0[0])}" y1="${n(e0[1])}" x2="${n(add(p0, over)[0])}" y2="${n(add(p0, over)[1])}" stroke="${colour}" stroke-width="${sw}" opacity="0.55"/>`
		);
		g.push(
			`<line x1="${n(e1[0])}" y1="${n(e1[1])}" x2="${n(add(p1, over)[0])}" y2="${n(add(p1, over)[1])}" stroke="${colour}" stroke-width="${sw}" opacity="0.55"/>`
		);
		g.push(
			`<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${colour}" stroke-width="${sw}"/>`
		);
		g.push(
			`<line x1="${n(a[0] - tick[0])}" y1="${n(a[1] - tick[1])}" x2="${n(a[0] + tick[0])}" y2="${n(a[1] + tick[1])}" stroke="${colour}" stroke-width="${n(px(1.2))}"/>`
		);
		g.push(
			`<line x1="${n(b[0] - tick[0])}" y1="${n(b[1] - tick[1])}" x2="${n(b[0] + tick[0])}" y2="${n(b[1] + tick[1])}" stroke="${colour}" stroke-width="${n(px(1.2))}"/>`
		);
		const mid: Pt = [
			(a[0] + b[0]) / 2 + nrm[0] * px(11),
			(a[1] + b[1]) / 2 + nrm[1] * px(11)
		];
		const fs = px(15);
		const w = label.length * fs * 0.62 + px(8);
		const h = fs * 1.5;
		g.push(
			`<rect x="${n(mid[0] - w / 2)}" y="${n(mid[1] - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(px(3))}" fill="${PAPER}" stroke="${HAIR}" stroke-width="${n(px(1))}"/>`
		);
		g.push(textEl(mid[0], mid[1], label, fs, colour, undefined, !typed));
		dims.push(`<g data-dim="${esc(label)}">${g.join('')}</g>`);
	}

	/* ---- the plan ----------------------------------------------------- */
	walls.forEach((wall) => {
		const d = dirOf(wall);
		const nrm = normOf(d);
		const mid: Pt = [(wall.from[0] + wall.to[0]) / 2, (wall.from[1] + wall.to[1]) / 2];
		// Outward = away from the room's own centre, so wall dimensions sit
		// outside the plan and opening dimensions inside it. Never overlap.
		const away = (mid[0] - cx) * nrm[0] + (mid[1] - cy) * nrm[1];
		const out = away >= 0 ? nrm : mul(nrm, -1);
		const inn = mul(out, -1);
		const startWelded = isWelded(wall.from, wall.id);
		const endWelded = isWelded(wall.to, wall.id);
		const total = wall.lengthCm
			? wall.lengthCm.value
			: Math.round(Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]));

		runsOf(wall).forEach((run) => {
			const len = run.end - run.start;
			if (len <= 0) return;
			const pp = segPoints(wall, run.start, len);
			let p0 = pp[0];
			let p1 = pp[1];
			if (run.solid) {
				// Extend into a corner only at an end that is actually welded, so a
				// free end stays flush and square exactly at its own point.
				if (run.start <= 0.01 && startWelded) p0 = add(p0, mul(d, -WALL_T / 2));
				if (Math.abs(run.end - total) < 0.5 && endWelded) p1 = add(p1, mul(d, WALL_T / 2));
				body.push(`<polygon points="${bandPoly(p0, p1, nrm, WALL_T)}" fill="${INK}"/>`);
				return;
			}
			const s = run.seg;
			const half = mul(nrm, WALL_T / 2);
			// The opening is a hole in the band: paper first, then its own symbol.
			body.push(`<polygon points="${bandPoly(p0, p1, nrm, WALL_T)}" fill="${PAPER}" stroke="none"/>`);
			if (s.kind === 'open') {
				// A side with nothing built: a dashed grey line, a tick at each end.
				body.push(
					`<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}" stroke="${GREY}" stroke-width="${n(px(2))}" stroke-dasharray="${n(px(8))} ${n(px(6))}"/>`
				);
				[p0, p1].forEach((p) => {
					body.push(
						`<line x1="${n(p[0] + half[0])}" y1="${n(p[1] + half[1])}" x2="${n(p[0] - half[0])}" y2="${n(p[1] - half[1])}" stroke="${GREY}" stroke-width="${n(px(1.4))}"/>`
					);
				});
			} else if (s.kind === 'window') {
				// Glazing in plan: three thin lines the LENGTH of the opening — the
				// two band faces plus its centreline.
				[half, [0, 0] as Pt, mul(half, -1)].forEach((o) => {
					body.push(
						`<line x1="${n(p0[0] + o[0])}" y1="${n(p0[1] + o[1])}" x2="${n(p1[0] + o[0])}" y2="${n(p1[1] + o[1])}" stroke="${INK}" stroke-width="${n(px(1.4))}"/>`
					);
				});
				[p0, p1].forEach((p) => {
					body.push(
						`<line x1="${n(p[0] + half[0])}" y1="${n(p[1] + half[1])}" x2="${n(p[0] - half[0])}" y2="${n(p[1] - half[1])}" stroke="${INK}" stroke-width="${n(px(1.4))}"/>`
					);
				});
			} else if (s.kind === 'door') {
				// Jambs across the band's full thickness, then the leaf and its arc.
				[p0, p1].forEach((p) => {
					body.push(
						`<line x1="${n(p[0] + half[0])}" y1="${n(p[1] + half[1])}" x2="${n(p[0] - half[0])}" y2="${n(p[1] - half[1])}" stroke="${INK}" stroke-width="${n(px(1.8))}"/>`
					);
				});
				const hingePt = s.hinge === 'end' ? p1 : p0;
				const leafDir = s.hinge === 'end' ? mul(d, -1) : d;
				// 'in' is the wall normal's positive side, exactly as the editor draws it.
				const swingDir = s.swing === 'out' ? mul(nrm, -1) : nrm;
				const tip = add(hingePt, mul(swingDir, len));
				const far = add(hingePt, mul(leafDir, len));
				body.push(
					`<line x1="${n(hingePt[0])}" y1="${n(hingePt[1])}" x2="${n(tip[0])}" y2="${n(tip[1])}" stroke="${INK}" stroke-width="${n(px(1.8))}"/>`
				);
				const sweep = leafDir[0] * swingDir[1] - leafDir[1] * swingDir[0] > 0 ? 1 : 0;
				body.push(
					`<path d="M ${n(far[0])} ${n(far[1])} A ${n(len)} ${n(len)} 0 0 ${sweep} ${n(tip[0])} ${n(tip[1])}" fill="none" stroke="${INK}" stroke-width="${n(px(1))}" stroke-dasharray="${n(px(4))} ${n(px(4))}"/>`
				);
			}
			// One dimension per opening, on the inner side of the wall.
			const w = s.lengthCm ? s.lengthCm.value : Math.round(len);
			dimension(pp[0], pp[1], inn, WALL_T / 2 + px(24), `${w} cm`, s.lengthCm?.source === 'typed');
		});

		// One dimension per wall, outside the plan.
		dimension(wall.from, wall.to, out, WALL_T / 2 + px(38), `${total} cm`, wall.lengthCm?.source === 'typed');
	});

	/* ---- the landmarks ------------------------------------------------ */
	/* As on the canvas: the coloured square against its wall on the face it is
	   on, with its name on a small white chip in the same colour. No distances
	   — the architect reads those in the list beside the plan. */
	const marks: string[] = [];
	(room?.landmarks ?? []).forEach((mark) => {
		const wall = walls.find((w) => w.id === mark.wallId);
		if (!wall) return;
		const d = dirOf(wall);
		const nrm = normOf(d);
		const sign = mark.face === 'out' ? -1 : 1;
		const half = LANDMARK_SIZE_CM / 2;
		const on = add(wall.from, mul(d, mark.offsetFromStartCm + half));
		const centre = add(on, mul(nrm, sign * (WALL_T / 2 + half)));
		const colour = markColourLiteral(mark.kind);
		const corners: Pt[] = [
			add(add(centre, mul(d, -half)), mul(nrm, -half)),
			add(add(centre, mul(d, half)), mul(nrm, -half)),
			add(add(centre, mul(d, half)), mul(nrm, half)),
			add(add(centre, mul(d, -half)), mul(nrm, half))
		];
		marks.push(`<polygon points="${poly(corners)}" fill="${colour}"/>`);

		const label = landmarkKindOf(mark.kind)?.label ?? mark.kind;
		const fs = px(15);
		const w = label.length * fs * 0.62 + px(14);
		const h = fs * 1.6;
		const flat = Math.abs(d[0]) > Math.abs(d[1]);
		const away: Pt = [nrm[0] * sign, nrm[1] * sign];
		const lift = half + px(6) + (flat ? h : w) / 2;
		const at = add(centre, mul(away, lift));
		marks.push(
			`<rect x="${n(at[0] - w / 2)}" y="${n(at[1] - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(px(3))}" fill="${PAPER}" stroke="${colour}" stroke-width="${n(px(1))}"/>`
		);
		marks.push(textEl(at[0], at[1], label, fs, colour));
	});

	/* ---- footer ------------------------------------------------------- */
	const footY = maxY + margin + margin * 0.22;
	let note = 'All dimensions in cm';
	if (room && room.ceilingHeightCm != null) note += `   ·   Ceiling ${room.ceilingHeightCm} cm`;
	if (room && room.closed === false) note += '   ·   outline not closed';
	const footer = textEl(vbX + px(18), footY, note, px(16), GREY, 'start');

	/* No `<?xml …?>` prolog: the string is embedded inline as often as it is
	   saved as a file, and a prolog inside an HTML document parses as a bogus
	   comment. */
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${widthPx}" height="${heightPx}"` +
		` viewBox="${n(vbX)} ${n(vbY)} ${n(vbW)} ${n(vbH)}">` +
		`<rect x="${n(vbX)}" y="${n(vbY)}" width="${n(vbW)}" height="${n(vbH)}" fill="${PAPER}"/>` +
		`<g data-layer="plan">${body.join('')}</g>` +
		`<g data-layer="dimensions">${dims.join('')}</g>` +
		`<g data-layer="landmarks">${marks.join('')}</g>` +
		`<g data-layer="note">${footer}</g>` +
		'</svg>'
	);
}

/** Raster the SVG string to a PNG data URL. Browser only (Image + canvas). */
export async function svgToPngDataUrl(svg: string, pixelRatio = 2): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		if (typeof document === 'undefined' || typeof Image === 'undefined') {
			reject(new Error('svgToPngDataUrl is browser-only'));
			return;
		}
		const mw = /\bwidth="(\d+(?:\.\d+)?)"/.exec(svg);
		const mh = /\bheight="(\d+(?:\.\d+)?)"/.exec(svg);
		const w = mw ? parseFloat(mw[1]) : 1200;
		const h = mh ? parseFloat(mh[1]) : 900;
		const img = new Image();
		img.decoding = 'sync';
		img.onload = (): void => {
			try {
				const c = document.createElement('canvas');
				c.width = Math.max(1, Math.round(w * pixelRatio));
				c.height = Math.max(1, Math.round(h * pixelRatio));
				const ctx = c.getContext('2d');
				if (!ctx) throw new Error('svgToPngDataUrl: no 2d context');
				ctx.fillStyle = PAPER;
				ctx.fillRect(0, 0, c.width, c.height);
				ctx.drawImage(img, 0, 0, c.width, c.height);
				resolve(c.toDataURL('image/png'));
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		};
		img.onerror = (): void => reject(new Error('svgToPngDataUrl: the SVG failed to decode'));
		// A data: URL rather than a blob: URL — no object to revoke, and it
		// keeps the image same-origin so the canvas never becomes tainted.
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
	});
}
