import type { Answers, RoomId } from '../types';
import { ROOMS, SMALL } from './rooms';
import { kids, notCooking, peopleCount, picked, yn } from './predicates';

/** Chapter ids. `comun` is the prototype's single common chapter; the webapp splits it
 *  into `despre_tine` · `planuri` · `locuinta` (see CONTRACTS.md). Room ids are chapters too. */
export type ChapterId = 'comun' | 'despre_tine' | 'planuri' | 'locuinta' | RoomId | (string & {});

export type Predicate = (a: Answers) => boolean;

export interface Option {
	value: string;
	label: string;
	hint?: string;
	icon?: string;
	showIf?: Predicate;
	followUp?: FollowUp;
}

export type Options = Option[] | ((a: Answers) => Option[]);

export interface FollowUp {
	key: string;
	kind: 'pills' | 'pillsMulti' | 'stepper' | 'input' | 'text';
	label: string;
	options?: Option[];
	placeholder?: string;
	icon?: string;
	min?: number;
	max?: number;
	default?: number;
	/** a default read off the answers — beats `default` when both are set */
	defaultOf?: (a: Answers) => number;
	/** single screens only: which picked value opens the follow-up */
	when?: (value: string) => boolean;
}

/** An "Altceva" option whose text the user types in, kept in the draft at `key`. */
export interface OtherText {
	value: string;
	key: string;
	placeholder?: string;
}

/** A field inside a `compound` screen. `heading` fields are separators without a key. */
export interface Field {
	key?: string;
	kind?: 'input' | 'email' | 'text' | 'stepper' | 'pills' | 'pillsMulti' | 'heading';
	label?: string;
	placeholder?: string;
	icon?: string;
	options?: Options;
	/** render pillsMulti options as tiles */
	tiles?: boolean;
	/** value that clears every other value in the group */
	exclusive?: string;
	/** picking this value opens a text box for the user's own answer */
	other?: OtherText;
	/** the prototype passes the compound draft; answers are available as the 2nd argument */
	showIf?: (fieldData: Record<string, unknown>, a: Answers) => boolean;
	allowEmpty?: boolean;
	min?: number;
	max?: number;
	default?: number;
	chips?: string[];
	followUp?: FollowUp;
}

/** A group of options that opens inside a card once the card is chosen. */
export interface CardGroup {
	key: string;
	label?: string;
	options: Option[];
	/** the group shows only when the rest of the card's draft satisfies this */
	showIf?: (d: Record<string, unknown>) => boolean;
	/** written in the first time the card opens */
	default?: string;
}

/** A card on a `cards` screen. Touching it selects it; if it has groups, it switches
 *  to its options and the answer is the option, not the bare tick. */
export interface AppCard {
	value: string;
	label: string;
	hint?: string;
	icon: string;
	groups?: CardGroup[];
	/** the card is never ticked off — it is always open on its options (placement) */
	always?: boolean;
	showIf?: Predicate;
}

/** A step of the journey shown on the first screen. */
export interface JourneyStep {
	label: string;
	state: 'done' | 'now' | 'next';
	/** when it happens, set to the right */
	meta?: string;
}

interface Base {
	id: string;
	chapter: ChapterId;
	when?: Predicate;
	title?: string;
	subtitle?: string;
	room?: RoomId;
	/** how the question reads in the answers list, when the title does not */
	short?: string;
}

export interface SingleScreen extends Base {
	kind: 'single';
	options: Options;
	followUp?: FollowUp;
}
export interface MultiScreen extends Base {
	kind: 'multi';
	options: Options;
	/** cap on the number of selected values */
	max?: number;
	/** an empty selection still lets the user continue */
	allowEmpty?: boolean;
	/** a follow-on screen that refines the previous one */
	sub?: boolean;
	/** value that clears every other value in the group */
	exclusive?: string;
}
export interface CompoundScreen extends Base {
	kind: 'compound';
	fields: Field[];
	/** the journey, listed under the title */
	steps?: JourneyStep[];
	/** a line above the fields */
	lead?: string;
}
export interface TextScreen extends Base {
	kind: 'text';
	fields: Field[];
}
/** A section of appliance cards that takes over the screen. */
export interface CardsScreen extends Base {
	kind: 'cards';
	/** small line above the title — the question the sections belong to */
	eyebrow?: string;
	cards: AppCard[];
	/** one card at a time: the others slide away, and the pick lands in this key */
	pick?: string;
	/** an empty section still lets the user continue */
	allowEmpty?: boolean;
}
/** The furniture the user keeps: a list of objects with their size, plus optional photos.
 *  Answer shape: `{ items: FurnitureItem[] }`; the photos live in the photos store. */
export interface FurnitureScreen extends Base {
	kind: 'furniture';
	room: RoomId;
	/** example object, e.g. "masa" */
	example: string;
	/** example size in cm, [length, width] */
	exampleSize: [number, number];
}
export interface CardScreen extends Base {
	kind: 'card';
	minutes?: string;
	blurb?: string;
}
export interface RouteScreen extends Base {
	kind: 'route';
	href: string;
}

export interface FurnitureItem {
	name: string;
	length: string;
	width: string;
}

