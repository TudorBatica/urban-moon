/* What a room has that a plan cannot show, placed on the drawn plan by the client and listed for
   the architect. Colours and icons belong to the app that draws them. */

export const LANDMARK_KIND_IDS = [
	'water',
	'gas',
	'boiler',
	'airConditioning',
	'fireplace',
	'radiator',
	'hoodVent'
] as const;

export type LandmarkKind = (typeof LANDMARK_KIND_IDS)[number];

export interface LandmarkKindEntry {
	kind: LandmarkKind;
	label: string;
}

export const LANDMARK_KINDS: LandmarkKindEntry[] = [
	{ kind: 'water', label: 'Țeavă de apă' },
	{ kind: 'gas', label: 'Gaz' },
	{ kind: 'boiler', label: 'Centrală' },
	{ kind: 'airConditioning', label: 'Aer condiționat' },
	{ kind: 'fireplace', label: 'Șemineu' },
	{ kind: 'radiator', label: 'Calorifer' },
	{ kind: 'hoodVent', label: 'Evacuare hotă' }
];

/** The side of the square a landmark takes on the plan, in centimetres. */
export const LANDMARK_SIZE_CM = 30;

export const landmarkKindOf = (kind: string): LandmarkKindEntry | undefined =>
	LANDMARK_KINDS.find((k) => k.kind === kind);
