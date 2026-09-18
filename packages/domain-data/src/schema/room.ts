import { z } from 'zod';
import { LANDMARK_KIND_IDS, LANDMARK_SIZE_CM } from '../catalog/landmarks';

/* The drawn plan, as the floorplan editor reports it (window.__room()). */

export const ProvenanceSchema = z.object({
	value: z.number(),
	source: z.enum(['typed', 'drawn', 'computed'])
});

const Point = z.tuple([z.number(), z.number()]);

export const RoomSegmentSchema = z.object({
	id: z.string(),
	kind: z.enum(['wall', 'open', 'window', 'door']),
	lengthCm: ProvenanceSchema,
	offsetFromStartCm: z.number(),
	sillCm: z.number().nullable(),
	hinge: z.enum(['start', 'end']).nullable(),
	swing: z.enum(['in', 'out']).nullable(),
	wallId: z.string().optional()
});

export const RoomWallSchema = z.object({
	id: z.string(),
	index: z.number().int(),
	from: Point,
	to: Point,
	heading: z.enum(['N', 'E', 'S', 'W']),
	lengthCm: ProvenanceSchema,
	segments: z.array(RoomSegmentSchema)
});

export const RoomLandmarkSchema = z.object({
	id: z.string(),
	kind: z.enum(LANDMARK_KIND_IDS),
	wallId: z.string(),
	/** from the wall's `from` to the mark's near edge, like a segment's */
	offsetFromStartCm: z.number().nonnegative(),
	/** the side the mark sits on: `in` is the side a door with `swing: 'in'` opens into */
	face: z.enum(['in', 'out']),
	/** clear distance to the first thing toward the wall's `from`; the editor computes it at save
	    time so a reader prints distances without redoing the geometry */
	gapBeforeCm: z.number().nonnegative(),
	/** the same, toward the wall's `to` */
	gapAfterCm: z.number().nonnegative()
});

export const RoomSnapshotSchema = z
	.object({
		unit: z.literal('cm'),
		ceilingHeightCm: z.number().nullable(),
		closed: z.boolean(),
		outline: z.array(Point),
		walls: z.array(RoomWallSchema),
		openings: z.array(RoomSegmentSchema),
		/** absent on a snapshot written before landmarks existed: it has none */
		landmarks: z.array(RoomLandmarkSchema).optional(),
		unanswered: z.array(z.string()),
		finished: z.boolean()
	})
	.superRefine((room, ctx) => {
		const walls = new Map(room.walls.map((w) => [w.id, w]));
		const ids = new Set<string>();
		(room.landmarks ?? []).forEach((l, i) => {
			const issue = (path: (string | number)[], message: string) =>
				ctx.addIssue({ code: 'custom', path: ['landmarks', i, ...path], message });
			if (ids.has(l.id)) issue(['id'], 'duplicate landmark id');
			ids.add(l.id);
			const wall = walls.get(l.wallId);
			if (!wall) {
				issue(['wallId'], 'landmark on a wall that is not in this room');
				return;
			}
			if (l.offsetFromStartCm + LANDMARK_SIZE_CM > wall.lengthCm.value)
				issue(['offsetFromStartCm'], 'landmark does not fit within its wall');
		});
	});
