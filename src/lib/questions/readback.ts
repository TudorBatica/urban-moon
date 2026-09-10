import type { Answers, RoomId } from '$lib/types';
import { ROOMS, roomOf } from './rooms';
import { hasMachine, hh, notCooking, picked } from './predicates';
import { lbl } from './screens';

/* Ported from the summary section of ../index.html:
   householdPortrait · kitchenPortrait/kitchenMeans · livingPortrait/livingMeans ·
   bedroomPortrait/bedroomMeans · joinRo · q. */

export interface RoomReadback {
	roomId: RoomId;
	portrait: string[];
	means: string[];
	quotes: [string, string][];
}

type Dict = Record<string, string>;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function joinRo(list: (string | undefined | null | false)[]): string {
	const l = list.filter(Boolean) as string[];
	if (l.length <= 1) return l.join('');
	return l.slice(0, -1).join(', ') + ' și ' + l[l.length - 1];
}

/** The prototype's `q()` — quote text, trimmed of trailing punctuation. */
export const quoteText = (text: string): string => text.trim().replace(/[.;\s]+$/, '');

/* ================= household ================= */

export function householdPortrait(a: Answers): string[] {
	const d = hh(a);
	const out: string[] = [];
	const people: string[] = [];
	people.push(d.adults === 1 ? 'o persoană adultă' : `${d.adults} adulți`);
	if ((d.children || 0) > 0) {
		const ageMap: Dict = {
			sub3: 'sub 3 ani',
			'3_6': 'între 3 și 6 ani',
			'7_12': 'între 7 și 12 ani',
			teen: 'peste 12 ani'
		};
		const ages = (d.childAges || []).map((v) => ageMap[v]).filter(Boolean);
		people.push(
			(d.children === 1 ? 'un copil' : `${d.children} copii`) +
				(ages.length ? ` (${joinRo(ages)})` : '')
		);
	}
	if (d.elderly === 'da') people.push('o persoană în vârstă');
	let s = `Aici vor locui ${joinRo(people)}`;
	const petMap: Dict = { caine: 'un câine', pisica: 'o pisică', altceva: 'un animal de companie' };
	const pets = (d.pets || []).filter((p) => p !== 'nu').map((p) => petMap[p]);
	if (pets.length) s += `, plus ${joinRo(pets)}`;
	out.push(s + '.');
	const stageMap: Dict = {
		noua: 'Locuința e nouă și goală, deci totul se poate așeza de la zero.',
		constructie:
			'Locuința e încă în construcție, deci prizele și instalațiile se pot planifica înainte de șantier.',
		renovam: 'Renovezi de tot, deci pereții și instalațiile pot fi regândite.',
		pastram: 'Camerele rămân cum sunt; lucrăm în limitele instalațiilor existente.'
	};
	out.push(stageMap[str(a.c_stage) || ''] || '');
	return out.filter(Boolean);
}

/* ================= bucătărie ================= */

