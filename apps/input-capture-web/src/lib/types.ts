export type RoomId =
	| 'bucatarie'
	| 'living'
	| 'dormitor'
	| 'birou'
	| 'baie'
	| 'hol'
	| 'alta';

export type Answers = Record<string, unknown>; // keyed by screen id, same shapes as the prototype
// c_identity: { name: string; email: string }
// c_rooms: RoomId[]
// c_stage: "noua" | "constructie" | "renovam" | "pastram"
// c_household: { adults: number; children: number; childAges?: string[]; elderly?: "da"|"nu"; pets?: string[] }
// k1..: as in the prototype; follow-ups live at their own keys (k4_copt, k7_freq, k10_seats, k8_<place>, l1_seats)

export interface PlanFileMeta {
	id: string; // uuid
	name: string;
	type: string; // mime
	size: number; // bytes
	roomId: RoomId | null; // tag
	addedAt: number;
}

/** A photo: of the space (`spatiu`) or of the furniture kept in a room (`mobilier`). */
export interface PhotoMeta extends PlanFileMeta {
	group: 'spatiu' | 'mobilier';
}

/** window.__room() shape from ../SPEC-shared-contract.md — unchanged */
export interface RoomSnapshot {
	unit: 'cm';
	ceilingHeightCm: number | null;
	closed: boolean;
	outline: [number, number][];
	walls: RoomWall[];
	openings: RoomSegment[];
	unanswered: string[];
	finished: boolean;
}
export interface RoomWall {
	id: string;
	index: number;
	from: [number, number];
	to: [number, number];
	heading: 'N' | 'E' | 'S' | 'W';
	lengthCm: Provenance;
	segments: RoomSegment[];
}
export interface RoomSegment {
	id: string;
	kind: 'wall' | 'open' | 'window' | 'door';
	lengthCm: Provenance;
	offsetFromStartCm: number;
	sillCm: number | null;
	hinge: 'start' | 'end' | null;
	swing: 'in' | 'out' | null;
	wallId?: string;
}
export interface Provenance {
	value: number;
	source: 'typed' | 'drawn' | 'computed';
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

export interface SubmitRequest {
	submissionId: string; // uuid, generated once per attempt series, for dedupe
	answers: Answers;
	readback: string; // full "Ce am înțeles" as plain text
	files: { url: string; name: string; roomId: RoomId | null }[]; // HubSpot file URLs after upload
	drawing: { jsonUrl: string; pngUrl: string; room: RoomSnapshot } | null;
	/** photos of the space and of the kept furniture, after upload */
	photos?: { url: string; name: string; roomId: RoomId | null; group: PhotoMeta['group'] }[];
	pageUri: string;
}
