import type { z } from 'zod';
import type {
	ProvenanceSchema,
	RoomSegmentSchema,
	RoomSnapshotSchema,
	RoomWallSchema
} from './schema/room';

/* The domain types shared by the web app and the PDF worker. Types with a schema are inferred
   from it, so they cannot drift; these imports are type-only and add nothing at runtime. */

export const ROOM_IDS = ['bucatarie', 'living', 'dormitor', 'birou', 'baie', 'hol', 'alta'] as const;

export type RoomId = (typeof ROOM_IDS)[number];

/** Answers while the questionnaire is being filled in, keyed by screen id (and follow-up key).
 *  Loose on purpose: the committed, validated shape is `ManifestAnswers` in ./schema. */
export type Answers = Record<string, unknown>;

/** Where a photo belongs: the space itself, or furniture the client keeps. */
export type PhotoGroup = 'spatiu' | 'mobilier';

/** The drawn plan, as the floorplan editor reports it (window.__room()). */
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export type RoomWall = z.infer<typeof RoomWallSchema>;
export type RoomSegment = z.infer<typeof RoomSegmentSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
