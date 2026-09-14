import type { Screen } from '$lib/questions/screens';

/* One photograph per screen. The first ten came with the mockups; the rest were chosen to
   match them (natural light, muted palette, uncluttered). Ids are Unsplash photo ids. */

export const unsplash = (id: string, w: number): string =>
	`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=78`;

export const IMG = {
	kitchenDark: '1600684388091-627109f3cd60',
	kitchenMarble: '1665067687320-a21e174ed245',
	kitchenStools: '1774612673121-7da610a4e1aa',
	kitchenDrawer: '1772475385442-9e2c59cab288',
	kitchenWindow: '1653267408946-c4f8421392cd',
	kitchenWhite: '1610276173132-c47d148ab626',
	kitchenBW: '1714456054360-8b8a1300bd69',
	bedWood: '1757344454333-cc666252e596',
	bedsideBooks: '1771287490579-afd6e8d3c09a',
	nightLamp: '1522771739844-6a9f6d5f14af',
	/* chosen to match, for the screens the mockups do not show */
	livingWide: '1633505899118-4ca6bd143043',
	livingDetail: '1523755231516-e43fd2e8dca5',
	officeWide: '1777896193454-8b4863264f0b',
	officeDetail: '1611269154421-4e27233ac5c7',
	bathWide: '1644068298141-6333cb147520',
	bathDetail: '1616663717839-2fea42e1a1f6',
	hallWide: '1724765440530-e3954ac2e61d',
	hallDetail: '1763694333990-aa6860e6da63',
	otherRoom: '1655041448985-f6666cba2d6c',
	plans: '1762146828422-50a8bd416d3c',
	bedroomDetail: '1752407828514-660d6945d392',
	booking: '1770731206301-43a9683f3438',
	household: '1694830470387-2e0f234ecaf7'
} as const;

export type ArtMode = 'art' | 'dense' | 'noart' | 'opener';

export interface Art {
	img: string | null;
	/** a different photograph for phones */
	mobile?: string;
	mode: ArtMode;
}

const art = (img: string, mode: ArtMode = 'art', mobile?: string): Art => ({ img, mode, mobile });
const NOART: Art = { img: null, mode: 'noart' };

const BY_ID: Record<string, Art> = {
	c_identity: art(IMG.bedsideBooks),
	c_rooms: art(IMG.kitchenMarble),
	p_modify: art(IMG.kitchenBW),
	c_stage: art(IMG.kitchenDark),
	c_household: NOART,

	k_card: art(IMG.kitchenMarble, 'opener', IMG.kitchenDark),
	k1: art(IMG.kitchenWindow),
	k2: art(IMG.kitchenWindow),
	k3: art(IMG.kitchenWhite),
	k4: art(IMG.kitchenWhite),
	k3b: art(IMG.kitchenMarble),
	k5_frig: NOART,
	k5_gatit: NOART,
	k5_spalat: NOART,
	k6a: NOART,
	k5_plasare: NOART,
	k7: NOART,
	k8: art(IMG.kitchenDrawer),
	k9: art(IMG.kitchenDrawer),
	k10: art(IMG.kitchenStools),
	k11: art(IMG.kitchenStools),
	k12: art(IMG.kitchenWindow),
	k13: art(IMG.kitchenBW, 'dense'),

	l_card: art(IMG.livingWide, 'opener'),
	l1: art(IMG.livingWide),
	l2: art(IMG.livingDetail),
	l3: art(IMG.livingDetail),
	l4: art(IMG.livingWide, 'dense'),

	d_card: art(IMG.bedWood, 'opener'),
	d1: art(IMG.bedWood),
	d2: NOART,
	d3: art(IMG.bedroomDetail),
	d4: art(IMG.bedroomDetail, 'dense'),

	x1_baie: NOART
};

/** Each extra room: the photograph for its opener and first question, and a detail after. */
const ROOM_ART: Record<string, { wide: string; detail: string }> = {
	birou: { wide: IMG.officeWide, detail: IMG.officeDetail },
	baie: { wide: IMG.bathWide, detail: IMG.bathDetail },
	hol: { wide: IMG.hallWide, detail: IMG.hallDetail },
	alta: { wide: IMG.otherRoom, detail: IMG.otherRoom }
};

export function artFor(s: Screen): Art {
	if (BY_ID[s.id]) return BY_ID[s.id];
	if (s.kind === 'cards') return NOART;
	const room = ROOM_ART[s.chapter];
	if (room) {
		if (s.kind === 'card') return art(room.wide, 'opener');
		if (s.id.startsWith('x1_')) return art(room.wide);
		if (s.id.startsWith('x2_')) return art(room.detail);
		return art(room.detail, 'dense');
	}
	return NOART;
}

/** The small photograph beside each chapter in the contents. */
export const THUMB: Record<string, string> = {
	despre_tine: IMG.nightLamp,
	planuri: IMG.plans,
	locuinta: IMG.household,
	bucatarie: IMG.kitchenWhite,
	living: IMG.livingDetail,
	dormitor: IMG.bedWood,
	birou: IMG.officeDetail,
	baie: IMG.bathDetail,
	hol: IMG.hallDetail,
	alta: IMG.otherRoom,
	trimitere: IMG.bedsideBooks
};
