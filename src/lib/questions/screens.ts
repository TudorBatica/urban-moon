import type { Answers, RoomId } from '$lib/types';
import { ROOMS, SMALL } from './rooms';
import { kids, notCooking, peopleCount, picked, toddlers, yn } from './predicates';

export { picked, kids, toddlers, notCooking, hasMachine, hh, peopleCount, yn } from './predicates';

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

interface Base {
	id: string;
	chapter: ChapterId;
	when?: Predicate;
	title?: string;
	subtitle?: string;
	room?: RoomId;
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
export interface CardScreen extends Base {
	kind: 'card';
	minutes?: string;
	blurb?: string;
}
export interface RouteScreen extends Base {
	kind: 'route';
	href: string;
}

export type Screen =
	| SingleScreen
	| MultiScreen
	| CompoundScreen
	| TextScreen
	| CardsScreen
	| CardScreen
	| RouteScreen;

/* ================= screens — ported from `S` in ../index.html ================= */

export const S: Screen[] = [];

/* ---- DESPRE TINE ---- */
S.push(
	{
		id: 'c_identity',
		chapter: 'despre_tine',
		kind: 'compound',
		title: 'Hai să începem cu tine.',
		subtitle:
			'Numele și emailul cu care ai făcut plata, ca să legăm răspunsurile de proiectul tău.',
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
		subtitle: 'Poți alege mai multe. Pentru fiecare, vin câteva întrebări doar despre ea.',
		options: ROOMS.map((r) => ({ value: r.id, label: r.label, icon: r.icon }))
	},
	/* ---- PLANURI (new: the plans step lives on its own route) ---- */
	{ id: 'planuri', chapter: 'planuri', kind: 'route', href: '/planuri' },
	/* ---- LOCUINȚA ---- */
	{
		id: 'c_stage',
		chapter: 'locuinta',
		kind: 'single',
		title: 'În ce etapă este locuința?',
		options: [
			{ value: 'noua', label: 'E nouă, goală', hint: 'nu e nimic în ea încă', icon: 'houseNew' },
			{
				value: 'constructie',
				label: 'E în construcție',
				hint: 'o primim în curând',
				icon: 'crane'
			},
			{ value: 'renovam', label: 'Renovăm', hint: 'scoatem tot ce e acum', icon: 'hammer' },
			{
				value: 'pastram',
				label: 'Păstrăm camerele cum sunt',
				hint: 'schimbăm doar mobila',
				icon: 'sofa'
			}
		]
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

const ANYWHERE: Option = {
	value: 'oriunde',
	label: 'Oriunde',
	hint: 'te ajutăm noi',
	icon: 'anywhere'
};

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
					ANYWHERE,
					{ value: 'podea', label: 'Pe podea', hint: 'sub plită', icon: 'ovenFloor' },
					{ value: 'coloana', label: 'În coloană', hint: 'la înălțime', icon: 'ovenColumn' }
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
					ANYWHERE,
					{ value: 'blat', label: 'Pe blat', icon: 'counterTop' },
					{ value: 'coloana', label: 'În coloană', icon: 'microColumn' }
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
					ANYWHERE,
					{ value: 'sub_blat', label: 'Sub blat', icon: 'underCounter' },
					{ value: 'coloana', label: 'În coloană', icon: 'ovenColumn' }
				]
			}
		]
	}
];
S.push(
	{
		id: 'k_card',
		chapter: 'bucatarie',
		kind: 'card',
		room: 'bucatarie',
		when: K,
		minutes: 'Cam 3 minute.',
		blurb: 'Următoarele întrebări sunt doar despre bucătărie.'
	},
	{
		id: 'k1',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'Cum arată o cină obișnuită la tine acasă, într-o zi din săptămână?',
		options: [
			{ value: 'gatim', label: 'Gătim', icon: 'pans' },
			{
				value: 'incalzim',
				label: 'Încălzim ceva gătit de noi dinainte',
				icon: 'reheat'
			},
			{ value: 'comandam', label: 'Comandăm sau mâncăm în oraș', icon: 'delivery' }
		]
	},
	{
		id: 'k2',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'Și în weekend?',
		options: [
			{ value: 'gatim', label: 'Gătim', icon: 'pans' },
			{
				value: 'incalzim',
				label: 'Încălzim ceva gătit de noi dinainte',
				icon: 'reheat'
			},
			{ value: 'comandam', label: 'Comandăm sau mâncăm în oraș', icon: 'delivery' }
		]
	},
	{
		id: 'k3',
		chapter: 'bucatarie',
		kind: 'single',
		when: (a) => K(a) && !notCooking(a),
		title: 'Cine gătește, de obicei?',
		options: [
			{ value: 'una', label: 'Mai mult o singură persoană', icon: 'person' },
			{ value: 'doi', label: 'Doi, în același timp', icon: 'two' }
		]
	},
	{
		id: 'k4',
		chapter: 'bucatarie',
		kind: 'multi',
		when: (a) => K(a) && !notCooking(a),
		max: 3,
		title: 'Ce se gătește, de obicei?',
		subtitle: 'Bifează ce se întâmplă de obicei — până la trei.',
		options: [
			{
				value: 'lent',
				label: 'Mâncăruri care stau mult pe foc',
				hint: 'ciorbe, tocănițe, sarmale',
				icon: 'kitchen'
			},
			{ value: 'tigaie', label: 'Rapid, la tigaie', hint: 'totul se întâmplă pe plită', icon: 'pan' },
			{ value: 'copt', label: 'Copt', hint: 'pâine, prăjituri, cozonac', icon: 'bread' },
			{ value: 'cuptor', label: 'La cuptor', hint: 'fripturi, legume coapte', icon: 'oven' },
			{
				value: 'taiat',
				label: 'Mult tocat și tăiat',
				hint: 'salate, legume, lucruri proaspete',
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
			{ value: 'prieteni', label: '…ne strângem cu prietenii când avem musafiri', icon: 'cheers' },
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
		subtitle:
			'Cele pe care le ai deja și le păstrezi, sau pe care le vei cumpăra.',
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
			{ value: 'freezer', label: 'Congelator separat', hint: 'sau ladă frigorifică', icon: 'chest' },
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
		title: 'Care dintre acestea le ai prin casă?',
		subtitle: 'Bifează tot ce ai. Dacă nimic, mergi mai departe.',
		options: SMALL
	},
	{
		id: 'k5_plasare',
		chapter: 'bucatarie',
		kind: 'cards',
		when: (a) => K(a) && placeableCards.some((c) => !c.showIf || c.showIf(a)),
		title: 'Preferințe de plasare',
		subtitle:
			'Spune-ne dacă ai preferințe de plasare pentru ele. Dacă nu ai, le găsim noi cel mai bun loc.',
		cards: placeableCards
	},
	{
		id: 'k7',
		chapter: 'bucatarie',
		kind: 'single',
		when: K,
		title: 'Cum preparați cafeaua?',
		options: [
			{ value: 'espressor', label: 'Espressor', icon: 'espresso' },
			{ value: 'capsule', label: 'Espressor capsule', icon: 'capsule' },
			{ value: 'ibric', label: 'La ibric', icon: 'ibric' },
			{ value: 'filtru', label: 'Cafetieră cu filtru', icon: 'filter' },
			{ value: 'manual', label: 'Manual', hint: 'moka, French press', icon: 'moka' },
			{ value: 'nu', label: 'Nu bem cafea', icon: 'nocoffee' }
		],
		followUp: {
			when: (v) => ['espressor', 'capsule', 'filtru', 'manual'].includes(v),
			key: 'k7_freq',
			kind: 'pills',
			label: 'Cât de des folosiți aparatul?',
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
		title: 'Depozitezi alimente sau ustensile de bucătărie și în afara bucătăriei?',
		options: [
			{ value: 'balcon', label: 'Da, pe balcon', icon: 'balconyClosed' },
			{ value: 'debara', label: 'Da, în debara sau cămară', icon: 'pantry' },
			{ value: 'pivnita', label: 'Da, în pivniță', icon: 'cellar' },
			{ value: 'hol', label: 'Da, pe hol', icon: 'hallway' },
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
			label: 'Câte persoane trebuie să încapă la masă',
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
			'Ce te enervează la bucătăria în care gătești acum? O greșeală pe care nu vrei s-o mai repeți. Ceva care n-a avut niciodată un loc al lui.',
		fields: [
			{
				key: 'text',
				placeholder: 'Scrie liber, oricât de mărunt.',
				chips: [
					'n-avem loc pentru…',
					'prea puțin blat',
					'frigiderul stă pe hol',
					'electrocasnice peste tot',
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
				chips: [
					'multă lumină',
					'o masă mare',
					'un blat lung, liber',
					'o insulă',
					'să se închidă ușa',
					'totul la îndemână',
					'loc pentru toată lumea'
				]
			}
		]
	},
	{
		id: 'k13',
		chapter: 'bucatarie',
		kind: 'text',
		when: K,
		title: 'Ai deja mobilier pe care vrei să-l păstrezi în bucătărie?',
		subtitle:
			'Scrie ce vrei să păstrezi și cam ce dimensiuni are — trebuie să-l încadrăm astfel încât să încapă.',
		fields: [
			{
				key: 'text',
				placeholder: 'De exemplu: masa, 140 × 80 cm',
				chips: ['masa și scaunele', 'colțarul', 'un bufet sau dulap', 'nimic']
			}
		]
	}
);

/* ---- LIVING ---- */
const L: Predicate = (a) => picked(a, 'living');
S.push(
	{
		id: 'l_card',
		chapter: 'living',
		kind: 'card',
		room: 'living',
		when: L,
		minutes: 'Cam un minut.',
		blurb: 'Următoarele întrebări sunt doar despre living.'
	},
	{
		id: 'l1',
		chapter: 'living',
		kind: 'multi',
		when: L,
		title: 'Ce se întâmplă în living?',
		subtitle: 'Bifează tot ce se aplică.',
		options: [
			{ value: 'tv', label: 'Ne uităm la filme, la televizor', icon: 'tv' },
			{
				value: 'vorba',
				label: 'Stăm de vorbă',
				hint: 'între noi sau cu musafirii',
				icon: 'chat'
			},
			{ value: 'lucru', label: 'Lucrează cineva', hint: 'birou, laptop', icon: 'laptop' },
			{
				value: 'masa',
				label: 'Luăm masa aici',
				icon: 'table',
				followUp: {
					key: 'l1_seats',
					kind: 'stepper',
					label: 'Pentru câte persoane?',
					min: 1,
					max: 12,
					default: 4
				}
			},
			{ value: 'copii', label: 'Se joacă copiii', icon: 'kids', showIf: kids },
			{
				value: 'dormit',
				label: 'Doarme cineva aici din când în când',
				hint: 'musafiri, canapea extensibilă',
				icon: 'moon'
			},
			{ value: 'citit', label: 'Citit, liniște, un colț doar al meu', icon: 'book' }
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
			{
				key: 'problem',
				label: 'Problema',
				placeholder: 'Ce nu merge acum',
				chips: [
					'nu știu unde să pun canapeaua',
					'televizorul se bate cu fereastra',
					'prea puțin spațiu de depozitare',
					'masa nu încape',
					'e loc de trecere, nu de stat'
				]
			},
			{
				key: 'must',
				label: 'Nu poate lipsi',
				placeholder: 'Ce trebuie neapărat să aibă',
				chips: [
					'o canapea mare',
					'masă de 6 persoane',
					'un birou',
					'bibliotecă',
					'loc de joacă',
					'multă lumină'
				]
			}
		]
	},
	{
		id: 'l4',
		chapter: 'living',
		kind: 'text',
		when: L,
		title: 'Ai deja mobilier pe care vrei să îl păstrezi în living?',
		subtitle:
			'Scrie ce vrei să păstrezi și cam ce dimensiuni are — trebuie să-l încadrăm astfel încât să încapă.',
		fields: [
			{
				key: 'text',
				placeholder: 'De exemplu: canapeaua, 240 cm',
				chips: ['canapeaua', 'masa', 'biblioteca', 'un dulap', 'nimic']
			}
		]
	}
);

/* ---- DORMITOR ---- */
const D: Predicate = (a) => picked(a, 'dormitor');
S.push(
	{
		id: 'd_card',
		chapter: 'dormitor',
		kind: 'card',
		room: 'dormitor',
		when: D,
		minutes: 'Cam un minut.',
		blurb: 'Următoarele întrebări sunt doar despre dormitor.'
	},
	{
		id: 'd1',
		chapter: 'dormitor',
		kind: 'single',
		when: D,
		title: 'Pentru cine e dormitorul?',
		options: [
			{ value: 'doi', label: 'Pentru noi doi', icon: 'two' },
			{ value: 'una', label: 'Pentru o persoană', icon: 'person' },
			{ value: 'patut', label: 'Pentru noi doi, plus un pătuț', icon: 'cot', showIf: toddlers }
		]
	},
	{
		id: 'd2',
		chapter: 'dormitor',
		kind: 'compound',
		when: D,
		title: 'Ce vrei în dormitor?',
		subtitle: 'Bifează tot ce se aplică.',
		fields: [
			{
				key: 'bed',
				kind: 'pills',
				label: 'Patul — lățime',
				options: [
					{ value: '140', label: '140 cm' },
					{ value: '160', label: '160 cm' },
					{ value: '180', label: '180 cm' },
					{ value: '200', label: '200 cm' },
					{ value: 'nu_stim', label: 'Nu știm încă' }
				]
			},
			{
				key: 'wants',
				kind: 'pillsMulti',
				tiles: true,
				label: 'În afară de pat',
				exclusive: 'doar',
				options: [
					{ value: 'dressing', label: 'Dressing sau dulap mare', icon: 'wardrobe' },
					{ value: 'machiaj', label: 'Măsuță de machiaj', icon: 'mirror' },
					{ value: 'tv', label: 'Televizor', icon: 'tv' },
					{ value: 'birou', label: 'Birou, loc de lucru', icon: 'office' },
					{ value: 'fotoliu', label: 'Un fotoliu, colț de citit', icon: 'armchair' },
					{ value: 'doar', label: 'Doar patul și dulapul', icon: 'bedroom' }
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
			{
				key: 'problem',
				label: 'Problema',
				placeholder: 'Ce nu merge acum',
				chips: [
					'dulapul nu încape',
					'patul stă lipit de perete',
					'n-avem unde pune hainele',
					'e prea întuneric',
					'se aude tot'
				]
			},
			{
				key: 'must',
				label: 'Nu poate lipsi',
				placeholder: 'Ce trebuie neapărat să aibă',
				chips: ['pat mare', 'dressing', 'liniște', 'măsuță de machiaj', 'un loc de lucru']
			}
		]
	},
	{
		id: 'd4',
		chapter: 'dormitor',
		kind: 'text',
		when: D,
		title: 'Ai deja mobilier pe care vrei să îl păstrezi în dormitor?',
		subtitle:
			'Scrie ce vrei să păstrezi și cam ce dimensiuni are — trebuie să-l încadrăm astfel încât să încapă.',
		fields: [
			{
				key: 'text',
				placeholder: 'De exemplu: patul, 180 × 200 cm',
				chips: ['patul', 'dulapul', 'noptierele', 'comoda', 'nimic']
			}
		]
	}
);

/* ---- ORICE ALTĂ CAMERĂ ---- */
for (const r of ROOMS.filter((x) => x.chips)) {
	const W: Predicate = (a) => picked(a, r.id);
	S.push(
		{
			id: `x_card_${r.id}`,
			chapter: r.id,
			kind: 'card',
			room: r.id,
			when: W,
			minutes: 'Sub un minut.',
			blurb: `Următoarele întrebări sunt doar despre ${r.the}.`
		},
		{
			id: `x1_${r.id}`,
			chapter: r.id,
			kind: 'text',
			when: W,
			title: `Ce se întâmplă ${r.in} și ce vrei să aibă?`,
			fields: [
				{ key: 'text', placeholder: 'Activități, obiecte, oricum îți vine', chips: r.chips }
			]
		},
		{
			id: `x2_${r.id}`,
			chapter: r.id,
			kind: 'text',
			when: W,
			title: `Care e problema principală pe care vrei să o rezolvi ${r.in}? Și ce nu poate lipsi?`,
			fields: [
				{
					key: 'problem',
					label: 'Problema',
					placeholder: 'Ce nu merge acum',
					chips: [
						'nu încape tot',
						'e prea întuneric',
						'nu știu unde să pun…',
						'prea puțin spațiu de depozitare'
					]
				},
				{
					key: 'must',
					label: 'Nu poate lipsi',
					placeholder: 'Ce trebuie neapărat să aibă',
					chips: ['lumină', 'depozitare', 'liniște', 'loc de lucru']
				}
			]
		},
		{
			id: `x3_${r.id}`,
			chapter: r.id,
			kind: 'text',
			when: W,
			title: `Ai deja mobilier pe care vrei să îl păstrezi ${r.in}?`,
			subtitle:
				'Scrie ce vrei să păstrezi și cam ce dimensiuni are — trebuie să-l încadrăm astfel încât să încapă.',
			fields: [{ key: 'text', placeholder: 'Obiectul și dimensiunile lui', chips: ['nimic'] }]
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

/** The label of an answer value, as in the prototype's `lbl`. */
export function lbl(screenId: string, value: string, fieldKey?: string, a: Answers = {}): string {
	const s = screenById(screenId);
	if (!s) return value;
	let opts: Option[] =
		s.kind === 'single' || s.kind === 'multi'
			? typeof s.options === 'function'
				? s.options(a)
				: s.options || []
			: [];
	if (s.kind === 'cards') {
		/* A ticked card is stored as `<card>: true`; the label is the card's own. */
		const card = fieldKey ? s.cards.find((c) => c.value === fieldKey) : undefined;
		if (card && value === 'true') return card.label;
		const all = s.cards.flatMap((c) => c.groups ?? []);
		const g = fieldKey ? all.find((x) => x.key === fieldKey) : undefined;
		opts = g
			? g.options
			: [...all.flatMap((x) => x.options), ...s.cards.map((c) => ({ value: c.value, label: c.label }))];
	}
	if (fieldKey && (s.kind === 'compound' || s.kind === 'text')) {
		const f = s.fields.find((x) => x.key === fieldKey);
		opts = f && f.options ? (typeof f.options === 'function' ? f.options(a) : f.options) : [];
	}
	const o = opts.find((x) => x.value === value);
	return o ? o.label.replace(/^…/, '') : value;
}
