/* Clay icon set for the Urban Moon configurator mockups.
   Five materials + one grey for negative answers. Terracotta is the ONLY accent:
   used for warmth (fire, food, drink, textiles, a rug) — never for buttons or knobs. */

export const MATERIALS = {
  cream:    ['#FFFBF3', '#E6D5B9'],
  sand:     ['#F0DFC0', '#C6AA78'],
  sandDark: ['#DCC39A', '#A78650'],
  brass:    ['#E8D19C', '#A88B4D'],
  terra:    ['#F6A985', '#CC6440'],
  charcoal: ['#6A5D50', '#2C231B'],
  white:    ['#FFFFFF', '#ECE5D8'],
  glass:    ['#F7F3EC', '#D5CBBA'],
  muted:    ['#EEE9E0', '#C5BDB0'],
};
// solid helpers
const DK = '#2C231B', SD = '#C9B287', TD = '#B4522F', LT = '#FFFFFF';

const G = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"></stop><stop offset="1" stop-color="${b}"></stop></linearGradient>`;

const rr = (x, y, w, h, r, f, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}"${extra}></rect>`;
const el = (cx, cy, rx, ry, f, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"${extra}></ellipse>`;
const ci = (cx, cy, r, f, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"${extra}></circle>`;
const pa = (d, f, extra = '') => `<path d="${d}" fill="${f}"${extra}></path>`;
const ln = (d, c, w = 2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"></path>`;
const ring = (cx, cy, r, c, w) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"></circle>`;
const hl = (cx, cy, rx, ry, rot = -35, o = .6) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#FFFFFF" opacity="${o}"></ellipse>`;
const g = (t, inner) => `<g transform="${t}">${inner}</g>`;
const txt = (x, y, s, size, c, w = 800) => `<text x="${x}" y="${y}" font-family="'Plus Jakarta Sans', Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${w}" fill="${c}" text-anchor="middle">${s}</text>`;

let seq = 0;
function icon(name, build, shadow = 'cx="32" cy="56" rx="19" ry="3.4"', extraDefs = '') {
  const P = `${name}${(seq++).toString(36)}`;
  const m = (k) => `url(#${P}-${k})`;
  const body = build(m);
  const used = Object.keys(MATERIALS).filter((k) => body.includes(`url(#${P}-${k})`));
  const defs = used.map((k) => G(`${P}-${k}`, ...MATERIALS[k])).join('') + extraDefs.replaceAll('%P%', P);
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible"><defs>${defs}<filter id="${P}-blur" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="1.7"></feGaussianBlur></filter></defs><ellipse ${shadow} fill="#1C1A17" opacity=".13" filter="url(#${P}-blur)"></ellipse>${body.replaceAll('%P%', P)}</svg>`;
}

/* ---------- shared sub-drawings ---------- */
const sofaBody = (m, cushion = true) => rr(12, 20, 40, 16, 6, m('sandDark')) + rr(8, 32, 48, 14, 5, m('sand')) + rr(5, 27, 9, 19, 4, m('sandDark')) + rr(50, 27, 9, 19, 4, m('sandDark')) + rr(12, 46, 4, 6, 1.5, m('brass')) + rr(48, 46, 4, 6, 1.5, m('brass')) + (cushion ? rr(17, 24, 13, 10, 3, m('terra')) : '') + hl(20, 22, 4, 1.4, -20, .45);
const bedBody = (m) => rr(8, 6, 48, 32, 8, m('sandDark')) + hl(19, 13, 7, 2.6, -25, .45) + rr(8, 28, 48, 22, 4, m('cream')) + rr(13, 21, 17, 10, 4, m('white')) + rr(34, 21, 17, 10, 4, m('white')) + pa('M8 35 H56 V46 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z', m('terra')) + rr(8, 35, 48, 5, 0, '#F9BFA1') + rr(12, 50, 4, 8, 1.5, m('brass')) + rr(48, 50, 4, 8, 1.5, m('brass'));
const potOnCounter = (m) => rr(10, 34, 44, 22, 3, m('sand')) + rr(31, 38, 2, 16, 1, SD) + rr(8, 31, 48, 5, 2, m('cream')) + rr(20, 17, 24, 15, 3, m('charcoal')) + rr(14, 22, 6, 3, 1.5, m('brass')) + rr(44, 22, 6, 3, 1.5, m('brass')) + el(32, 17, 13, 3, m('brass')) + ci(32, 14, 2.3, m('terra')) + hl(25, 22, 2.2, 5, 0, .35);
const ovenBody = (m) => rr(8, 12, 48, 44, 4, m('cream')) + rr(12, 24, 40, 28, 3, m('charcoal')) + rr(16, 28, 32, 18, 2, '#1F1811') + ci(18, 18, 2.5, m('brass')) + ci(26, 18, 2.5, m('brass')) + ci(46, 18, 2.5, m('brass')) + rr(16, 29, 32, 2, 1, LT, ' opacity=".18"');
const cupSlash = (m) => rr(18, 24, 24, 24, 5, m('muted')) + el(30, 24, 12, 4, '#DDD6CA') + ring(45, 34, 5.5, '#C5BDB0', 4) + rr(30, 8, 4, 48, 2, '#A39A8D', ' transform="rotate(45 32 32)"');
const washerBody = (m) => rr(8, 8, 48, 48, 4, m('cream')) + ci(32, 36, 13, m('charcoal')) + ci(32, 36, 9, m('glass')) + hl(29, 32, 3, 1.5, -30, .7) + ci(46, 16, 3, m('brass')) + rr(12, 13, 14, 5, 1.5, m('sand'));
const column = (m, winY) => rr(18, 6, 28, 52, 4, m('sand')) + rr(22, winY, 20, 13, 2, m('charcoal')) + rr(25, winY + 3, 14, 7, 1, '#1F1811') + rr(22, winY - 5, 20, 3, 1.5, m('brass')) + hl(23, 10, 3, 1.2, -20, .5);
const person = (m, cx, headR, bodyMat, scale = 1) => ci(cx, 18 * scale + (1 - scale) * 12, headR, m('cream')) + rr(cx - 16 * scale, 32, 32 * scale, 24, 12 * scale, m(bodyMat)) + hl(cx - 3, 14, 3, 1.5, -30, .6);
const flame = (m, x = 0, y = 0, s = 1) => g(`translate(${x} ${y}) scale(${s})`, pa('M32 6 c9 11 14 17 14 27 a14 14 0 0 1 -28 0 c0 -7 4 -11 7 -16 c1 4 3 6 6 6 c0 -6 -2 -11 1 -17 z', m('terra')) + pa('M32 26 c4 5 6 8 6 12 a6 6 0 0 1 -12 0 c0 -4 3 -6 6 -12 z', '#FBD8C4'));
const bolt = (m, x = 0, y = 0, s = 1) => g(`translate(${x} ${y}) scale(${s})`, pa('M36 6 L18 36 h12 l-4 22 L46 26 H34 z', m('brass')));
const hobTop = (m) => rr(8, 14, 48, 36, 5, m('charcoal')) + hl(14, 18, 4, 1.4, -20, .25);
const bin = (m, x, w, lid) => rr(x, 26, w, 28, 4, m('charcoal')) + rr(x - 2, 20, w + 4, 7, 3, m(lid)) + rr(x + w / 2 - 4, 17, 8, 4, 2, m(lid)) + hl(x + 5, 32, 1.6, 6, 0, .25);
const doorBody = (m) => rr(15, 5, 34, 51, 4, SD) + rr(18, 8, 28, 48, 3, m('sand')) + rr(22, 13, 20, 17, 2, '#E3CFAB') + rr(22, 34, 20, 16, 2, '#E3CFAB') + ci(41, 33, 2.6, m('brass')) + hl(24, 11, 3.5, 1.4, -20, .55);
const paper = (m) => pa('M16 6 H40 L48 14 V58 H16 Z', m('white')) + pa('M40 6 V14 H48 Z', '#D9D0C0') + hl(22, 12, 3, 1.2, -20, .8);
const wineGlass = (m, P) => rr(30.5, 36, 3, 18, 1.5, '#D6CEBF') + el(32, 54, 11, 3, m('glass')) + pa('M18 8 H46 C46 24 40 37 32 37 C24 37 18 24 18 8 Z', m('glass'), ' opacity=".95"') + rr(14, 20, 36, 18, 0, m('terra'), ` clip-path="url(#${P}-clip)"`) + el(32, 20.5, 12.4, 2.4, '#F3B89C', ` clip-path="url(#${P}-clip)"`) + rr(22, 11, 3, 12, 1.5, LT, ' opacity=".7"');
const glassClip = `<clipPath id="%P%-clip"><path d="M18 8 H46 C46 24 40 37 32 37 C24 37 18 24 18 8 Z"></path></clipPath>`;

/* ---------- the set ---------- */
export const ICONS = {
  /* rooms */
  kitchen: icon('kitchen', (m) => potOnCounter(m)),
  living: icon('living', (m) => rr(6, 52, 52, 4, 2, m('terra')) + sofaBody(m, false) + rr(54, 10, 3, 18, 1.5, m('brass')) + pa('M48 12 h15 l-3 -8 h-9 z', m('cream'))),
  bedroom: icon('bedroom', (m) => bedBody(m), 'cx="32" cy="59" rx="27" ry="3.4"'),
  kids: icon('kids', (m) => rr(10, 34, 18, 18, 3, m('sand')) + rr(24, 16, 18, 18, 3, m('cream')) + txt(19, 48, 'A', 11, SD) + txt(33, 30, 'B', 11, SD) + ci(48, 44, 9, m('terra')) + hl(45, 40, 3, 1.6, -35, .6)),
  office: icon('office', (m) => rr(8, 32, 48, 5, 2, m('sandDark')) + rr(11, 37, 4, 18, 1.5, m('brass')) + rr(49, 37, 4, 18, 1.5, m('brass')) + rr(18, 10, 26, 18, 3, m('charcoal')) + rr(20, 12, 22, 14, 2, m('glass')) + rr(29, 28, 4, 4, 1, m('charcoal')) + rr(46, 24, 7, 8, 2, m('terra')) + hl(23, 14, 2.5, 1.2, -20, .8)),
  bath: icon('bath', (m) => rr(8, 28, 48, 20, 8, m('cream')) + el(32, 28, 24, 4, m('white')) + rr(12, 47, 4, 8, 1.5, m('brass')) + rr(48, 47, 4, 8, 1.5, m('brass')) + rr(14, 12, 3, 15, 1.5, m('brass')) + rr(14, 12, 10, 3, 1.5, m('brass')) + hl(20, 33, 4, 1.6, -15, .5)),
  hall: icon('hall', (m) => doorBody(m) + rr(6, 12, 3, 44, 1.5, m('brass')) + ci(6, 22, 2.5, m('brass')) + ci(6, 32, 2.5, m('brass')) + rr(2, 24, 10, 12, 4, m('terra'))),
  other: icon('other', (m) => rr(14, 6, 36, 50, 4, m('charcoal')) + rr(18, 10, 28, 46, 2, '#1F1811') + pa('M34 8 L52 12 V58 L34 54 Z', m('sand')) + ci(38, 34, 2, m('brass')) + rr(12, 54, 40, 4, 2, m('sandDark'))),

  /* about the home and the people */
  houseNew: icon('houseNew', (m) => pa('M8 32 L32 10 L56 32 Z', m('sandDark')) + rr(16, 30, 32, 26, 3, m('cream')) + rr(28, 40, 8, 16, 2, m('terra')) + rr(20, 36, 6, 6, 1.5, m('glass')) + pa('M50 6 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z', m('brass')) + hl(22, 32, 3, 1.2, -20, .6)),
  crane: icon('crane', (m) => rr(8, 54, 48, 4, 2, m('sandDark')) + rr(14, 14, 5, 40, 1, m('brass')) + rr(8, 10, 50, 4, 1, m('brass')) + ln('M19 24 L34 14', m('brass'), 2.5) + rr(10, 14, 10, 8, 2, m('charcoal')) + rr(49, 14, 1.5, 12, .5, DK) + pa('M46 26 h8 v3 h-8 z', m('charcoal')) + rr(41, 29, 18, 14, 2, m('cream')) + rr(45, 33, 4, 4, 1, m('glass')) + rr(52, 33, 4, 4, 1, m('glass')) + rr(28, 40, 14, 14, 2, m('cream')) + rr(32, 44, 4, 4, 1, m('glass'))),
  hammer: icon('hammer', (m) => rr(29, 22, 6, 34, 3, m('sandDark')) + rr(18, 10, 28, 13, 4, m('charcoal')) + rr(38, 12, 6, 9, 2, '#463A2E') + hl(23, 13, 3.5, 1.3, -15, .35)),
  sofa: icon('sofa', (m) => sofaBody(m)),
  person: icon('person', (m) => person(m, 32, 9, 'sandDark')),
  child: icon('child', (m) => ci(32, 24, 7, m('cream')) + rr(20, 36, 24, 20, 10, m('terra')) + hl(29, 21, 2.5, 1.2, -30, .6)),
  two: icon('two', (m) => ci(21, 18, 8, m('cream')) + rr(6, 30, 30, 26, 12, m('sandDark')) + ci(43, 18, 8, m('cream')) + rr(28, 30, 30, 26, 12, m('charcoal')) + hl(18, 15, 2.6, 1.3, -30, .6) + hl(40, 15, 2.6, 1.3, -30, .6)),
  dog: icon('dog', (m) => el(16, 28, 6, 11, m('sandDark'), ' transform="rotate(18 16 28)"') + el(48, 28, 6, 11, m('sandDark'), ' transform="rotate(-18 48 28)"') + ci(32, 33, 14, m('sand')) + ci(27, 30, 1.8, DK) + ci(37, 30, 1.8, DK) + el(32, 38, 3.5, 2.6, DK) + rr(20, 46, 24, 4, 2, m('terra')) + hl(24, 24, 3.5, 1.6, -30, .55)),
  cat: icon('cat', (m) => pa('M20 28 L18 12 L30 20 Z', m('cream')) + pa('M44 28 L46 12 L34 20 Z', m('cream')) + ci(32, 34, 13, m('cream')) + ci(27, 32, 1.8, DK) + ci(37, 32, 1.8, DK) + pa('M30 37 h4 l-2 2.5 z', m('terra')) + ln('M22 38 h-6 M42 38 h6', SD, 1.6) + hl(25, 26, 3.5, 1.6, -30, .6)),
  paw: icon('paw', (m) => el(32, 42, 10, 8, m('charcoal')) + ci(18, 30, 4.5, m('charcoal')) + ci(26, 20, 4.5, m('charcoal')) + ci(38, 20, 4.5, m('charcoal')) + ci(46, 30, 4.5, m('charcoal')) + hl(27, 38, 3, 1.4, -20, .3)),
  none: icon('none', (m) => ring(32, 33, 17, m('muted'), 8) + rr(29.5, 12, 5, 42, 2.5, '#B9B0A2', ' transform="rotate(45 32 33)"') + hl(21, 22, 5, 2.4, -40, .6)),

  /* cooking habits */
  pans: icon('pans', (m) => rr(6, 30, 26, 20, 3, m('charcoal')) + el(19, 30, 14, 3, m('brass')) + ci(19, 27, 2, m('brass')) + rr(36, 36, 22, 14, 3, m('charcoal')) + rr(56, 39, 8, 4, 2, m('brass')) + el(47, 36, 11, 2.5, '#463A2E') + hl(11, 36, 1.6, 5, 0, .3)),
  reheat: icon('reheat', (m) => rr(8, 16, 48, 32, 4, m('cream')) + rr(12, 20, 28, 24, 2, m('charcoal')) + el(26, 36, 9, 3, m('white')) + ci(47, 26, 2.5, m('brass')) + ci(47, 36, 2.5, m('brass')) + hl(16, 22, 3, 1.2, -20, .3)),
  delivery: icon('delivery', (m) => ln('M24 24 v-4 a8 8 0 0 1 16 0 v4', m('brass'), 3.5) + pa('M16 22 H48 L45 56 H19 Z', m('sand')) + rr(26, 36, 12, 6, 2, m('terra')) + hl(22, 28, 3, 1.4, -20, .5)),
  pan: icon('pan', (m) => ci(26, 34, 17, m('charcoal')) + ci(26, 34, 12, '#3A2F25') + rr(40, 31, 20, 5, 2.5, m('brass')) + el(25, 33, 6, 5, m('white')) + ci(25, 33, 3, m('terra')) + hl(16, 26, 3, 1.4, -35, .3)),
  bread: icon('bread', (m) => rr(10, 30, 44, 22, 9, m('sand')) + ci(20, 30, 8, m('sand')) + ci(32, 28, 9, m('sand')) + ci(44, 30, 8, m('sand')) + ln('M20 26 l3 6 M31 24 l3 6 M42 26 l3 6', '#B8996A', 1.8) + hl(18, 24, 3, 1.4, -30, .55)),
  oven: icon('oven', (m) => ovenBody(m)),
  knife: icon('knife', (m) => rr(8, 42, 48, 10, 3, m('sand')) + pa('M8 30 H40 C46 30 50 26 50 18 H18 C12 18 8 24 8 30 Z', m('glass')) + rr(40, 22, 18, 8, 3, m('charcoal')) + ci(46, 26, 1.3, m('brass')) + ci(52, 26, 1.3, m('brass')) + hl(20, 22, 4, 1.4, -10, .7)),
  chat: icon('chat', (m) => pa('M8 12 H38 a4 4 0 0 1 4 4 V28 a4 4 0 0 1 -4 4 H22 l-7 6 v-6 H8 a4 4 0 0 1 -4 -4 V16 a4 4 0 0 1 4 -4 z', m('cream')) + pa('M28 30 H56 a4 4 0 0 1 4 4 V46 a4 4 0 0 1 -4 4 H52 v6 l-7 -6 H28 a4 4 0 0 1 -4 -4 V34 a4 4 0 0 1 4 -4 z', m('terra')) + hl(12, 16, 3, 1.2, -20, .6)),
  cheers: icon('cheers', (m) => g('rotate(-14 22 40)', rr(20.5, 34, 3, 16, 1.5, '#D6CEBF') + el(22, 50, 8, 2.4, m('glass')) + pa('M12 10 H32 C32 24 28 34 22 34 C16 34 12 24 12 10 Z', m('glass')) + pa('M14 20 H30 C29 28 26 34 22 34 C18 34 15 28 14 20 Z', m('terra'))) + g('rotate(14 42 40)', rr(40.5, 34, 3, 16, 1.5, '#D6CEBF') + el(42, 50, 8, 2.4, m('glass')) + pa('M32 10 H52 C52 24 48 34 42 34 C36 34 32 24 32 10 Z', m('glass')) + pa('M34 20 H50 C49 28 46 34 42 34 C38 34 35 28 34 20 Z', m('terra'))) + pa('M32 4 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1 z', m('brass'))),
  homework: icon('homework', (m) => rr(12, 8, 34, 46, 3, m('white')) + ln('M18 20 h22 M18 28 h22 M18 36 h14', '#D9D0C0', 2) + g('rotate(-40 44 38)', rr(40, 18, 8, 34, 2, m('sand')) + rr(40, 18, 8, 5, 2, m('terra')) + pa('M40 52 h8 l-4 7 z', m('charcoal'))) + hl(18, 12, 3, 1.2, -20, .8)),
  laptop: icon('laptop', (m) => rr(14, 12, 36, 30, 3, m('charcoal')) + rr(17, 15, 30, 22, 2, m('glass')) + rr(8, 42, 48, 6, 2, m('charcoal')) + rr(26, 43, 12, 2, 1, '#463A2E') + hl(22, 18, 3, 1.3, -20, .8)),
  table: icon('table', (m) => rr(6, 28, 52, 6, 3, m('sandDark')) + rr(10, 34, 4, 20, 1.5, m('brass')) + rr(50, 34, 4, 20, 1.5, m('brass')) + el(32, 26, 9, 3, m('white')) + el(32, 25, 5, 1.8, m('terra')) + rr(16, 20, 6, 7, 1.5, m('cream')) + rr(42, 20, 6, 7, 1.5, m('cream'))),

  /* big appliances */
  fridge: icon('fridge', (m) => rr(14, 6, 36, 52, 4, m('cream')) + rr(14, 25, 36, 2, 0, SD) + rr(43, 12, 3, 9, 1.5, m('brass')) + rr(43, 31, 3, 16, 1.5, m('brass')) + hl(20, 12, 3, 1.4, -20, .6)),
  fridge2: icon('fridge2', (m) => rr(10, 6, 44, 52, 4, m('cream')) + rr(31, 6, 2, 52, 0, SD) + rr(26, 22, 3, 16, 1.5, m('brass')) + rr(35, 22, 3, 16, 1.5, m('brass')) + hl(16, 12, 3, 1.4, -20, .6)),
  fridgeIn: icon('fridgeIn', (m) => rr(10, 6, 44, 52, 4, m('sand')) + rr(14, 10, 36, 44, 3, m('sandDark')) + rr(14, 30, 36, 1.5, 0, SD) + rr(43, 16, 3, 10, 1.5, m('brass')) + rr(43, 34, 3, 14, 1.5, m('brass')) + hl(20, 14, 3, 1.4, -20, .5)),
  chest: icon('chest', (m) => rr(8, 24, 48, 30, 4, m('cream')) + rr(8, 18, 48, 8, 3, m('white')) + rr(27, 15, 10, 3, 1.5, m('brass')) + rr(12, 54, 4, 4, 1, m('brass')) + rr(48, 54, 4, 4, 1, m('brass')) + hl(14, 20, 3, 1.2, -10, .8)),
  wine: icon('wine', (m) => rr(14, 6, 36, 52, 4, m('charcoal')) + rr(18, 10, 28, 44, 3, '#3A2F25') + rr(43, 24, 2.5, 16, 1.2, m('brass')) + [22, 28, 34].map((x) => rr(x, 26, 4.5, 18, 2, m('terra')) + rr(x + 1, 22, 2.5, 5, 1, m('terra'))).join('') + hl(21, 12, 3, 1.2, -20, .3)),
  aragaz: icon('aragaz', (m) => rr(8, 22, 48, 34, 4, m('cream')) + rr(8, 14, 48, 9, 3, m('charcoal')) + ci(20, 18, 4, m('brass')) + ci(44, 18, 4, m('brass')) + [16, 24, 40, 48].map((x) => ci(x, 27, 1.8, m('brass'))).join('') + rr(14, 34, 36, 18, 2, m('charcoal')) + rr(18, 38, 28, 10, 1, '#1F1811') + hl(14, 16, 3, 1.2, -20, .25)),
  flame: icon('flame', (m) => flame(m)),
  bolt: icon('bolt', (m) => bolt(m)),
  mixed: icon('mixed', (m) => flame(m, -12, 6, .85) + bolt(m, 12, 6, .85)),
  pipe: icon('pipe', (m) => rr(6, 30, 52, 8, 4, m('brass')) + ci(32, 34, 9, m('charcoal')) + rr(30, 12, 4, 14, 2, m('brass')) + rr(24, 10, 16, 5, 2.5, m('terra')) + hl(12, 32, 3, 1.2, -10, .5)),
  bottle: icon('bottle', (m) => rr(20, 16, 24, 40, 6, m('charcoal')) + rr(28, 8, 8, 9, 2, m('brass')) + rr(24, 8, 16, 3, 1.5, m('brass')) + rr(20, 34, 24, 4, 0, '#463A2E') + hl(25, 22, 1.8, 6, 0, .3)),
  hobOven: icon('hobOven', (m) => rr(8, 6, 48, 10, 3, m('charcoal')) + ring(20, 11, 3.5, m('brass'), 2) + ring(44, 11, 3.5, m('brass'), 2) + rr(12, 24, 40, 32, 3, m('cream')) + rr(16, 32, 32, 20, 2, m('charcoal')) + rr(20, 36, 24, 12, 1, '#1F1811') + ci(20, 28, 1.8, m('brass')) + ci(44, 28, 1.8, m('brass'))),
  hobGas: icon('hobGas', (m) => hobTop(m) + [[20, 25], [44, 25], [20, 40], [44, 40]].map(([x, y]) => ring(x, y, 5.5, m('brass'), 2.5) + ci(x, y, 2, m('terra'))).join('')),
  hob: icon('hob', (m) => hobTop(m) + [[20, 25], [44, 25], [20, 40], [44, 40]].map(([x, y]) => ring(x, y, 6, '#EADFCB', 1.8) + ring(x, y, 2.5, '#EADFCB', 1.2)).join('')),
  hobInd: icon('hobInd', (m) => hobTop(m) + [[20, 25], [44, 25], [20, 40], [44, 40]].map(([x, y]) => ring(x, y, 6, '#EADFCB', 1.8) + ln(`M${x - 3} ${y} h6 M${x} ${y - 3} v6`, '#EADFCB', 1.4)).join('')),
  dishwasher: icon('dishwasher', (m) => rr(8, 10, 48, 46, 4, m('cream')) + rr(8, 10, 48, 8, 3, m('charcoal')) + ci(46, 14, 2, m('brass')) + rr(12, 22, 40, 30, 2, m('white')) + rr(20, 25, 24, 3, 1.5, m('brass')) + hl(16, 28, 3, 1.2, -20, .8)),
  washerKitchen: icon('washerKitchen', (m) => washerBody(m)),
  washer: icon('washer', (m) => washerBody(m)),
  anywhere: icon('anywhere', (m) => pa('M32 6 a13 13 0 0 1 13 13 c0 11 -13 27 -13 27 s-13 -16 -13 -27 a13 13 0 0 1 13 -13 z', m('terra')) + ci(32, 19, 5.5, m('cream')) + hl(26, 12, 3, 1.4, -35, .5), 'cx="32" cy="50" rx="10" ry="2.6"'),
  ovenFloor: icon('ovenFloor', (m) => rr(8, 28, 48, 28, 3, m('sand')) + rr(8, 25, 48, 4, 2, m('cream')) + rr(12, 20, 24, 5, 2, m('charcoal')) + ring(18, 22.5, 2.5, m('brass'), 1.5) + ring(30, 22.5, 2.5, m('brass'), 1.5) + rr(12, 32, 24, 20, 2, m('charcoal')) + rr(15, 36, 18, 12, 1, '#1F1811') + rr(43, 38, 2, 8, 1, SD)),
  ovenColumn: icon('ovenColumn', (m) => column(m, 24)),
  microCounter: icon('microCounter', (m) => rr(8, 44, 48, 6, 2, m('sandDark')) + rr(12, 20, 40, 24, 3, m('cream')) + rr(16, 24, 22, 16, 2, m('charcoal')) + el(27, 34, 6, 2, m('white')) + ci(45, 28, 2.5, m('brass')) + ci(45, 36, 2.5, m('brass')) + hl(19, 26, 2.6, 1, -20, .3)),
  counterTop: icon('counterTop', (m) => rr(10, 42, 44, 14, 3, m('sand')) + rr(8, 38, 48, 5, 2, m('cream')) + rr(20, 22, 24, 16, 3, m('charcoal')) + rr(23, 25, 14, 10, 1, m('glass')) + ci(41, 27, 1.8, m('brass')) + ci(41, 33, 1.8, m('brass'))),
  microColumn: icon('microColumn', (m) => column(m, 14)),
  underCounter: icon('underCounter', (m) => rr(8, 20, 48, 5, 2, m('cream')) + rr(10, 25, 44, 31, 3, m('sand')) + rr(30, 29, 20, 23, 2, m('charcoal')) + rr(33, 34, 14, 12, 1, '#1F1811') + ci(46, 31.5, 1.3, m('brass')) + rr(18, 36, 2, 8, 1, SD)),

  /* small appliances */
  toaster: icon('toaster', (m) => rr(20, 12, 9, 13, 2, m('sand')) + rr(35, 12, 9, 13, 2, m('sand')) + rr(10, 24, 44, 28, 6, m('cream')) + rr(17, 22, 12, 5, 2, m('charcoal')) + rr(35, 22, 12, 5, 2, m('charcoal')) + rr(54, 30, 4, 10, 2, m('brass')) + hl(16, 30, 3, 1.3, -20, .6)),
  kettle: icon('kettle', (m) => rr(18, 24, 28, 28, 6, m('cream')) + el(32, 24, 12, 4, m('sandDark')) + ci(32, 20, 2.5, m('brass')) + ln('M46 30 c9 0 9 14 0 14', m('brass'), 3.5) + ln('M19 32 l-7 -7', m('brass'), 3.5) + hl(23, 32, 2, 5, 0, .4)),
  multicooker: icon('multicooker', (m) => rr(12, 24, 40, 30, 6, m('charcoal')) + rr(12, 16, 40, 10, 5, m('cream')) + rr(28, 12, 8, 4, 2, m('brass')) + rr(24, 38, 16, 6, 2, m('glass')) + hl(18, 19, 3, 1.2, -20, .6)),
  blender: icon('blender', (m) => rr(20, 8, 24, 30, 3, m('glass')) + rr(23, 22, 18, 14, 2, m('terra')) + rr(22, 6, 20, 4, 2, m('charcoal')) + rr(16, 38, 32, 16, 4, m('charcoal')) + ci(24, 46, 2.5, m('brass')) + hl(24, 14, 1.8, 6, 0, .7)),
  mixer: icon('mixer', (m) => rr(14, 44, 36, 10, 4, m('charcoal')) + rr(14, 14, 10, 34, 4, m('charcoal')) + rr(14, 8, 36, 14, 6, m('charcoal')) + rr(31, 22, 3, 8, 1.5, m('brass')) + rr(22, 30, 24, 14, 7, m('cream')) + ci(44, 15, 2.5, m('brass')) + hl(20, 11, 3, 1.2, -20, .3)),
  handmixer: icon('handmixer', (m) => rr(12, 16, 34, 14, 6, m('cream')) + rr(38, 8, 14, 22, 5, m('cream')) + rr(42, 12, 6, 3, 1.5, m('brass')) + rr(20, 30, 3, 18, 1.5, m('brass')) + rr(30, 30, 3, 18, 1.5, m('brass')) + el(21.5, 50, 4, 5, m('brass')) + el(31.5, 50, 4, 5, m('brass')) + hl(17, 19, 3, 1.2, -20, .6)),
  airfryer: icon('airfryer', (m) => rr(14, 6, 36, 50, 8, m('charcoal')) + rr(14, 32, 36, 20, 4, '#3A2F25') + rr(26, 41, 12, 4, 2, m('brass')) + rr(20, 12, 24, 12, 3, m('glass')) + hl(24, 15, 3, 1.2, -20, .8)),
  sandwich: icon('sandwich', (m) => rr(10, 36, 44, 14, 5, m('charcoal')) + rr(12, 20, 40, 14, 5, m('charcoal')) + rr(52, 24, 6, 5, 2, m('brass')) + rr(14, 33, 36, 4, 1, m('sand')) + hl(18, 23, 3, 1.2, -20, .3)),
  juicer: icon('juicer', (m) => rr(14, 26, 26, 28, 4, m('glass')) + rr(17, 36, 20, 15, 2, m('terra')) + pa('M18 20 H50 L44 30 H24 Z', m('cream')) + pa('M28 10 L40 10 L34 22 Z', m('sandDark')) + ln('M40 34 c8 0 8 12 0 12', m('glass'), 3) + hl(19, 30, 1.8, 4, 0, .7)),
  grill: icon('grill', (m) => rr(8, 22, 48, 22, 5, m('charcoal')) + [13, 21, 29, 37, 45].map((x) => rr(x, 26, 6, 14, 2, '#3F3328')).join('') + rr(8, 44, 48, 6, 2, m('cream')) + ci(48, 47, 2, m('brass')) + rr(12, 50, 4, 6, 1.5, m('brass')) + rr(48, 50, 4, 6, 1.5, m('brass')) + hl(14, 25, 3, 1.2, -20, .25)),
  grinder: icon('grinder', (m) => rr(16, 26, 28, 20, 6, m('charcoal')) + rr(22, 10, 16, 16, 3, m('cream')) + rr(42, 32, 14, 8, 3, m('brass')) + ln('M16 36 h-6 v-10', m('brass'), 3) + ci(10, 24, 2.5, m('brass')) + hl(26, 13, 3, 1.2, -20, .6)),
  minioven: icon('minioven', (m) => rr(8, 50, 48, 5, 2, m('sandDark')) + rr(10, 20, 44, 30, 4, m('cream')) + rr(14, 26, 26, 18, 2, m('charcoal')) + rr(17, 30, 20, 10, 1, '#1F1811') + ci(46, 30, 2.5, m('brass')) + ci(46, 40, 2.5, m('brass')) + hl(16, 23, 3, 1.2, -20, .6)),
  breadmaker: icon('breadmaker', (m) => rr(14, 18, 36, 36, 6, m('cream')) + rr(14, 12, 36, 10, 4, m('charcoal')) + rr(24, 14, 16, 6, 2, m('glass')) + rr(20, 44, 24, 4, 2, m('charcoal')) + hl(19, 26, 3, 1.2, -20, .6)),
  slicer: icon('slicer', (m) => rr(8, 44, 48, 8, 3, m('charcoal')) + rr(10, 30, 20, 12, 3, m('cream')) + ci(38, 30, 14, m('glass')) + ci(38, 30, 5, m('charcoal')) + hl(31, 22, 4, 1.6, -35, .8)),
  vacuum: icon('vacuum', (m) => rr(8, 22, 48, 20, 6, m('cream')) + rr(8, 30, 48, 2, 0, SD) + rr(18, 44, 30, 10, 2, m('glass')) + rr(20, 46, 26, 6, 1, m('sand'), ' opacity=".7"') + ci(44, 26, 2, m('brass')) + ci(50, 26, 2, m('brass')) + hl(14, 26, 3, 1.2, -20, .6)),
  dehydrator: icon('dehydrator', (m) => rr(14, 42, 36, 10, 3, m('cream')) + rr(14, 32, 36, 10, 3, m('white')) + rr(14, 22, 36, 10, 3, m('cream')) + rr(14, 12, 36, 10, 4, m('charcoal')) + ci(44, 17, 2, m('brass')) + hl(19, 15, 3, 1.2, -20, .3)),

  /* coffee */
  espresso: icon('espresso', (m) => rr(12, 8, 40, 42, 6, m('charcoal')) + rr(12, 50, 40, 6, 3, m('brass')) + rr(26, 26, 12, 6, 2, m('brass')) + rr(36, 28, 14, 4, 2, m('charcoal')) + rr(25, 36, 14, 12, 4, m('cream')) + ln('M39 40 c5 0 5 6 0 6', m('cream'), 2.5) + rr(18, 14, 28, 6, 2, '#3A2F25') + hl(18, 11, 3, 1.2, -20, .3)),
  capsule: icon('capsule', (m) => rr(18, 10, 28, 38, 8, m('cream')) + rr(30, 4, 4, 10, 2, m('brass')) + rr(26, 30, 12, 6, 2, m('charcoal')) + rr(22, 38, 20, 12, 4, m('charcoal')) + rr(12, 50, 40, 6, 3, m('brass')) + el(48, 20, 5, 3.5, m('terra')) + hl(23, 14, 3, 1.2, -20, .6)),
  ibric: icon('ibric', (m) => pa('M18 50 L22 28 H42 L46 50 Z', m('brass')) + el(32, 28, 10, 3, m('charcoal')) + g('rotate(-30 46 32)', rr(44, 30, 18, 4, 2, m('charcoal'))) + hl(25, 38, 1.8, 6, 6, .35)),
  filter: icon('filter', (m) => rr(14, 8, 36, 48, 6, m('cream')) + rr(20, 12, 24, 12, 3, m('charcoal')) + rr(22, 30, 24, 22, 4, m('glass')) + rr(24, 40, 20, 10, 2, m('charcoal')) + rr(18, 30, 4, 22, 2, m('brass')) + hl(20, 12, 3, 1.2, -20, .6)),
  moka: icon('moka', (m) => pa('M18 56 L15 34 H49 L46 56 Z', m('brass')) + pa('M18 32 L22 12 H42 L46 32 Z', m('cream')) + rr(46, 18, 8, 5, 2, m('charcoal')) + ci(32, 10, 3, m('charcoal')) + hl(24, 18, 2, 5, 8, .5)),
  nocoffee: icon('nocoffee', (m) => cupSlash(m)),

  /* storage, bins, eating in the kitchen */
  balconyClosed: icon('balconyClosed', (m) => rr(14, 7, 36, 47, 4, m('sand')) + rr(18, 11, 28, 22, 2, m('glass')) + rr(31, 11, 2, 22, 0, SD) + pa('M20 13 H27 L20 22 Z', LT, ' opacity=".55"') + rr(18, 36, 28, 14, 2, m('cream')) + [22, 28, 34, 40].map((x) => rr(x, 37, 2, 12, 0, m('brass'))).join('') + rr(18, 35, 28, 2.5, 1, m('brass'))),
  pantry: icon('pantry', (m) => rr(12, 7, 40, 49, 4, m('cream')) + rr(17, 17, 9, 13, 2, m('terra')) + rr(18, 14.5, 7, 3.5, 1.2, '#8E7442') + rr(29, 20, 8, 10, 2, m('sandDark')) + rr(30, 17.5, 6, 3.5, 1.2, '#8E7442') + rr(40, 13, 9, 17, 2, m('sand')) + rr(41, 10.5, 7, 3.5, 1.2, '#8E7442') + rr(12, 30, 40, 3.5, 1, m('brass')) + rr(18, 38, 11, 14, 2, m('sandDark')) + rr(33, 41, 15, 11, 2, m('sand')) + rr(12, 52, 40, 4, 1.5, m('brass')) + hl(18, 11, 4, 1.6, -30, .6)),
  cellar: icon('cellar', (m) => pa('M13 56 V27 a19 19 0 0 1 38 0 V56 Z', m('charcoal')) + pa('M18 56 V29 a14 14 0 0 1 28 0 V56 Z', '#1F1710') + rr(18, 33, 28, 6, 0, '#EAD9BB') + rr(23, 39, 23, 6, 0, '#D9C39F') + rr(28, 45, 18, 6, 0, '#C3AC86') + rr(33, 51, 13, 5, 0, '#A8926D') + hl(24, 15, 5, 2.2, -30, .35)),
  hallway: icon('hallway', (m) => doorBody(m) + rr(12, 54, 40, 4, 2, m('terra')), 'cx="32" cy="59" rx="22" ry="3"'),
  bin1: icon('bin1', (m) => bin(m, 18, 28, 'brass')),
  bin2: icon('bin2', (m) => bin(m, 6, 24, 'brass') + bin(m, 34, 24, 'sand')),
  plate: icon('plate', (m) => [6, 9, 12].map((x) => rr(x, 15, 2, 12, 1, m('brass'))).join('') + rr(6, 25, 8, 6, 2.5, m('brass')) + rr(8.5, 30, 3, 21, 1.5, m('brass')) + rr(52, 13, 7, 22, 3.5, m('glass')) + rr(54, 33, 3, 18, 1.5, m('brass')) + ci(32, 33, 20, m('cream')) + ci(32, 33, 12.5, m('sand'), ' opacity=".8"') + hl(22, 21, 6, 3)),
  breakfast: icon('breakfast', (m) => el(30, 50, 20, 6, m('cream')) + el(30, 49.5, 12, 3.2, m('sand'), ' opacity=".7"') + ring(44, 34, 6.5, TD, 4.5) + rr(18, 20, 25, 27, 6, m('terra')) + el(30.5, 21, 12.5, 4, '#FBC6AA') + el(30.5, 21, 9.5, 2.7, '#5B3A2A') + hl(23, 31, 2.2, 6, 0, .45) + ln('M26 6 c-3 3 3 5 0 9 M34 4 c-3 3 3 5 0 9', '#D9CEC0', 2)),
  glass: icon('glass', (m) => wineGlass(m, '%P%'), 'cx="32" cy="57" rx="12" ry="2.6"', glassClip),
  noplate: icon('noplate', (m) => ci(32, 33, 20, m('muted')) + ci(32, 33, 12.5, '#FBF8F2', ' opacity=".7"') + rr(30, 12, 4, 42, 2, '#A39A8D', ' transform="rotate(45 32 33)"') + hl(22, 21, 6, 3, -35, .5)),

  /* living */
  tv: icon('tv', (m) => rr(8, 12, 48, 30, 4, m('charcoal')) + rr(11, 15, 42, 24, 2, '#3A2F25') + rr(28, 42, 8, 4, 1, m('charcoal')) + rr(18, 46, 28, 4, 2, m('brass')) + hl(18, 19, 5, 1.6, -20, .12)),
  moon: icon('moon', (m) => pa('M34 10 A21 21 0 1 0 34 52 A27 27 0 0 1 34 10 Z', m('brass')) + pa('M46 18 l1.8 5 5 1.8 -5 1.8 -1.8 5 -1.8 -5 -5 -1.8 5 -1.8 z', m('sand')) + hl(22, 22, 4, 1.8, -60, .45)),
  book: icon('book', (m) => rr(8, 12, 48, 40, 4, m('sandDark')) + rr(11, 15, 21, 34, 2, m('white')) + rr(32, 15, 21, 34, 2, m('white')) + ln('M16 24 h11 M16 30 h11 M16 36 h8 M37 24 h11 M37 30 h11 M37 36 h8', '#D9D0C0', 1.8) + rr(44, 8, 5, 16, 1, m('terra')) + hl(14, 18, 3, 1.2, -20, .8)),

  /* bedroom */
  cot: icon('cot', (m) => rr(10, 18, 44, 32, 4, m('sand')) + rr(12, 40, 40, 6, 2, m('white')) + [17, 24, 31, 38, 45].map((x) => rr(x, 22, 2, 18, 1, SD)).join('') + rr(12, 50, 4, 6, 1.5, m('brass')) + rr(48, 50, 4, 6, 1.5, m('brass')) + rr(14, 12, 10, 4, 2, m('terra')) + hl(16, 21, 3, 1.2, -20, .6)),
  wardrobe: icon('wardrobe', (m) => rr(12, 6, 40, 50, 4, m('sand')) + rr(31, 6, 2, 50, 0, SD) + rr(26, 26, 3, 10, 1.5, m('brass')) + rr(35, 26, 3, 10, 1.5, m('brass')) + rr(14, 56, 4, 3, 1, m('brass')) + rr(46, 56, 4, 3, 1, m('brass')) + hl(18, 11, 3, 1.2, -20, .55)),
  mirror: icon('mirror', (m) => ring(32, 18, 12, m('brass'), 3) + ci(32, 18, 10.5, m('glass')) + hl(28, 13, 3, 1.4, -40, .8) + rr(10, 34, 44, 6, 3, m('sandDark')) + rr(14, 40, 4, 16, 1.5, m('brass')) + rr(46, 40, 4, 16, 1.5, m('brass')) + rr(46, 26, 4, 8, 1.5, m('terra'))),
  armchair: icon('armchair', (m) => rr(14, 12, 36, 18, 8, m('sandDark')) + rr(10, 26, 44, 18, 6, m('sand')) + rr(6, 24, 9, 20, 4, m('sandDark')) + rr(49, 24, 9, 20, 4, m('sandDark')) + rr(18, 30, 28, 8, 3, m('terra')) + rr(12, 44, 4, 8, 1.5, m('brass')) + rr(48, 44, 4, 8, 1.5, m('brass')) + hl(22, 15, 4, 1.4, -20, .45)),

  /* plans step */
  pdf: icon('pdf', (m) => paper(m) + rr(10, 34, 28, 12, 3, m('terra')) + txt(24, 43, 'PDF', 8, LT)),
  image: icon('image', (m) => rr(8, 14, 48, 36, 4, m('white')) + pa('M12 46 L26 30 L34 38 L42 32 L52 46 Z', m('sand')) + ci(20, 24, 4, m('terra')) + hl(14, 18, 3, 1.2, -20, .8)),
  dwg: icon('dwg', (m) => paper(m) + ln('M22 22 h20 v20 h-20 z M22 32 h9 M32 32 v10', '#B8A98F', 1.6) + rr(10, 44, 28, 12, 3, m('charcoal')) + txt(24, 53, 'DWG', 8, LT)),
  camera: icon('camera', (m) => rr(22, 14, 20, 8, 3, m('charcoal')) + rr(8, 20, 48, 32, 6, m('charcoal')) + ci(32, 36, 11, m('glass')) + ci(32, 36, 7, '#1F1811') + rr(46, 24, 6, 3, 1.5, m('brass')) + hl(28, 31, 2.6, 1.4, -35, .8)),
  upload: icon('upload', (m) => rr(10, 44, 44, 10, 4, m('charcoal')) + rr(29, 16, 6, 24, 3, m('brass')) + pa('M32 6 L20 20 H44 Z', m('brass')) + hl(24, 15, 2.5, 1.2, -45, .6)),
  pencil: icon('pencil', (m) => g('rotate(-40 32 32)', rr(27, 6, 10, 40, 2, m('sand')) + rr(27, 6, 10, 6, 2, m('terra')) + pa('M27 46 h10 l-5 9 z', m('charcoal')) + rr(30, 14, 4, 30, 2, m('sandDark'))), 'cx="32" cy="58" rx="16" ry="3"'),
};

export const CHECK = `<svg viewBox="0 0 16 16" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M3.5 8.5 L6.5 11.5 L12.5 5" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
export const ARROW = `<svg viewBox="0 0 20 20" width="18" height="18" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M4 10 H15 M10.5 5 L15.5 10 L10.5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
export const SMALLCHECK = `<svg viewBox="0 0 16 16" width="10" height="10" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M3.5 8.5 L6.5 11.5 L12.5 5" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
