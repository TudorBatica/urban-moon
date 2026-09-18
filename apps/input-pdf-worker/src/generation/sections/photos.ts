import { ROOM_IDS, roomOf } from '@urban-moon/domain-data';
import type { ManifestFile } from '@urban-moon/domain-data/schema';
import { drawContained, embedClientImage } from '../images';
import { fitLine, type Writer } from '../layout';
import { COLOR, CONTENT_WIDTH, MARGIN, TYPE } from '../theme';

const GAP = 14;
const CAPTION = 16;

export interface PhotoGroup {
	title: string;
	files: ManifestFile[];
}

/** Photos of the space first, then the furniture kept in each room, in room order. */
export function photoGroups(files: ManifestFile[]): PhotoGroup[] {
	const photos = files.filter((f) => f.kind === 'photo');
	const groups: PhotoGroup[] = [];
	const space = photos.filter((f) => f.group === 'spatiu');
	if (space.length) groups.push({ title: 'Fotografii ale spațiului', files: space });
	for (const room of ROOM_IDS) {
		const kept = photos.filter((f) => f.group === 'mobilier' && f.roomId === room);
		if (kept.length) groups.push({ title: `Mobilier păstrat — ${roomOf(room)?.label ?? room}`, files: kept });
	}
	return groups;
}

/** Two photos a row, three rows a page; each photo fitted, the right way up, with its file name. */
export async function drawPhotoGroup(
	w: Writer,
	group: PhotoGroup,
	read: (f: ManifestFile) => Promise<Uint8Array>,
	warnings: string[]
): Promise<void> {
	const cellWidth = (CONTENT_WIDTH - GAP) / 2;
	const cellHeight = 200;
	const heading = (more: boolean) => {
		w.addPage();
		w.text(more ? `${group.title} (continuare)` : group.title, TYPE.section, { after: 16 });
	};

	heading(false);
	let col = 0;
	for (const f of group.files) {
		if (col === 0 && w.y - (cellHeight + CAPTION) < MARGIN.bottom) heading(true);
		const x = MARGIN.left + col * (cellWidth + GAP);
		const top = w.y;
		const box = { x, y: top - cellHeight, width: cellWidth, height: cellHeight };
		w.page.drawRectangle({ ...box, color: COLOR.wash });
		/* A missing file fails the build (the manifest promised it); only unreadable content degrades. */
		const bytes = await read(f);
		try {
			drawContained(w.page, await embedClientImage(w.doc, f.contentType, bytes), box);
		} catch {
			warnings.push(`client_image_unreadable: ${f.fileId}`);
			w.page.drawText('Imaginea nu a putut fi citită.', { x: x + 10, y: top - 20, size: 9, font: w.fonts.sans, color: COLOR.grey });
		}
		w.page.drawText(fitLine(f.originalName, w.fonts.sans, 8, cellWidth), {
			x,
			y: top - cellHeight - 11,
			size: 8,
			font: w.fonts.sans,
			color: COLOR.grey
		});
		col = (col + 1) % 2;
		if (col === 0) w.y = top - cellHeight - CAPTION - GAP;
	}
}
