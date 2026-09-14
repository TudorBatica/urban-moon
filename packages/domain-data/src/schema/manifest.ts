import { z } from 'zod';
import {
	ACCEPTED_CONTENT_TYPES,
	MAX_PHOTOS_PER_GROUP,
	MAX_SUBMISSION_BYTES,
	OBJECT_EXTENSION,
	maxBytesFor,
	maxPlanFiles
} from '../limits';
import { ROOM_IDS } from '../types';
import { AnswersSchema } from './answers';
import { RoomSnapshotSchema } from './room';

/* manifest.json — written once by the app server when a submission is committed, read by the
   PDF worker. It is complete on its own: answers, the drawn plan and every uploaded file. */

export const MANIFEST_SCHEMA_VERSION = 1 as const;

export const SubmissionIdSchema = z.string().regex(/^[A-Za-z0-9-]{8,80}$/);
export const RoomIdSchema = z.enum(ROOM_IDS);
export const PhotoGroupSchema = z.enum(['spatiu', 'mobilier']);
export const FileKindSchema = z.enum(['plan', 'photo']);

const FILE_ID = /^[A-Za-z0-9-]{1,80}$/;

export const ManifestFileSchema = z
	.object({
		fileId: z.string().regex(FILE_ID),
		kind: FileKindSchema,
		/** photos only: the space, or furniture kept in a room */
		group: PhotoGroupSchema.nullable(),
		roomId: RoomIdSchema.nullable(),
		originalName: z.string().min(1).max(200),
		/** as sniffed by the server from the file's first bytes */
		contentType: z.enum(ACCEPTED_CONTENT_TYPES),
		size: z.number().int().positive(),
		/** from the bucket's object metadata at commit */
		crc32c: z.string().optional(),
		/** path inside the submission folder */
		object: z.string().regex(/^uploads\/[A-Za-z0-9-]{1,80}\.(jpg|png|pdf)$/),
		addedAt: z.number().int().nonnegative()
	})
	.superRefine((f, ctx) => {
		if (f.kind === 'photo' && !f.group)
			ctx.addIssue({ code: 'custom', path: ['group'], message: 'a photo needs a group' });
		if (f.kind === 'plan' && f.group)
			ctx.addIssue({ code: 'custom', path: ['group'], message: 'a plan has no group' });
		if (f.group === 'mobilier' && !f.roomId)
			ctx.addIssue({ code: 'custom', path: ['roomId'], message: 'furniture photos need a room' });
		if (f.size > maxBytesFor(f.contentType))
			ctx.addIssue({ code: 'custom', path: ['size'], message: 'file over the size limit' });
		if (f.object !== `uploads/${f.fileId}.${OBJECT_EXTENSION[f.contentType]}`)
			ctx.addIssue({
				code: 'custom',
				path: ['object'],
				message: 'object must be uploads/<fileId>.<extension of the sniffed type>'
			});
	});

export const DRAWING_OBJECT = 'uploads/drawing.png';

export const ManifestDrawingSchema = z.object({
	room: RoomSnapshotSchema,
	svg: z.string().max(2_000_000),
	pngObject: z.literal(DRAWING_OBJECT),
	updatedAt: z.number().int().nonnegative()
});

export const ManifestSchema = z
	.object({
		schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
		submissionId: SubmissionIdSchema,
		committedAt: z.iso.datetime(),
		appVersion: z.string().min(1),
		pageUri: z.string(),
		locale: z.literal('ro'),
		client: z.object({
			name: z.string().trim().min(1).max(200),
			email: z.email()
		}),
		rooms: z.array(RoomIdSchema).min(1),
		answers: AnswersSchema,
		drawing: ManifestDrawingSchema.nullable(),
		files: z.array(ManifestFileSchema)
	})
	.superRefine((m, ctx) => {
		const issue = (path: (string | number)[], message: string) =>
			ctx.addIssue({ code: 'custom', path, message });

		const picked: unknown[] = Array.isArray(m.answers.c_rooms) ? m.answers.c_rooms : [];
		if (picked.length !== m.rooms.length || !m.rooms.every((r) => picked.includes(r)))
			issue(['rooms'], 'rooms must match answers.c_rooms');

		const ids = new Set<string>();
		m.files.forEach((f, i) => {
			if (ids.has(f.fileId)) issue(['files', i, 'fileId'], 'duplicate fileId');
			ids.add(f.fileId);
			if (f.roomId && !m.rooms.includes(f.roomId))
				issue(['files', i, 'roomId'], 'file tagged with a room that was not picked');
		});

		const plans = m.files.filter((f) => f.kind === 'plan');
		if (plans.length > maxPlanFiles(m.rooms.length))
			issue(['files'], `at most ${maxPlanFiles(m.rooms.length)} plan files`);
		if (plans.length === 0 && !m.drawing) issue(['files'], 'a plan file or a drawing is required');

		const groups = new Map<string, number>();
		for (const f of m.files)
			if (f.kind === 'photo') {
				const g = `${f.group}:${f.group === 'mobilier' ? f.roomId : '-'}`;
				groups.set(g, (groups.get(g) ?? 0) + 1);
			}
		for (const [g, n] of groups)
			if (n > MAX_PHOTOS_PER_GROUP) issue(['files'], `at most ${MAX_PHOTOS_PER_GROUP} photos in ${g}`);

		const total = m.files.reduce((sum, f) => sum + f.size, 0);
		if (total > MAX_SUBMISSION_BYTES) issue(['files'], 'submission over the total size limit');
	});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestFile = z.infer<typeof ManifestFileSchema>;
export type ManifestDrawing = z.infer<typeof ManifestDrawingSchema>;
export type ManifestAnswers = z.infer<typeof AnswersSchema>;

export type ParsedManifest =
	| { ok: true; manifest: Manifest }
	| { ok: false; unsupported: true; schemaVersion: unknown }
	| { ok: false; unsupported: false; issues: z.core.$ZodIssue[] };

/** Read a manifest: an unknown schema version is reported apart from an invalid manifest. */
export function parseManifest(json: unknown): ParsedManifest {
	const version = (json as { schemaVersion?: unknown } | null)?.schemaVersion;
	if (version !== MANIFEST_SCHEMA_VERSION) return { ok: false, unsupported: true, schemaVersion: version };
	const res = ManifestSchema.safeParse(json);
	return res.success
		? { ok: true, manifest: res.data }
		: { ok: false, unsupported: false, issues: res.error.issues };
}
