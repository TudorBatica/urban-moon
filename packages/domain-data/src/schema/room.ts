import { z } from 'zod';

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

export const RoomSnapshotSchema = z.object({
	unit: z.literal('cm'),
	ceilingHeightCm: z.number().nullable(),
	closed: z.boolean(),
	outline: z.array(Point),
	walls: z.array(RoomWallSchema),
	openings: z.array(RoomSegmentSchema),
	unanswered: z.array(z.string()),
	finished: z.boolean()
});