export function kitchenPortrait(a: Answers): string[] {
	const p: string[] = [];
	const k1Map: Dict = {
		gatim: 'se gătește',
		incalzim: 'se încălzește ceva gătit de voi dinainte',
		comandam: 'se comandă sau mâncați în oraș'
	};
	const k2Map: Dict = {
		gatim: 'se gătește',
		incalzim: 'se încălzește ceva gătit dinainte',
		comandam: 'se comandă sau mâncați în oraș'
	};
	const k1 = k1Map[str(a.k1) || ''];
	const k2 = k2Map[str(a.k2) || ''];
	if (k1)
		p.push(
			a.k1 === a.k2
				? `Într-o seară obișnuită ${k1}, la fel și în weekend.`
				: `Într-o seară obișnuită ${k1}; în weekend ${k2}.`
		);
	if (notCooking(a))
		p.push(
			'Bucătăria asta nu e o problemă de gătit — e un spațiu de utilitate, și așa o vom trata.'
		);
	if (a.k3) {
		let s =
			a.k3 === 'doi' ? 'Gătiți doi în același timp' : 'De obicei gătește o singură persoană';
		const also = arr(a.k3b).map((v) => lbl('k3b', v, undefined, a));
		if (also.length) s += `, iar bucătăria e și locul unde ${joinRo(also)}`;
		p.push(s + '.');
	}
	const k4 = arr(a.k4);
	if (k4.length) {
		const k4Map: Dict = {
			lent: 'mâncăruri care stau mult pe foc',
			tigaie: 'rapid, la tigaie',
			copt: 'copt',
			cuptor: 'la cuptor',
			taiat: 'mult tocat și tăiat'
		};
		p.push(`Se gătește mai ales ${joinRo(k4.map((v) => k4Map[v] || v))}.`);
	}
	const frig = obj(a.k5_frig);
	const gatit = obj(a.k5_gatit);
	const spalat = obj(a.k5_spalat);
	const plasare = obj(a.k5_plasare);
	if (frig.fridge || frig.freezer || frig.wine) {
		const fMap: Dict = {
			combina: 'o combină',
			side: 'un side-by-side, mai adânc decât blatul',
			incorporabil: 'un frigider încorporabil'
		};
		const bits: string[] = [];
		if (frig.fridge) bits.push(`Frigiderul e ${fMap[str(frig.fridgeType) || ''] || 'de stabilit'}`);
		if (frig.freezer) bits.push('ai și un congelator separat');
		if (frig.wine) {
			const whereMap: Dict = {
				sub_blat: 'sub blat',
				coloana: 'în coloană'
			};
			const where = whereMap[str(plasare.wineWhere) || ''];
			bits.push(`vrei un frigider de vinuri${where ? ' ' + where : ''}`);
		}
		const line = joinRo(bits);
		p.push(line.charAt(0).toUpperCase() + line.slice(1) + '.');
	}
	if (gatit.cook) {
		const powerMap: Dict = { gaz: 'pe gaz', electric: 'electric', mixt: 'mixt' };
		const hobMap: Dict = { gaz: 'pe gaz', vitro: 'vitroceramică', inductie: 'cu inducție' };
		const ovenMap: Dict = { podea: 'pe podea', coloana: 'în coloană, la înălțime' };
		const s =
			gatit.cook === 'aragaz'
				? `Gătești pe aragaz${gatit.aragazPower ? ' ' + powerMap[str(gatit.aragazPower) || ''] : ''}${
						gatit.gasSource === 'butelie'
							? ', cu butelie'
							: gatit.gasSource === 'retea'
								? ', de la rețea'
								: ''
					}`
				: `Ai plită ${hobMap[str(gatit.hob) || ''] || ''} și cuptor separat${
						ovenMap[str(plasare.ovenWhere) || ''] ? ' ' + ovenMap[str(plasare.ovenWhere) || ''] : ''
					}`;
		const extras: (string | null | undefined)[] = [];
		const microMap: Dict = {
			blat: 'microunde pe blat',
			coloana: 'microunde în coloană'
		};
		if (arr(a.k6a).includes('micro'))
			extras.push(microMap[str(plasare.microWhere) || ''] || 'cuptor cu microunde');
		if (spalat.dish) extras.push('mașină de spălat vase');
		if (spalat.washer) extras.push('mașina de spălat rufe în bucătărie');
		const kept = extras.filter(Boolean) as string[];
		p.push(s + (kept.length ? `; apoi ${joinRo(kept)}` : '') + '.');
	}
	const own = arr(a.k6a);
	if (own.length) {
		const names = own.map((v) => lbl('k6a', v, undefined, a).toLowerCase());
		p.push(
			`Prin casă ai ${own.length} aparate mici: ${joinRo(names)}. Pot sta într-o coloană închisă, cu cele de zi cu zi la îndemână.`
		);
	}
	if (a.k7) {
		const cMap: Record<string, string | null> = {
			ibric: 'la ibric, pe plită',
			espressor: 'la espressor',
			capsule: 'la espressorul cu capsule',
			filtru: 'la cafetieră cu filtru',
			manual: 'manual, la moka sau French press',
			nu: null
		};
		const freqMap: Dict = {
			zilnic: 'zilnic',
			saptamanal: 'săptămânal',
			rar: 'rar'
		};
		const c = cMap[str(a.k7) || ''];
		if (c)
			p.push(
				`Cafeaua se face ${c}${a.k7_freq ? ', ' + freqMap[str(a.k7_freq) || ''] : ''}.`
			);
		else p.push('Nu beți cafea, deci nu blocăm blat pentru asta.');
	}
	const k8 = arr(a.k8);
	if (k8.length) {
		if (k8.includes('nu'))
			p.push('Nu ai loc de depozitare în afara bucătăriei: totul trebuie să încapă aici.');
		else {
			const placeMap: Dict = {
				balcon: 'pe balcon',
				debara: 'în debara sau cămară',
				pivnita: 'în pivniță',
				hol: 'pe hol'
			};
			p.push(
				`Mai ai loc de depozitare și în afara bucătăriei: ${joinRo(k8.map((v) => placeMap[v] || v))}.`
			);
		}
	}
	const k9Map: Dict = {
		unul: 'Un singur coș de gunoi, sub chiuvetă.',
		doua_trei: 'Ai nevoie de două-trei coșuri, pentru reciclabile.'
	};
	if (a.k9) p.push(k9Map[str(a.k9) || '']);
	if (a.k10) {
		const seats = a.k10_seats;
		const k10Map: Dict = {
			zilnic: `Mesele de zi cu zi se iau aici, la o masă pentru ${seats}.`,
			rapid: `În bucătărie se ia doar micul dejun și mesele rapide, pentru ${seats}; pentru celelalte aveți masa de dining.`,
			pahar: `Bucătăria e mai mult pentru o cafea sau un pahar cu cineva — ${seats} locuri.`,
			nu: 'Nu se mănâncă în bucătărie.'
		};
		p.push(k10Map[str(a.k10) || '']);
	}
	return p.filter(Boolean);
}

