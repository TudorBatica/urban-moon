import type {
	Answers,
	LandmarkKind,
	PhotoGroup,
	Provenance,
	RoomId,
	RoomLandmark,
	RoomSegment,
	RoomSnapshot,
	RoomWall
} from '@urban-moon/domain-data';

/* Room ids, answers and the room snapshot live in @urban-moon/domain-data; re-exported here
   so the app keeps importing them from $lib/types. */
export type {
	Answers,
	LandmarkKind,
	PhotoGroup,
	Provenance,
	RoomId,
	RoomLandmark,
	RoomSegment,
	RoomSnapshot,
	RoomWall
};

export interface PlanFileMeta {
	id: string; // uuid
	name: string;
	type: string; // mime
	size: number; // bytes
	addedAt: number;
}

/** A photo: of the space (`spatiu`) or of the furniture kept in a room (`mobilier`). */
export interface PhotoMeta extends PlanFileMeta {
	group: PhotoGroup;
	/** the room whose furniture screen the photo was added on; null for the space */
	roomId: RoomId | null;
}

export interface Drawing {
	model: unknown; // engine-internal, opaque, for re-editing (engine.getModel()/setModel())
	room: RoomSnapshot;
	svg: string;
	pngDataUrl: string; // 2x raster of the svg
	updatedAt: number;
}

export interface PlansState {
	files: PlanFileMeta[];
	drawing: Drawing | null;
}