export type Screen =
	| SingleScreen
	| MultiScreen
	| CompoundScreen
	| TextScreen
	| CardsScreen
	| FurnitureScreen
	| CardScreen
	| RouteScreen;

/* ================= the plans step (/planuri) ================= */

/** "Ești dispus să modifici spațiul?" — asked on the plans step, kept at `p_modify`. */
export const PLAN_MODIFY_KEY = 'p_modify';
/** "Am măsurat spațiul" — ticked on the plans step before anything can be added, kept at `p_measured`. */
export const PLAN_MEASURED_KEY = 'p_measured';
export const PLAN_MODIFY_TITLE = 'Ești dispus să modifici spațiul sau va rămâne exact așa cum este?';
export const PLAN_MODIFY: Option[] = [
	{ value: 'pereti', label: 'Pot modifica pereții', icon: 'hammer' },
	{ value: 'usa', label: 'Pot modifica poziția ușii dacă este avantajos', icon: 'hall' },
	{ value: 'instalatii', label: 'Pot modifica prize / scurgeri', icon: 'pipe' },
	{ value: 'nu', label: 'Nu vreau să modific spațiul', icon: 'none' }
];

/* ================= screens ================= */

export const S: Screen[] = [];

/* ---- DESPRE TINE ---- */
S.push(
	{
		id: 'c_identity',
		chapter: 'despre_tine',
		kind: 'compound',
		short: 'Numele și emailul',
		title: 'Mulțumesc pentru plată!',
		subtitle: 'Următorul pas: trimite informațiile spațiului tău pentru a pregăti întâlnirea.',
		steps: [
			{ label: 'Plată', state: 'done' },
			{ label: 'Trimiți detaliile spațiului', state: 'now', meta: 'acum, cam 20 min' },
			{ label: 'Programezi întâlnirea', state: 'next', meta: 'după trimitere' },
			{ label: 'Ne vedem online', state: 'next', meta: '30 min' },
			{ label: 'Primești materialele', state: 'next', meta: 'după feedbackul tău' }
		],
		lead: 'Numele și emailul cu care ai făcut plata.',
		fields: [
			{ key: 'name', kind: 'input', label: 'Prenume și nume', placeholder: 'Ana Popescu' },
			{
				key: 'email',
				kind: 'email',
				label: 'Email-ul cu care ai făcut plata',
				placeholder: 'ana@exemplu.ro'
			}
		]
	},
	{
		id: 'c_rooms',
		chapter: 'despre_tine',
		kind: 'multi',
		title: 'Ce cameră vrei să optimizezi?',
		subtitle: 'Poți alege mai multe. Pentru fiecare, răspunde la câteva întrebări.',
		options: ROOMS.map((r) => ({ value: r.id, label: r.label, icon: r.icon }))
	},
	/* ---- PLANURI: the question, then the plans step on its own route ---- */
	{
		id: PLAN_MODIFY_KEY,
		chapter: 'planuri',
		kind: 'multi',
		exclusive: 'nu',
		title: PLAN_MODIFY_TITLE,
		subtitle: 'Selectează varianta potrivită.',
		options: PLAN_MODIFY
	},
	{ id: 'planuri', chapter: 'planuri', kind: 'route', href: '/planuri' },
	/* ---- LOCUINȚA ---- */
	{
		id: 'c_stage',
		chapter: 'locuinta',
		kind: 'single',
		title: 'În ce etapă este locuința ta?',
		options: [
			{ value: 'neconstruita', label: 'Nu este construită', icon: 'crane' },
			{ value: 'renovez', label: 'Urmează să o renovez', icon: 'hammer' },
			{ value: 'instalatii', label: 'Fac instalațiile electrice/sanitare', icon: 'pipe' },
			{ value: 'finisaje', label: 'Aleg finisajele', icon: 'houseNew' },
			{ value: 'mobilier', label: 'Aleg mobilierul', icon: 'sofa' },
			{ value: 'altceva', label: 'Altceva', icon: 'other' }
		],
		followUp: {
			when: (v) => v === 'altceva',
			key: 'c_stage_other',
			kind: 'input',
			label: 'Ce anume?',
			placeholder: 'Scrie pe scurt'
		}
	},
	{
		id: 'c_household',
		chapter: 'locuinta',
		kind: 'compound',
		title: 'Cine va locui aici?',
		fields: [
			{ key: 'adults', kind: 'stepper', label: 'Adulți', icon: 'person', min: 1, max: 8, default: 2 },
			{ key: 'children', kind: 'stepper', label: 'Copii', icon: 'child', min: 0, max: 6, default: 0 },
			{
				key: 'childAges',
				kind: 'pillsMulti',
				label: 'Ce vârste au copiii?',
				showIf: (d) => (d.children as number) > 0,
				options: [
					{ value: 'sub3', label: 'Sub 3 ani' },
					{ value: '3_6', label: '3–6' },
					{ value: '7_12', label: '7–12' },
					{ value: 'teen', label: '12+' }
				]
			},
			{ key: 'elderly', kind: 'pills', label: 'Persoane în vârstă?', options: yn },
			{
				key: 'pets',
				kind: 'pillsMulti',
				label: 'Animale de companie?',
				exclusive: 'nu',
				other: { value: 'altceva', key: 'petsOther', placeholder: 'Ce animal?' },
				options: [
					{ value: 'caine', label: 'Câine', icon: 'dog' },
					{ value: 'pisica', label: 'Pisică', icon: 'cat' },
					{ value: 'altceva', label: 'Altceva', icon: 'paw' },
					{ value: 'nu', label: 'Nu', icon: 'none' }
				]
			}
		]
	}
);