export function kitchenMeans(a: Answers): string[] {
	const m: string[] = [];
	const frig = obj(a.k5_frig);
	const gatit = obj(a.k5_gatit);
	const spalat = obj(a.k5_spalat);
	const plasare = obj(a.k5_plasare);
	const d = hh(a);
	const k4 = arr(a.k4);
	const also = arr(a.k3b);
	/* How they cook drives the prep zone: every day at the stove asks for room,
	   cooking once and reheating asks for storage instead. */
	if (a.k1 === 'gatim')
		m.push('Distanță mai mare între plită și chiuvetă (peste 80 cm) și o zonă de pregătit lată.');
	else if (a.k1 === 'incalzim')
		m.push(
			'Se gătește în avans, deci zona de pregătit poate fi compactă — dar frigiderul și congelatorul primesc loc pentru porții.'
		);
	if (a.k1 !== 'gatim' && a.k2 === 'gatim')
		m.push('Gătitul se strânge în weekend: sertare adânci pentru oale mari și tăvi, folosite rar dar toate odată.');
	if (a.k3 === 'doi')
		m.push(
			'Culoar de minimum 120 cm, ca să încăpeți doi în același timp, și o a doua zonă de pregătit dacă spațiul permite.'
		);
	if (also.includes('prieteni'))
		m.push('Un blat sau o insulă la care musafirii pot sta în picioare, fără să încurce gătitul.');
	if (also.includes('laptop') || also.includes('copii'))
		m.push('Prize și lumină bună la masă, iar masa trebuie să se elibereze repede.');
	if (k4.includes('lent')) m.push('Sertare adânci lângă plită, pentru oale mari.');
	if (k4.includes('copt'))
		m.push('Sertar pentru tăvi la cuptor, loc pentru făină în vrac și robotul rămâne pe blat.');
	if (k4.includes('taiat')) m.push('Blat lung lângă chiuvetă, pentru tăiat.');
	if (frig.fridgeType === 'side')
		m.push(
			'Side-by-side-ul e mai adânc decât blatul: primește nișa lui, nu intră în coloană, iar frontul de lângă el se planifică pe adâncimea lui.'
		);
	if (frig.freezer)
		m.push('Congelatorul separat cere un loc al lui, cu priză — de preferat în afara frontului de gătit.');
	if (frig.wine)
		m.push(
			plasare.wineWhere === 'coloana'
				? 'Frigiderul de vinuri intră în coloană, împreună cu cuptorul.'
				: plasare.wineWhere === 'sub_blat'
					? 'Frigiderul de vinuri ia un corp de bază de 30–60 cm.'
					: 'Frigiderul de vinuri primește 30–60 cm, sub blat sau în coloană — vedem ce iese mai bine din plan.'
		);
	if (gatit.cook === 'aragaz')
		m.push(
			'Nișă de 50–60 cm pentru aragaz' +
				(gatit.gasSource === 'butelie' ? ', plus loc ventilat pentru butelie.' : '.')
		);
	if (plasare.ovenWhere === 'coloana')
		m.push('Cuptorul în coloană se montează la înălțimea ta — o verificăm la planșe.');
	if (plasare.microWhere === 'coloana')
		m.push('Microundele urcă în coloană, deci blatul rămâne liber.');
	if (plasare.microWhere === 'blat')
		m.push('Microundele stau pe blat: le rezervăm 55 cm de blat, cu priză.');
	if (spalat.washer)
		m.push('Mașina de spălat rufe ia 60 cm din front; o punem lângă zona umedă.');
	if (spalat.dish)
		m.push(
			'Mașina de spălat vase stă lângă chiuvetă' +
				(d.elderly === 'da' ? ', ridicată, ca să nu te apleci.' : '.')
		);
	if (arr(a.k6a).length)
		m.push('O coloană închisă pentru aparatele mici; cele de zi cu zi stau la îndemână.');
	if (hasMachine(a) && a.k7_freq !== 'rar')
		m.push('O stație de cafea permanentă, cu priză, apă și loc pentru boabe.');
	if (arr(a.k8).includes('nu'))
		m.push('Depozitare înaltă în bucătărie, ca să absoarbă tot — inclusiv borcanele din toamnă.');
	if (a.k9 === 'doua_trei')
		m.push('Sertar adânc pentru coșuri și un loc de așteptare pentru sticle și cartoane.');
	if (a.k10 === 'zilnic')
		m.push(`Masă la înălțime normală pentru ${a.k10_seats} persoane; colțar dacă încape.`);
	if (a.k10 === 'rapid') m.push('O masă mică sau un blat cu 2–3 locuri.');
	if (a.k10 === 'pahar') m.push('Locuri la bar, la un blat sau la o insulă.');
	if ((d.children || 0) > 0 && (d.childAges || []).some((v) => v === 'sub3' || v === '3_6'))
		m.push('Cuptor ridicat, cu ușa fierbinte în afara razei copiilor.');
	if (d.elderly === 'da') m.push('Rafturile de zi cu zi jos, nimic care să ceară un scăunel.');
	if ((d.pets || []).some((p) => p !== 'nu'))
		m.push('Un loc pentru boluri și mâncarea animalelor, în afara traseului de gătit.');
	const keep = str(obj(a.k13).text);
	if (keep && !/^\s*nimic\s*$/i.test(keep))
		m.push('Mobilierul păstrat se așază primul, iar restul se desenează în jurul lui.');
	return m;
}

