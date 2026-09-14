import { config, uploadFile } from '$lib/hubspot/client';
import { MAX_FILE_BYTES, isAcceptedFile, safeFileName, slug } from '$lib/hubspot/validation';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ROOM_IDS = new Set([
	'bucatarie',
	'living',
	'dormitor',
	'birou',
	'baie',
	'hol',
	'alta'
]);

function bad(error: string) {
	return json({ ok: false, error }, { status: 400 });
}

export const POST: RequestHandler = async ({ request }) => {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return bad('Cererea nu este un formular valid.');
	}

	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return bad('Lipsește fișierul.');
	}

	const email = String(form.get('email') ?? '').trim();
	if (!email || !email.includes('@')) {
		return bad('Lipsește adresa de email.');
	}

	if (file.size > MAX_FILE_BYTES) {
		return bad('Fișierul depășește 25 MB.');
	}

	const name = safeFileName(file.name);
	if (!isAcceptedFile(name, file.type)) {
		return bad('Tipul fișierului nu este acceptat.');
	}

	const rawRoom = String(form.get('roomId') ?? '').trim();
	const roomId = ROOM_IDS.has(rawRoom) ? rawRoom : '';

	const folderPath = `${config.filesFolder}/${slug(email)}`;
	const fileName = roomId ? `${roomId}--${name}` : name;

	const scenario = request.headers.get('X-Mock-Scenario') ?? undefined;

	try {
		const uploaded = await uploadFile(file, { folderPath, fileName, scenario });
		return json({
			ok: true,
			id: uploaded.id,
			url: uploaded.url,
			name: uploaded.name,
			size: uploaded.size
		});
	} catch (err) {
		console.error('[api/upload] failed:', err);
		return json(
			{ ok: false, error: 'Nu am putut încărca fișierul. Încearcă din nou.' },
			{ status: 502 }
		);
	}
};