/* ---- BUCĂTĂRIE ---- */
const K: Predicate = (a) => picked(a, 'bucatarie');

const DONT_KNOW: Option = { value: 'oriunde', label: 'Nu știu', icon: 'anywhere' };

/** The appliances whose placement we ask about — each only when it was actually chosen. */
const placeableCards: AppCard[] = [
	{
		value: 'oven',
		label: 'Cuptor',
		icon: 'oven',
		always: true,
		showIf: (a) => (a.k5_gatit as Record<string, unknown> | undefined)?.cook === 'separate',
		groups: [
			{
				key: 'ovenWhere',
				default: 'oriunde',
				options: [
					DONT_KNOW,
					{ value: 'podea', label: 'Sub plită', icon: 'ovenFloor' },
					{ value: 'coloana', label: 'În coloană (la înălțime)', icon: 'ovenColumn' }
				]
			}
		]
	},
	{
		value: 'micro',
		label: 'Cuptor cu microunde',
		icon: 'microCounter',
		always: true,
		showIf: (a) => Array.isArray(a.k6a) && (a.k6a as string[]).includes('micro'),
		groups: [
			{
				key: 'microWhere',
				default: 'oriunde',
				options: [
					DONT_KNOW,
					{ value: 'blat', label: 'Pe blat', icon: 'counterTop' },
					{ value: 'coloana', label: 'În coloană (la înălțime)', icon: 'microColumn' }
				]
			}
		]
	},
	{
		value: 'wine',
		label: 'Frigider de vinuri',
		icon: 'wine',
		always: true,
		showIf: (a) => !!(a.k5_frig as Record<string, unknown> | undefined)?.wine,
		groups: [
			{
				key: 'wineWhere',
				default: 'oriunde',
				options: [
					DONT_KNOW,
					{ value: 'sub_blat', label: 'Sub blat', icon: 'underCounter' },
					{ value: 'coloana', label: 'În coloană (la înălțime)', icon: 'ovenColumn' }
				]
			}
		]
	}
];

const MEALS: Option[] = [
	{ value: 'gatim', label: 'Gătim', icon: 'pans' },
	{ value: 'incalzim', label: 'Încălzim ceva gătit de noi dinainte', icon: 'reheat' },
	{ value: 'comandam', label: 'Comandăm sau mâncăm în oraș', icon: 'delivery' }
];