/* ================= living ================= */

export function livingPortrait(a: Answers): string[] {
	const p: string[] = [];
	const l1 = arr(a.l1);
	if (l1.length) {
		const actMap: Dict = {
			tv: 'vă uitați la filme',
			vorba: 'stați de vorbă',
			lucru: 'lucrează cineva',
			masa: `luați masa (${a.l1_seats} persoane)`,
			copii: 'se joacă copiii',
			dormit: 'doarme cineva din când în când',
			citit: 'se citește, în liniște'
		};
		p.push(`În living ${joinRo(l1.map((v) => actMap[v]))}.`);
	}
	const l2 = obj(a.l2);
	if (l2.seats) p.push(`Pe canapea și fotolii trebuie să încapă comod ${l2.seats} persoane.`);
	return p;
}

export function livingMeans(a: Answers): string[] {
	const m: string[] = [];
	const l1 = arr(a.l1);
	const seats = obj(a.l2).seats as number | undefined;
	if (l1.includes('tv'))
		m.push('Peretele de televizor nu se bate cu fereastra; canapeaua se orientează spre el.');
	if (seats)
		m.push(
			seats <= 2
				? 'Canapea de două locuri ajunge.'
				: seats <= 3
					? 'Canapea de trei locuri.'
					: 'Canapea de colț sau canapea mare plus fotolii.'
		);
	if (l1.includes('masa')) m.push(`Zonă de masă pentru ${a.l1_seats}, cu loc de tras scaunele.`);
	if (l1.includes('lucru')) m.push('Birou la fereastră, cu priză lângă.');
	if (l1.includes('dormit'))
		m.push('Loc liber în fața canapelei extensibile, ca să se poată deschide.');
	if (l1.includes('copii')) m.push('Podea liberă pentru joacă și depozitare joasă pentru jucării.');
	if (l1.includes('citit')) m.push('Un fotoliu cu lumina lui.');
	const keep = str(obj(a.l4).text);
	if (keep && !/^\s*nimic\s*$/i.test(keep)) m.push('Mobilierul păstrat se așază primul.');
	return m;
}

/* ================= dormitor ================= */

export function bedroomPortrait(a: Answers): string[] {
	const p: string[] = [];
	const d2 = obj(a.d2);
	const d1Map: Dict = {
		doi: 'Dormitorul e pentru voi doi.',
		una: 'Dormitorul e pentru o persoană.',
		patut: 'Dormitorul e pentru voi doi, plus un pătuț.'
	};
	if (a.d1) p.push(d1Map[str(a.d1) || '']);
	if (d2.bed)
		p.push(
			d2.bed === 'nu_stim'
				? 'Lățimea patului e încă de stabilit.'
				: `Patul are ${d2.bed} cm lățime.`
		);
	const wantMap: Dict = {
		dressing: 'dressing sau dulap mare',
		machiaj: 'măsuță de machiaj',
		tv: 'televizor',
		birou: 'un loc de lucru',
		fotoliu: 'un fotoliu de citit'
	};
	const wants = arr(d2.wants);
	const w = wants.filter((v) => v !== 'doar').map((v) => wantMap[v] || v);
	if (w.length) p.push(`În afară de pat vrei ${joinRo(w)}.`);
	else if (wants.includes('doar')) p.push('În afară de pat, doar dulapul.');
	return p.filter(Boolean);
}

