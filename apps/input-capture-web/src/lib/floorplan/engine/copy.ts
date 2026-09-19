/**
 * Every word the editor shows on screen. The app speaks Romanian (sentence
 * case, addressing the client as "tu"), so the engine does too; geometry, ids,
 * classes, data-testids and the model's own vocabulary ('wall' / 'open' /
 * 'window' / 'door') are untouched. A line that differs between a finger and a
 * mouse is a function of `touch`.
 */

/** A hint line in the words of whatever the client last touched the screen with. */
export type HintLine = (touch: boolean) => string;

export interface HintCopy {
	empty: HintLine;
	drawing: HintLine;
	wallMade: HintLine;
	wallOn: HintLine;
	openOn: HintLine;
	openFocus: HintLine;
	windowOn: HintLine;
	doorOn: HintLine;
	noWall: HintLine;
	windowFocus: HintLine;
	doorFocus: HintLine;
	wallFocus: HintLine;
	zoom: HintLine;
	landmarkOn: (touch: boolean, kind: string) => string;
	landmarkFocus: () => string;
	landmarkIdle: HintLine;
	saving: () => string;
}

const hint: HintCopy = {
	empty(touch) {
		return touch
			? 'Alege <b>Perete</b>, apoi trage cu degetul ca să faci primul perete.'
			: 'Alege <b>Perete</b> (tasta P), apoi ține apăsat și trage ca să faci primul perete.';
	},
	drawing(touch) {
		return touch
			? 'Ridică degetul ca să termini peretele.'
			: 'Dă drumul butonului ca să termini peretele. Esc renunță.';
	},
	wallMade(touch) {
		return touch
			? 'Atinge numărul ca să scrii lungimea. Pentru încă un perete, alege din nou Perete.'
			: 'Dă clic pe număr ca să scrii lungimea. Pentru încă un perete, alege din nou Perete (P).';
	},
	wallOn(touch) {
		return touch
			? 'Trage cu degetul de la un capăt al peretelui la celălalt.'
			: 'Ține apăsat și trage de la un capăt al peretelui la celălalt.';
	},
	openOn() {
		return 'Trage pe unde camera se deschide spre altă cameră.';
	},
	openFocus(touch) {
		return touch
			? 'Atinge numărul ca să scrii lungimea. Trage linia ca s-o muți.'
			: 'Dă clic pe număr ca să scrii lungimea. Trage linia ca s-o muți.';
	},
	windowOn(touch) {
		return touch ? 'Atinge peretele pe care e fereastra.' : 'Dă clic pe peretele pe care e fereastra.';
	},
	doorOn(touch) {
		return touch ? 'Atinge peretele pe care e ușa.' : 'Dă clic pe peretele pe care e ușa.';
	},
	noWall() {
		return 'Desenează întâi un perete.';
	},
	windowFocus(touch) {
		return touch
			? 'Trage fereastra ca s-o muți pe perete. Atinge înălțimea pervazului ca s-o schimbi.'
			: 'Trage fereastra ca s-o muți pe perete. Dă clic pe înălțimea pervazului ca s-o schimbi.';
	},
	doorFocus(touch) {
		return touch
			? 'Trage ușa ca s-o muți pe perete. Apasă Rotește până se deschide ca la tine.'
			: 'Trage ușa ca s-o muți pe perete. Apasă Rotește (R) până se deschide ca la tine.';
	},
	wallFocus(touch) {
		return touch
			? 'Trage peretele ca să-l muți. Atinge numărul ca să schimbi lungimea.'
			: 'Trage peretele ca să-l muți. Dă clic pe număr ca să schimbi lungimea.';
	},
	zoom(touch) {
		return touch
			? 'Apropie sau depărtează două degete ca să mărești. Cu două degete muți planul.'
			: 'Rotița mărește în jurul cursorului. Trage de fundal ca să muți planul.';
	},
	landmarkOn(touch, kind) {
		const it = RO.landmarkThe[kind] || '';
		return touch ? 'Atinge peretele unde e ' + it + '.' : 'Dă clic pe peretele unde e ' + it + '.';
	},
	landmarkFocus() {
		return 'Trage pătratul pe perete. Trage-l peste perete ca să-l muți pe partea cealaltă.';
	},
	landmarkIdle(touch) {
		return touch
			? 'Atinge un pătrat ca să-l muți sau să-l ștergi.'
			: 'Dă clic pe un pătrat ca să-l muți sau să-l ștergi.';
	},
	saving() {
		return 'Se salvează…';
	}
};

export const RO = {
	undo: 'Anulează',
	redo: 'Refă',
	zoomIn: 'Mărește',
	zoomOut: 'Micșorează',
	fit: 'Încadrează',
	width: 'Lățime',
	sill: 'Înălțime pervaz',
	rotate: 'Rotește',
	del: 'Șterge',
	help: 'Cum desenez',
	letMeFix: 'Mai schimb eu',
	/* the field names that appear inside the metres question, mid-sentence */
	fieldLength: 'lungime',
	fieldWidth: 'lățime',
	fieldSill: 'înălțimea pervazului',
	hint,
	/* each landmark named the way the hint says it, mid-sentence */
	landmarkThe: {
		water: 'țeava de apă',
		gas: 'gazul',
		boiler: 'centrala',
		airConditioning: 'aerul condiționat',
		fireplace: 'șemineul',
		radiator: 'caloriferul',
		hoodVent: 'evacuarea hotei'
	} as Record<string, string | undefined>,
	firstWall: 'Desenează primul perete ca să începi.',
	freeEnds(n: number): string {
		return n === 1
			? 'Un capăt de perete nu e legat de nimic încă.'
			: n + ' capete de perete nu sunt legate de nimic încă.';
	},
	notClosed: 'Pereții nu formează încă un contur închis.',
	metresQuestion(raw: string, label: string, cm: number): string {
		return (
			'Ai scris „' +
			raw +
			'” la ' +
			label +
			'. Aici se lucrează doar în centimetri ' +
			'întregi, iar asta arată a ' +
			raw +
			' m — ai vrut să spui ' +
			cm +
			' cm?'
		);
	},
	metresYes(cm: number): string {
		return cm + ' cm — da';
	},
	clamp(max: number): string {
		return 'Nu e destul perete acolo — încape cel mult ' + max + ' cm.';
	},
	clampYes(max: number): string {
		return 'Folosește ' + max + ' cm';
	},
	/* the subject of the two sliding lines, by the kind being dragged */
	windowSubject: 'Fereastra',
	doorSubject: 'Ușa',
	slidesOnWall(subject: string): string {
		return subject + ' merge pe perete și după colț, cât timp peretele continuă.';
	},
	slidesPastEnd(subject: string): string {
		return subject + ' poate trece de capătul liber. Apoi continuă peretele din capătul ei.';
	}
};

/* The landmark line names a kind; a host that sets that state by name has none
   to give, and the sentence reads without it. */
const OVERRIDES: Record<string, HintLine | undefined> = {
	...hint,
	landmarkOn: (touch) => hint.landmarkOn(touch, '')
};

/**
 * The line a host-set hint state shows, or null where the engine has none for
 * it: a wrong line reads as the truth.
 */
export function hintOverrideText(state: string, touch: boolean): string | null {
	const line = OVERRIDES[state];
	return line ? line(touch) : null;
}