S.push(
	{
		id: 'k_card',
		chapter: 'bucatarie',
		kind: 'card',
		room: 'bucatarie',
		when: K,
		minutes: '3 minute.'
	},
	{
		id: 'k1',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'Cum arată o cină obișnuită la tine acasă, într-o zi din săptămână?',
		options: MEALS
	},
	{
		id: 'k2',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'Dar în weekend?',
		options: MEALS
	},
	{
		id: 'k3',
		chapter: 'bucatarie',
		kind: 'single',
		when: (a) => K(a) && !notCooking(a),
		title: 'Cine gătește, de obicei?',
		options: [
			{ value: 'una', label: 'O singură persoană', icon: 'person' },
			{ value: 'doi', label: 'Două sau mai multe persoane, în același timp', icon: 'two' }
		]
	},
	{
		id: 'k4',
		chapter: 'bucatarie',
		kind: 'multi',
		when: (a) => K(a) && !notCooking(a),
		max: 3,
		title: 'Ce se gătește, de obicei?',
		subtitle: 'Bifează până la trei variante.',
		options: [
			{
				value: 'lent',
				label: 'Mâncăruri care stau mult pe foc',
				hint: 'ciorbe, tocănițe, sarmale',
				icon: 'kitchen'
			},
			{ value: 'tigaie', label: 'La tigaie, rapid', hint: 'gătim mai mult pe plită', icon: 'pan' },
			{ value: 'copt', label: 'Patiserie', hint: 'pâine, prăjituri, cozonac', icon: 'bread' },
			{ value: 'cuptor', label: 'La cuptor', hint: 'fripturi, legume coapte', icon: 'oven' },
			{
				value: 'rapide',
				label: 'Preparate rapide',
				hint: 'salate, aperitive, sandvișuri',
				icon: 'knife'
			}
		]
	},
	{
		id: 'k3b',
		chapter: 'bucatarie',
		kind: 'multi',
		when: (a) => K(a) && !notCooking(a),
		allowEmpty: true,
		title: 'Bucătăria e și locul unde…',
		subtitle:
			'Opțional. Bifează doar ce se mai întâmplă aici, în afară de gătit și mâncat — sau treci mai departe.',
		options: [
			{ value: 'povesti', label: '…stăm la povești în timp ce se gătește', icon: 'chat' },
			{ value: 'prieteni', label: '…ne strângem cu prietenii din când în când', icon: 'cheers' },
			{ value: 'copii', label: '…copiii își fac temele sau desenează', icon: 'homework', showIf: kids },
			{ value: 'laptop', label: '…lucrează cineva, cu laptopul pe masă', icon: 'laptop' }
		]
	},
	{
		id: 'k5_frig',
		chapter: 'bucatarie',
		kind: 'cards',
		when: K,
		allowEmpty: true,
		eyebrow: 'Ce electrocasnice mari o să aibă bucătăria?',
		title: 'Refrigerare',
		subtitle: 'Cele pe care le ai deja și le păstrezi, sau pe care le vei cumpăra.',
		cards: [
			{
				value: 'fridge',
				label: 'Frigider',
				icon: 'fridge',
				groups: [
					{
						key: 'fridgeType',
						label: 'Ce fel de frigider?',
						options: [
							{ value: 'combina', label: 'Combină', icon: 'fridge' },
							{ value: 'side', label: 'Side-by-side', icon: 'fridge2' },
							{ value: 'incorporabil', label: 'Încorporabil', icon: 'fridgeIn' }
						]
					}
				]
			},
			{ value: 'freezer', label: 'Congelator separat', icon: 'chest' },
			{ value: 'wine', label: 'Frigider de vinuri', icon: 'wine' }
		]
	},
	{
		id: 'k5_gatit',
		chapter: 'bucatarie',
		kind: 'cards',
		when: K,
		pick: 'cook',
		eyebrow: 'Ce electrocasnice mari o să aibă bucătăria?',
		title: 'Gătit',
		subtitle: 'Alege una.',
		cards: [
			{
				value: 'aragaz',
				label: 'Aragaz',
				hint: 'plită și cuptor într-unul',
				icon: 'aragaz',
				groups: [
					{
						key: 'aragazPower',
						label: 'Aragazul merge pe…',
						options: [
							{ value: 'gaz', label: 'Gaz', icon: 'flame' },
							{ value: 'electric', label: 'Electric', icon: 'bolt' },
							{ value: 'mixt', label: 'Mixt', icon: 'mixed' }
						]
					},
					{
						key: 'gasSource',
						label: 'Gazul vine…',
						showIf: (d) => d.aragazPower === 'gaz' || d.aragazPower === 'mixt',
						options: [
							{ value: 'retea', label: 'De la rețea', icon: 'pipe' },
							{ value: 'butelie', label: 'De la butelie', icon: 'bottle' }
						]
					}
				]
			},
			{
				value: 'separate',
				label: 'Plită și cuptor separate',
				icon: 'hobOven',
				groups: [
					{
						key: 'hob',
						label: 'Plita e…',
						options: [
							{ value: 'gaz', label: 'Pe gaz', icon: 'hobGas' },
							{ value: 'vitro', label: 'Vitroceramică', icon: 'hob' },
							{ value: 'inductie', label: 'Inducție', icon: 'hobInd' }
						]
					}
				]
			}
		]
	},
	{
		id: 'k5_spalat',
		chapter: 'bucatarie',
		kind: 'cards',
		when: K,
		allowEmpty: true,
		eyebrow: 'Ce electrocasnice mari o să aibă bucătăria?',
		title: 'Spălat',
		cards: [
			{ value: 'dish', label: 'Mașină de spălat vase', icon: 'dishwasher' },
			{
				value: 'washer',
				label: 'Mașină de spălat rufe',
				hint: 'în bucătărie',
				icon: 'washerKitchen'
			}
		]
	},
	{
		id: 'k6a',
		chapter: 'bucatarie',
		kind: 'multi',
		when: K,
		allowEmpty: true,
		title: 'Ce alte electrocasnice folosești?',
		subtitle: 'Bifează tot ce ai nevoie. Dacă nu vrei nimic, mergi mai departe.',
		options: [
			...SMALL,
			{
				value: 'altii',
				label: 'Alți roboți',
				icon: 'mixer',
				followUp: {
					key: 'k6a_other',
					kind: 'input',
					label: 'Ce alți roboți?',
					placeholder: 'De exemplu: robot de bucătărie, aparat de vidat'
				}
			}
		]
	},
	{
		id: 'k5_plasare',
		chapter: 'bucatarie',
		kind: 'cards',
		when: (a) => K(a) && placeableCards.some((c) => !c.showIf || c.showIf(a)),
		title: 'Preferințe de amplasare',
		subtitle: 'Ce preferințe de amplasare ai pentru electrocasnice?',
		cards: placeableCards
	},
	{
		id: 'k7',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'Cum preferi cafeaua?',
		options: [
			{ value: 'espressor', label: 'Espressor', icon: 'espresso' },
			{ value: 'capsule', label: 'Espressor cu capsule', icon: 'capsule' },
			{ value: 'ibric', label: 'La ibric / moka / french press etc.', icon: 'ibric' },
			{ value: 'filtru', label: 'Cafetieră cu filtru', icon: 'filter' },
			{ value: 'nu', label: 'Nu beau cafea', icon: 'nocoffee' }
		],
		followUp: {
			when: (v) => ['espressor', 'capsule', 'filtru'].includes(v),
			key: 'k7_freq',
			kind: 'pills',
			label: 'Cât de des folosești aparatul?',
			options: [
				{ value: 'zilnic', label: 'Zilnic' },
				{ value: 'saptamanal', label: 'Săptămânal' },
				{ value: 'rar', label: 'Rar' }
			]
		}
	},
	{
		id: 'k8',
		chapter: 'bucatarie',
		kind: 'multi',
		when: K,
		exclusive: 'nu',
		title: 'Depozitezi alimente sau obiecte de bucătărie și în altă parte?',
		options: [
			{ value: 'balcon', label: 'Da, pe balcon', icon: 'balconyClosed' },
			{ value: 'debara', label: 'Da, în debara sau cămară', icon: 'pantry' },
			{ value: 'beci', label: 'Da, în beci', icon: 'cellar' },
			{
				value: 'nu',
				label: 'Nu',
				hint: 'totul trebuie să încapă în bucătărie',
				icon: 'none'
			}
		]
	},
	{
		id: 'k9',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'De câte coșuri de gunoi ai nevoie în bucătărie?',
		options: [
			{ value: 'unul', label: 'Unul singur', icon: 'bin1' },
			{
				value: 'doua_trei',
				label: 'Două-trei',
				hint: 'pentru separarea reciclabilelor',
				icon: 'bin2'
			}
		]
	},
	{
		id: 'k10',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'Vrei să iei masa în bucătărie?',
		options: [
			{ value: 'zilnic', label: 'Da, mesele de zi cu zi', hint: 'aici mâncăm', icon: 'plate' },
			{
				value: 'rapid',
				label: 'Da, dar doar micul dejun și mesele rapide',
				hint: 'pentru celelalte avem masa de dining',
				icon: 'breakfast'
			},
			{ value: 'pahar', label: 'Mai mult pentru o cafea sau un pahar cu cineva', icon: 'glass' },
			{ value: 'nu', label: 'Nu, mâncăm în altă parte', icon: 'noplate' }
		],
		followUp: {
			when: (v) => v !== 'nu',
			key: 'k10_seats',
			kind: 'stepper',
			label: 'Câte persoane trebuie să încapă la masă?',
			min: 1,
			max: 12,
			defaultOf: peopleCount
		}
	},
	{
		id: 'k11',
		chapter: 'bucatarie',
		kind: 'text',
		when: K,
		title: 'Ce vrei să faci diferit de data asta?',
		subtitle:
			'Ce te enervează la bucătăria în care gătești acum? O greșeală pe care nu vrei s-o mai repeți.',
		fields: [
			{
				key: 'text',
				placeholder: 'Scrie liber, oricât de mărunt.',
				chips: [
					'nu am loc pentru anumite electrocasnice',
					'prea puțin blat',
					'frigiderul stă pe hol',
					'electrocasnice mici la vedere',
					'ne încurcăm unul pe altul',
					'nu ajung la rafturile de sus'
				]
			}
		]
	},
	{
		id: 'k12',
		chapter: 'bucatarie',
		kind: 'text',
		when: K,
		title: 'Care e lucrul pe care noua bucătărie trebuie neapărat să-l aibă?',
		fields: [
			{
				key: 'text',
				placeholder: 'Un singur lucru e de ajuns.',
				chips: ['o masă mare', 'un blat liber', 'insulă', 'totul la îndemână', 'loc pentru toată lumea']
			}
		]
	},
	{
		id: 'k13',
		chapter: 'bucatarie',
		kind: 'furniture',
		room: 'bucatarie',
		when: K,
		title: 'Ai deja mobilier pe care vrei să-l păstrezi în bucătărie?',
		subtitle: 'Scrie ce vrei să păstrezi și ce dimensiuni are (lungime și lățime).',
		example: 'masa',
		exampleSize: [140, 80]
	}
);

