import type { RoomId } from '$lib/types';

export interface Room {
	id: RoomId;
	label: string;
	icon: string;
	the: string;
	in: string;
	/** the room, as it reads after "Întrebări despre …" */
	about: string;
	chips?: string[];
}

export interface SmallAppliance {
	value: string;
	label: string;
	icon: string;
}

/* Ported verbatim from ../index.html */
export const ROOMS: Room[] = [
  { id:"bucatarie", label:"Bucătărie", icon:"kitchen", the:"bucătăria", in:"în bucătărie", about:"bucătărie" },
  { id:"living",    label:"Living",    icon:"living",  the:"livingul",  in:"în living", about:"living" },
  { id:"dormitor",  label:"Dormitor",  icon:"bedroom", the:"dormitorul", in:"în dormitor", about:"dormitor" },
  { id:"copil", label:"Cameră de copil", icon:"kids", the:"camera copilului", in:"în camera copilului", about:"camera copilului",
    chips:["pat","pat suprapus, doi copii","birou","loc de joacă","dulap"] },
  { id:"birou", label:"Birou", icon:"office", the:"biroul", in:"în birou", about:"birou",
    chips:["un birou","două posturi de lucru","bibliotecă","canapea pentru musafiri","imprimantă"] },
  { id:"baie", label:"Baie", icon:"bath", the:"baia", in:"în baie", about:"baie",
    chips:["cadă","duș","mașină de spălat","dulap","două lavoare"] },
  { id:"hol", label:"Hol", icon:"hall", the:"holul", in:"în hol", about:"hol",
    chips:["cuier","pantofar","dulap","oglindă"] },
  { id:"alta", label:"Altă cameră", icon:"other", the:"camera", in:"în cameră", about:"cameră",
    chips:["dulap","birou","canapea","pat","depozitare"] }
];

export const roomOf = (id: string): Room | undefined => ROOMS.find((r) => r.id === id);

/* Ordered by how likely a Romanian kitchen is to have one. */
export const SMALL: SmallAppliance[] = [
  {value:"micro",label:"Cuptor cu microunde",icon:"microCounter"},
  {value:"prajitor",label:"Prăjitor de pâine",icon:"toaster"},
  {value:"fierbator",label:"Fierbător",icon:"kettle"},
  {value:"multicooker",label:"Multicooker",icon:"multicooker"},
  {value:"blender",label:"Blender",icon:"blender"},
  {value:"robot",label:"Robot de bucătărie",icon:"mixer"},
  {value:"mixer",label:"Mixer",icon:"handmixer"},
  {value:"airfryer",label:"Friteuză / air fryer",icon:"airfryer"},
  {value:"sandwich",label:"Sandwich-maker",icon:"sandwich"},
  {value:"storcator",label:"Storcător",icon:"juicer"},
  {value:"gratar",label:"Grătar electric",icon:"grill"},
  {value:"tocat",label:"Mașină de tocat",icon:"grinder"},
  {value:"cuptor_el",label:"Cuptor electric",icon:"minioven"},
  {value:"paine",label:"Mașină de pâine",icon:"breadmaker"},
  {value:"feliator",label:"Feliator",icon:"slicer"},
  {value:"vidat",label:"Aparat de vidat",icon:"vacuum"},
  {value:"deshidrator",label:"Deshidrator",icon:"dehydrator"}
];
