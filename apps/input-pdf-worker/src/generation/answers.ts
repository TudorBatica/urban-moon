import {
	CHAPTER_LABEL,
	activeFollowUp,
	cardOn,
	fieldVisible,
	furnitureItems,
	resolveCards,
	resolveFieldOptions,
	resolveGroups,
	resolveOptions,
	visibleScreens,
	type Answers,
	type Field,
	type FollowUp,
	type Option,
	type Screen
} from '@urban-moon/domain-data';

/* Turns committed answers into readable questions and answers, using the catalog for the
   question texts and option labels. Only questions the client could see are listed. */

export interface QaRow {
	screenId: string;
	question: string;
	/** one line per part of the answer; empty when skipped */
	answer: string[];
}

export interface QaChapter {
	id: string;
	label: string;
	rows: QaRow[];
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** "Ce vârste au copiii?" → "Ce vârste au copiii", for use as a prefix */
const bare = (q: string): string => q.replace(/[?:…\s]+$/, '');
const labelOf = (opts: Option[], v: unknown): string =>
	opts.find((o) => o.value === String(v))?.label.replace(/^…/, '') ?? String(v);

function followUpText(fu: FollowUp, a: Answers): string {
	const v = a[fu.key];
	if (v === undefined || v === '') return '';
	if (fu.kind === 'input' || fu.kind === 'text') return text(v);
	if (fu.kind === 'stepper') return `${bare(fu.label)}: ${v}`;
	return `${bare(fu.label)}: ${labelOf(fu.options ?? [], v)}`;
}

function withFollowUp(label: string, fu: FollowUp | null | undefined, a: Answers): string {
	const t = fu ? followUpText(fu, a) : '';
	if (!t || !fu) return label;
	return fu.kind === 'input' || fu.kind === 'text' ? `${label}: ${t}` : `${label} (${t})`;
}

function fieldValue(f: Field, v: unknown, d: Record<string, unknown>, a: Answers): string {
	const label = labelOf(resolveFieldOptions(f, a), v);
	const typed = f.other && v === f.other.value ? text(d[f.other.key]) : '';
	return typed ? `${label}: ${typed}` : label;
}

export const questionOf = (s: Screen): string =>
	s.short ?? (s.kind === 'cards' && s.eyebrow ? `${s.eyebrow} — ${s.title}` : (s.title ?? s.id));

export function answerLines(s: Screen, a: Answers): string[] {
	switch (s.kind) {
		case 'single': {
			const v = a[s.id];
			return v === undefined ? [] : [withFollowUp(labelOf(resolveOptions(s, a), v), activeFollowUp(s, a), a)];
		}
		case 'multi': {
			const opts = resolveOptions(s, a);
			const sel = arr(a[s.id]);
			return sel.length
				? [sel.map((v) => withFollowUp(labelOf(opts, v), opts.find((o) => o.value === v)?.followUp, a)).join(', ')]
				: [];
		}
		case 'compound': {
			const d = obj(a[s.id]);
			return s.fields
				.filter((f) => f.key && f.kind !== 'heading' && fieldVisible(f, d, a))
				.map((f) => {
					const v = d[f.key as string];
					const val = Array.isArray(v)
						? v.map((x) => fieldValue(f, x, d, a)).join(', ')
						: v === undefined || v === ''
							? ''
							: f.kind === 'pills'
								? fieldValue(f, v, d, a)
								: String(v).trim();
					return val ? `${bare(f.label ?? '')}: ${val}` : '';
				})
				.filter(Boolean);
		}
		case 'text': {
			const d = obj(a[s.id]);
			return s.fields
				.map((f) => {
					const t = text(d[f.key ?? '']);
					return t && f.label ? `${bare(f.label)}: ${t}` : t;
				})
				.filter(Boolean);
		}
		case 'cards': {
			const d = obj(a[s.id]);
			return resolveCards(s, a)
				.filter((c) => cardOn(c, d, s.pick))
				.map((c) => {
					const picks = resolveGroups(c, d)
						.filter((g) => d[g.key] !== undefined)
						.map((g) => labelOf(g.options, d[g.key]));
					return picks.length ? `${c.label}: ${picks.join(', ')}` : c.label;
				});
		}
		case 'furniture':
			return furnitureItems(a[s.id]).map((x) => {
				const size = x.length || x.width ? ` — ${x.length || '?'} × ${x.width || '?'} cm` : '';
				return `${x.name || 'Obiect'}${size}`;
			});
		default:
			return [];
	}
}

/** Every visible question with its answer, grouped by chapter in catalog order. */
export function qaChapters(a: Answers): QaChapter[] {
	const chapters: QaChapter[] = [];
	const chapter = (id: string): QaChapter => {
		let c = chapters.find((x) => x.id === id);
		if (!c) {
			c = { id, label: CHAPTER_LABEL[id] ?? id, rows: [] };
			chapters.push(c);
		}
		return c;
	};
	for (const s of visibleScreens(a)) {
		/* Chapter openers hold no answer; the plans route is the plans themselves, rendered in their
		   own section. The "Am măsurat spațiul" tick is a gate to continue, not an answer. */
		if (s.kind === 'card' || s.kind === 'route') continue;
		chapter(s.chapter).rows.push({ screenId: s.id, question: questionOf(s), answer: answerLines(s, a) });
	}
	return chapters;
}