/* ---- the three screens every room ends with ---- */

const PROBLEM = (chips: string[]): Field => ({
	key: 'problem',
	label: 'Problema',
	placeholder: 'Ce problemă ai?',
	chips
});
const MUST = (chips: string[]): Field => ({
	key: 'must',
	label: 'Nu poate lipsi',
	placeholder: 'Ce trebuie neapărat să aibă?',
	chips
});

function card(room: RoomId, when: Predicate): CardScreen {
	return { id: `${room}_card`, chapter: room, kind: 'card', room, when, minutes: '1 minut.' };
}

/* ---- LIVING ---- */
const L: Predicate = (a) => picked(a, 'living');
S.push(
	{ ...card('living', L), id: 'l_card' },
	{
		id: 'l1',
		chapter: 'living',
		kind: 'multi',
		when: L,
		title: 'Cum îți petreci timpul în living?',
		subtitle: 'Poți bifa mai multe.',
		options: [
			{ value: 'tv', label: 'Mă uit la TV sau la filme', icon: 'tv' },
			{ value: 'vorba', label: 'Stăm de vorbă', icon: 'chat' },
			{ value: 'lucru', label: 'Lucrează cineva', hint: 'am nevoie de birou', icon: 'laptop' },
			{
				value: 'masa',
				label: 'Luăm masa aici',
				icon: 'table',
				followUp: {
					key: 'l1_seats',
					kind: 'stepper',
					label: 'Câte persoane trebuie să încapă?',
					min: 1,
					max: 12,
					default: 4
				}
			},
			{ value: 'copii', label: 'Se joacă copiii', icon: 'kids', showIf: kids },
			{
				value: 'dormit',
				label: 'Doarme cineva aici din când în când',
				hint: 'am nevoie de canapea extensibilă',
				icon: 'moon'
			},
			{ value: 'citit', label: 'Citesc, vreau un colț doar al meu', icon: 'book' }
		]
	},
	{
		id: 'l2',
		chapter: 'living',
		kind: 'compound',
		when: L,
		title: 'Câte persoane trebuie să încapă comod pe canapea și fotolii?',
		fields: [
			{ key: 'seats', kind: 'stepper', label: 'Locuri de stat', icon: 'sofa', min: 1, max: 12, default: 3 }
		]
	},
	{
		id: 'l3',
		chapter: 'living',
		kind: 'text',
		when: L,
		title:
			'Care e problema principală pe care vrei să o rezolvi în living? Și ce nu poate lipsi?',
		fields: [
			PROBLEM([
				'nu știu unde să pun canapeaua',
				'am prea puțin spațiu de depozitare',
				'masa nu încape',
				'vreau să am spațiu de trecere'
			]),
			MUST(['un colțar', 'masă de dining', 'un birou', 'bibliotecă', 'loc de joacă', 'lampadar'])
		]
	},
	{
		id: 'l4',
		chapter: 'living',
		kind: 'furniture',
		room: 'living',
		when: L,
		title: 'Ai deja mobilier pe care vrei să îl păstrezi în living?',
		subtitle: 'Scrie ce vrei să păstrezi și ce dimensiuni au obiectele (lungime și lățime).',
		example: 'canapea',
		exampleSize: [240, 95]
	}
);

