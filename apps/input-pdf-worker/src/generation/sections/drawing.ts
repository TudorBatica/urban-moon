import { landmarkKindOf, type RoomLandmark, type RoomSnapshot } from '@urban-moon/domain-data';
import type { ManifestDrawing } from '@urban-moon/domain-data/schema';
import { drawContained } from '../images';
import type { Writer } from '../layout';
import { COLOR, CONTENT_WIDTH, MARGIN, TYPE } from '../theme';

const SOURCE: Record<string, string> = { typed: 'măsurat', drawn: 'desenat', computed: 'calculat' };

const FACE: Record<RoomLandmark['face'], string> = {
	in: 'pe partea camerei',
	out: 'pe partea cealaltă a peretelui'
};

const gap = (cm: number): string => (cm === 0 ? 'lipit' : `${cm} cm`);

/** The landmarks as the architect reads them, by wall and then along each wall. */
function landmarkLines(room: RoomSnapshot): string[] {
	const walls = new Map(room.walls.map((w) => [w.id, w]));
	return (room.landmarks ?? [])
		.flatMap((mark) => {
			const wall = walls.get(mark.wallId);
			return wall ? [{ mark, wall }] : [];
		})
		.sort((a, b) => a.wall.index - b.wall.index || a.mark.offsetFromStartCm - b.mark.offsetFromStartCm)
		.map(
			({ mark, wall }) =>
				`${landmarkKindOf(mark.kind)?.label ?? mark.kind}: peretele ${wall.index + 1} (${wall.heading}), ${FACE[mark.face]}, la ${gap(mark.gapBeforeCm)} și ${gap(mark.gapAfterCm)} de elementele vecine`
		);
}

export async function drawDrawing(w: Writer, drawing: ManifestDrawing, png: Uint8Array): Promise<void> {
	w.addPage();
	w.text('Planul desenat de client', TYPE.section, { after: 4 });
	w.text('Desenat în chestionar, după dimensiunile măsurate de client.', TYPE.body, { after: 16 });

	const image = await w.doc.embedPng(png);
	const boxHeight = 380;
	w.page.drawRectangle({ x: MARGIN.left, y: w.y - boxHeight, width: CONTENT_WIDTH, height: boxHeight, color: COLOR.white, borderColor: COLOR.hair, borderWidth: 0.5 });
	drawContained(w.page, { image, orientation: 1 }, { x: MARGIN.left + 10, y: w.y - boxHeight + 10, width: CONTENT_WIDTH - 20, height: boxHeight - 20 });
	w.space(boxHeight + 18);

	const { room } = drawing;
	const doors = room.openings.filter((o) => o.kind === 'door').length;
	const windows = room.openings.filter((o) => o.kind === 'window').length;
	const landmarks = landmarkLines(room);
	w.text(
		[
			`Înălțime tavan: ${room.ceilingHeightCm ? `${room.ceilingHeightCm} cm` : 'necompletată'}`,
			`Contur închis: ${room.closed ? 'da' : 'nu'}`,
			`Pereți: ${room.walls.length}`,
			`Uși: ${doors}`,
			`Ferestre: ${windows}`,
			...(landmarks.length ? [`Repere: ${landmarks.length}`] : [])
		].join('  ·  '),
		TYPE.answer,
		{ after: 12 }
	);

	w.text('Pereți', TYPE.question, { after: 4 });
	for (const wall of room.walls) {
		const openings = wall.segments
			.filter((s) => s.kind !== 'wall')
			.map((s) => `${s.kind === 'door' ? 'ușă' : s.kind === 'window' ? 'fereastră' : 'gol'} ${s.lengthCm.value} cm`)
			.join(', ');
		w.text(
			`Peretele ${wall.index + 1} (${wall.heading}): ${wall.lengthCm.value} cm, ${SOURCE[wall.lengthCm.source] ?? wall.lengthCm.source}${openings ? ` — ${openings}` : ''}`,
			TYPE.answer
		);
	}
	if (landmarks.length) {
		w.space(8);
		w.text('Repere', TYPE.question, { after: 4 });
		for (const line of landmarks) w.text(line, TYPE.answer);
	}
	if (room.unanswered.length) {
		w.space(8);
		w.text(`Necompletate: ${room.unanswered.join(', ')}`, { ...TYPE.answer, color: COLOR.grey });
	}
}
