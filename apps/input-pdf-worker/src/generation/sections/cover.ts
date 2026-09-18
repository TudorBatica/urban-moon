import { setCharacterSpacing } from 'pdf-lib';
import { roomOf } from '@urban-moon/domain-data';
import type { Manifest } from '@urban-moon/domain-data/schema';
import { drawWrapped, type Writer } from '../layout';
import { A4, COLOR, CONTENT_WIDTH, MARGIN, TYPE } from '../theme';

const dateRo = (iso: string): string =>
	new Intl.DateTimeFormat('ro-RO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Bucharest' }).format(
		new Date(iso)
	);

export function drawCover(w: Writer, m: Manifest): void {
	const page = w.addPage();
	const { sans } = w.fonts;

	page.pushOperators(setCharacterSpacing(2.4));
	page.drawText('URBAN MOON', { x: MARGIN.left, y: A4.height - MARGIN.top, size: 10, font: sans, color: COLOR.ink });
	page.pushOperators(setCharacterSpacing(0));

	w.y = A4.height - 200;
	w.text('Răspunsurile clientului', TYPE.title, { after: 10 });
	w.text(m.client.name, { font: 'serif', size: 20, color: COLOR.soft }, { after: 2 });
	w.text(m.client.email, TYPE.body, { after: 34 });
	w.rule({ color: COLOR.ink, thickness: 0.8, after: 4 });

	const plans = m.files.filter((f) => f.kind === 'plan').length;
	const photos = m.files.filter((f) => f.kind === 'photo').length;
	const rows: [string, string][] = [
		['Trimis', dateRo(m.committedAt)],
		['Camere', m.rooms.map((r) => roomOf(r)?.label ?? r).join(', ')],
		['Planuri', `${plans} ${plans === 1 ? 'fișier' : 'fișiere'}${m.drawing ? ' · plan desenat în chestionar' : ''}`],
		['Fotografii', String(photos)],
		['Identificator', m.submissionId]
	];
	for (const [label, value] of rows) {
		const top = w.y - 8;
		page.drawText(label, { x: MARGIN.left, y: top - 9, size: 8.5, font: sans, color: COLOR.grey });
		const h = drawWrapped(page, w.fonts, value, { x: MARGIN.left + 110, top, width: CONTENT_WIDTH - 110 }, TYPE.answer);
		w.y = top - Math.max(h, 14) - 8;
		w.rule({ after: 0 });
	}

	drawWrapped(
		page,
		w.fonts,
		'Paginile cu marginea „Document încărcat de client” sunt copiate neschimbat din fișierele trimise de client.',
		{ x: MARGIN.left, top: MARGIN.bottom + 30, width: CONTENT_WIDTH },
		TYPE.small
	);
}