/* ---- DORMITOR ---- */
const D: Predicate = (a) => picked(a, 'dormitor');
S.push(
	{ ...card('dormitor', D), id: 'd_card' },
	{
		id: 'd1',
		chapter: 'dormitor',
		kind: 'single',
		when: D,
		title: 'Cine va dormi aici?',
		options: [
			{ value: 'cuplu', label: 'Cuplu', icon: 'two' },
			{ value: 'adult', label: 'Un adult', icon: 'person' },
			{ value: 'copil', label: 'Un copil', icon: 'child' },
			{ value: 'doi_copii', label: 'Doi copii', icon: 'kids' },
			{ value: 'oaspeti', label: 'Oaspeți', icon: 'moon' },
			{ value: 'altcineva', label: 'Altcineva', icon: 'other' }
		],
		followUp: {
			when: (v) => v === 'altcineva',
			key: 'd1_other',
			kind: 'input',
			label: 'Cine?',
			placeholder: 'Scrie pe scurt'
		}
	},
	{
		id: 'd2',
		chapter: 'dormitor',
		kind: 'compound',
		when: D,
		title: 'Ce vrei în dormitor?',
		subtitle: 'Bifează tot ce ai nevoie.',
		fields: [
			{
				key: 'bed',
				kind: 'pills',
				label: 'Patul — lățime saltea',
				other: { value: 'altceva', key: 'bedOther', placeholder: 'Ce fel de pat?' },
				options: [
					{ value: '90', label: '90 cm' },
					{ value: '120', label: '120 cm' },
					{ value: '140', label: '140 cm' },
					{ value: '160', label: '160 cm' },
					{ value: '180', label: '180 cm' },
					{ value: '200', label: '200 cm' },
					{ value: 'canapea', label: 'Canapea extensibilă' },
					{ value: 'suspendate', label: 'Paturi suspendate' },
					{ value: 'altceva', label: 'Altceva' }
				]
			},
			{
				key: 'wants',
				kind: 'pillsMulti',
				tiles: true,
				label: 'În afară de pat',
				other: { value: 'altceva', key: 'wantsOther', placeholder: 'Ce anume?' },
				options: [
					{ value: 'dulap', label: 'Dulap', icon: 'wardrobe' },
					{ value: 'noptiera', label: 'Noptieră', icon: 'bedroom' },
					{ value: 'machiaj', label: 'Măsuță de machiaj', icon: 'mirror' },
					{ value: 'tv', label: 'Televizor', icon: 'tv' },
					{ value: 'birou', label: 'Birou', icon: 'office' },
					{ value: 'fotoliu', label: 'Un fotoliu, colț de citit', icon: 'armchair' },
					{ value: 'altceva', label: 'Altceva', icon: 'other' }
				]
			}
		]
	},
	{
		id: 'd3',
		chapter: 'dormitor',
		kind: 'text',
		when: D,
		title:
			'Care e problema principală pe care vrei să o rezolvi în dormitor? Și ce nu poate lipsi?',
		fields: [
			PROBLEM(['nu știu unde să pun patul', 'nu am loc pentru un dulap mai mare', 'nu știu ce încape']),
			MUST(['pat mare', 'dulap', 'birou', 'TV'])
		]
	},
	{
		id: 'd4',
		chapter: 'dormitor',
		kind: 'furniture',
		room: 'dormitor',
		when: D,
		title: 'Ai deja mobilier pe care vrei să îl păstrezi în dormitor?',
		subtitle: 'Scrie ce vrei să păstrezi și cam ce dimensiuni are (lungime și lățime).',
		example: 'pat',
		exampleSize: [172, 220]
	}
);