export function bedroomMeans(a: Answers): string[] {
	const m: string[] = [];
	const d2 = obj(a.d2);
	const w = arr(d2.wants);
	if (d2.bed && d2.bed !== 'nu_stim')
		m.push(`Patul de ${d2.bed} cm plus 60–70 cm de trecere pe laturile libere.`);
	if (a.d1 === 'patut') m.push('Loc pentru pătuț lângă pat, cu acces din ambele părți.');
	if (w.includes('dressing'))
		m.push('Dulap de 60 cm adâncime cu loc pentru uși, sau un dressing care ia un perete întreg.');
	if (w.includes('machiaj')) m.push('Măsuța de machiaj la fereastră, cu priză.');
	if (w.includes('tv')) m.push('Televizorul pe peretele din fața patului.');
	if (w.includes('birou')) m.push('Biroul la fereastră.');
	const keep = str(obj(a.d4).text);
	if (keep && !/^\s*nimic\s*$/i.test(keep)) m.push('Mobilierul păstrat se așază primul.');
	return m;
}

/* ================= assembly ================= */

const cleanQuotes = (pairs: [string, unknown][]): [string, string][] =>
	pairs
		.map(([label, v]) => [label, (str(v) || '').trim()] as [string, string])
		.filter(([, text]) => text.length > 0);

export function buildReadback(a: Answers): { household: string[]; rooms: RoomReadback[] } {
	const rooms: RoomReadback[] = [];

	if (picked(a, 'bucatarie'))
		rooms.push({
			roomId: 'bucatarie',
			portrait: kitchenPortrait(a),
			means: kitchenMeans(a),
			quotes: cleanQuotes([
				['Ce vrei să faci diferit', obj(a.k11).text],
				['Nu poate lipsi', obj(a.k12).text],
				['Mobilier păstrat', obj(a.k13).text]
			])
		});
	if (picked(a, 'living'))
		rooms.push({
			roomId: 'living',
			portrait: livingPortrait(a),
			means: livingMeans(a),
			quotes: cleanQuotes([
				['Problema principală', obj(a.l3).problem],
				['Nu poate lipsi', obj(a.l3).must],
				['Mobilier păstrat', obj(a.l4).text]
			])
		});
	if (picked(a, 'dormitor'))
		rooms.push({
			roomId: 'dormitor',
			portrait: bedroomPortrait(a),
			means: bedroomMeans(a),
			quotes: cleanQuotes([
				['Problema principală', obj(a.d3).problem],
				['Nu poate lipsi', obj(a.d3).must],
				['Mobilier păstrat', obj(a.d4).text]
			])
		});

	for (const r of ROOMS.filter((x) => x.chips && picked(a, x.id))) {
		const x1 = str(obj(a[`x1_${r.id}`]).text);
		const x2 = obj(a[`x2_${r.id}`]);
		const x3 = obj(a[`x3_${r.id}`]).text;
		rooms.push({
			roomId: r.id,
			portrait: [
				x1 && x1.trim()
					? `Ce se întâmplă ${r.in}: ${quoteText(x1)}.`
					: `Despre ${r.the} nu ai scris încă nimic — putem completa la discuție.`
			],
			means: [],
			quotes: cleanQuotes([
				['Problema principală', x2.problem],
				['Nu poate lipsi', x2.must],
				['Mobilier păstrat', x3]
			])
		});
	}

	return { household: householdPortrait(a), rooms };
}

/** The whole read-back as plain text, for the HubSpot `um_readback` field. */
export function readbackText(a: Answers): string {
	const { household, rooms } = buildReadback(a);
	const out: string[] = ['Ce am înțeles', ''];
	if (household.length) out.push(...household, '');
	for (const r of rooms) {
		const room = roomOf(r.roomId);
		out.push(room ? room.label : r.roomId);
		if (r.portrait.length) out.push(...r.portrait);
		for (const [label, text] of r.quotes) out.push(`${label}: „${quoteText(text)}”`);
		if (r.means.length) {
			out.push('Ce înseamnă asta pentru plan:');
			for (const m of r.means) out.push(`- ${m}`);
		}
		out.push('');
	}
	return out.join('\n').trim();
}