/* ---- BIROU · BAIE · HOL · ALTĂ CAMERĂ ---- */

interface ExtraRoom {
	id: RoomId;
	x1: TextScreen['fields'] | Omit<MultiScreen, keyof Base | 'kind'>;
	x1Title: string;
	x1Subtitle?: string;
	problem: string[];
	must: string[];
	keepTitle: string;
	keepSubtitle: string;
	example: string;
	exampleSize: [number, number];
}

const EXTRA_ROOMS: ExtraRoom[] = [
	{
		id: 'birou',
		x1Title: 'Ce ai nevoie în birou?',
		x1: [
			{
				key: 'text',
				placeholder: 'Obiecte, activități etc.',
				chips: ['un birou', 'loc pentru playstation', 'bibliotecă', 'canapea pentru musafiri', 'imprimantă']
			}
		],
		problem: [
			'nu știu unde să pun biroul',
			'nu am suficient spațiu de depozitare',
			'nu știu dacă încape o canapea extensibilă',
			'nu am loc de dulap'
		],
		must: ['un birou de 150 cm', 'comodă / dulap', 'spațiu pentru acte', 'fotolii'],
		keepTitle: 'Ai deja mobilier pe care vrei să îl păstrezi în birou?',
		keepSubtitle: 'Scrie ce vrei să păstrezi și ce dimensiuni au (lungime și lățime).',
		example: 'birou',
		exampleSize: [120, 60]
	},
	{
		id: 'baie',
		x1Title: 'Ce obiecte sanitare vrei în baie?',
		x1Subtitle: 'Selectează din listă tot ce îți dorești să ai în baie.',
		x1: {
			options: [
				{ value: 'cada', label: 'Cadă' },
				{ value: 'dus_cabina', label: 'Duș cu cabină' },
				{ value: 'dus_rigola', label: 'Duș cu rigolă în pardoseală' },
				{ value: 'masina_spalat', label: 'Mașină de spălat' },
				{ value: 'uscator', label: 'Uscător de rufe' },
				{ value: 'dulap', label: 'Dulap' },
				{ value: 'lavoar', label: 'Lavoar' },
				{ value: 'doua_lavoare', label: '2 lavoare' },
				{ value: 'toaleta', label: 'Toaletă' },
				{ value: 'bideu', label: 'Bideu' },
				{ value: 'portprosop', label: 'Portprosop' },
				{
					value: 'altceva',
					label: 'Altceva',
					followUp: { key: 'x1_baie_other', kind: 'input', label: 'Ce anume?', placeholder: 'Scrie pe scurt' }
				}
			]
		},
		problem: [
			'nu încape cada',
			'nu am loc de mașină de spălat',
			'nu știu unde să pun lavoarul',
			'prea puțin spațiu de depozitare'
		],
		must: ['bideu', 'duș', 'toaletă separată', 'depozitare'],
		keepTitle: 'Ai deja obiecte pe care vrei să le păstrezi în baie?',
		keepSubtitle: 'Scrie ce vrei să păstrezi și ce dimensiuni au (lungime și lățime).',
		example: 'mașina de spălat',
		exampleSize: [60, 60]
	},
	{
		id: 'hol',
		x1Title: 'Ce obiecte ai nevoie în hol?',
		x1Subtitle: 'Selectează din lista de mai jos.',
		x1: {
			options: [
				{ value: 'cuier', label: 'Cuier' },
				{ value: 'pantofar', label: 'Pantofar' },
				{ value: 'dulap', label: 'Dulap' },
				{ value: 'oglinda', label: 'Oglindă' },
				{ value: 'banca', label: 'Scaun / banchetă' },
				{ value: 'polita', label: 'Poliță' },
				{
					value: 'altceva',
					label: 'Altceva',
					followUp: { key: 'x1_hol_other', kind: 'input', label: 'Ce anume?', placeholder: 'Scrie pe scurt' }
				}
			]
		},
		problem: [
			'nu am loc de geci / genți',
			'nu am loc de pantofi',
			'nu știu unde să pun dulapul',
			'nu am loc suficient'
		],
		must: ['pantofar', 'loc pentru geci', 'loc unde să mă încalț', 'spațiu de depozitare cât mai mare'],
		keepTitle: 'Ai deja mobilier pe care vrei să îl păstrezi în hol?',
		keepSubtitle: 'Scrie ce vrei să păstrezi și ce dimensiuni au obiectele (lungime și lățime).',
		example: 'pantofar',
		exampleSize: [80, 30]
	},
	{
		id: 'alta',
		x1Title: 'Ce cameră este?',
		x1: [
			{ key: 'room', placeholder: 'cameră tehnică, terasă, spălătorie etc.' },
			{
				key: 'text',
				label: 'Ce vrei să aibă această cameră?',
				placeholder: 'Obiecte, activități, descrie ce ai nevoie aici',
				chips: ['depozitare', 'centrală', 'mașină de spălat', 'lavoar', 'tablou electric']
			}
		],
		problem: ['nu știu unde să pun centrala', 'nu am loc pentru depozitare'],
		must: ['canapea', 'depozitare', 'lavoar'],
		keepTitle: 'Ai deja mobilier pe care vrei să îl păstrezi în cameră?',
		keepSubtitle: 'Scrie ce vrei să păstrezi și ce dimensiuni au obiectele (lungime și lățime).',
		example: 'centrală',
		exampleSize: [35, 50]
	}
];

for (const r of EXTRA_ROOMS) {
	const W: Predicate = (a) => picked(a, r.id);
	const x1: Screen = Array.isArray(r.x1)
		? { id: `x1_${r.id}`, chapter: r.id, kind: 'text', when: W, title: r.x1Title, fields: r.x1 }
		: {
				id: `x1_${r.id}`,
				chapter: r.id,
				kind: 'multi',
				when: W,
				allowEmpty: true,
				title: r.x1Title,
				subtitle: r.x1Subtitle,
				...r.x1
			};
	S.push(
		{ ...card(r.id, W), id: `x_card_${r.id}` },
		x1,
		{
			id: `x2_${r.id}`,
			chapter: r.id,
			kind: 'text',
			when: W,
			title: `Care e problema principală pe care vrei să o rezolvi ${ROOMS.find((x) => x.id === r.id)!.in}? Și ce nu poate lipsi?`,
			fields: [PROBLEM(r.problem), MUST(r.must)]
		},
		{
			id: `x3_${r.id}`,
			chapter: r.id,
			kind: 'furniture',
			room: r.id,
			when: W,
			title: r.keepTitle,
			subtitle: r.keepSubtitle,
			example: r.example,
			exampleSize: r.exampleSize
		}
	);
}

export const CHAPTER_LABEL: Record<string, string> = {
	despre_tine: 'Despre tine',
	planuri: 'Planuri',
	locuinta: 'Locuința',
	comun: 'Despre tine'
};
for (const r of ROOMS) CHAPTER_LABEL[r.id] = r.label;

/* ================= shared helpers over the screen list ================= */

export const screenById = (id: string): Screen | undefined => S.find((s) => s.id === id);

export const isVisible = (s: Screen, a: Answers): boolean => !s.when || !!s.when(a);

export const visibleScreens = (a: Answers): Screen[] => S.filter((s) => isVisible(s, a));

/** Options of a screen, resolved against the answers (function options + per-option showIf). */
export function resolveOptions(s: Screen, a: Answers): Option[] {
	if (s.kind !== 'single' && s.kind !== 'multi') return [];
	const raw = typeof s.options === 'function' ? s.options(a) : s.options || [];
	return raw.filter((o) => !o.showIf || o.showIf(a));
}

/** The cards of a `cards` screen that apply to the answers so far. */
export function resolveCards(s: Screen, a: Answers): AppCard[] {
	if (s.kind !== 'cards') return [];
	return s.cards.filter((c) => !c.showIf || c.showIf(a));
}

/** The groups of a card that apply to the card's own draft. */
export function resolveGroups(c: AppCard, draft: Record<string, unknown>): CardGroup[] {
	return (c.groups ?? []).filter((g) => !g.showIf || g.showIf(draft));
}

/** Options of a compound field, resolved against the answers. */
export function resolveFieldOptions(f: Field, a: Answers): Option[] {
	const raw = typeof f.options === 'function' ? f.options(a) : f.options || [];
	return raw.filter((o) => !o.showIf || o.showIf(a));
}

/** The follow-up of a `single` screen, if the picked value opens it. */
export function activeFollowUp(s: Screen, a: Answers): FollowUp | null {
	if (s.kind !== 'single' || !s.followUp) return null;
	const v = a[s.id];
	if (v === undefined) return null;
	const when = s.followUp.when;
	return !when || when(v as string) ? s.followUp : null;
}

/** Is this card ticked? An `always` card is open from the start. */
export function cardOn(card: AppCard, draft: Record<string, unknown>, pick?: string): boolean {
	if (card.always) return true;
	if (pick) return draft[pick] === card.value;
	return draft[card.value] === true;
}

/** Does a compound field show, given the screen's draft and the answers? */
export function fieldVisible(f: Field, draft: Record<string, unknown>, a: Answers): boolean {
	return !f.showIf || f.showIf(draft, a);
}

/** The furniture rows of a `furniture` answer, empty rows dropped. */
export function furnitureItems(v: unknown): FurnitureItem[] {
	const items = (v as { items?: unknown } | undefined)?.items;
	if (!Array.isArray(items)) return [];
	return (items as Partial<FurnitureItem>[])
		.map((x) => ({
			name: String(x?.name ?? '').trim(),
			length: String(x?.length ?? '').trim(),
			width: String(x?.width ?? '').trim()
		}))
		.filter((x) => x.name || x.length || x.width);
}
