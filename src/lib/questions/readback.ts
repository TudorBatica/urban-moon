import type { Answers, PhotoMeta, PlansState } from '$lib/types';
import { activeFollowUp, cardOn, fieldVisible } from '$lib/flow/engine';
import {
	CHAPTER_LABEL,
	PLAN_MEASURED_KEY,
	furnitureItems,
	resolveCards,
	resolveFieldOptions,
	resolveGroups,
	resolveOptions,
	visibleScreens,
	type Field,
	type FollowUp,
	type Option,
	type Screen
} from './screens';

/* "Ce am înțeles": every visible question with its answer, grouped by chapter. The same list,
   as plain text, goes to HubSpot in `um_readback`. */

export interface AnswerRow {
	question: string;
	/** one line per part of the answer; empty when the question was skipped */
	answer: string[];
	/** where to change it */
	href: string;
}

export interface AnswerSection {
	id: string;
	label: string;
	rows: AnswerRow[];
}

/** What the plans step and the furniture screens hold outside `answers`. */
export interface Uploads {
	plans?: PlansState;
	photos?: PhotoMeta[];
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A question label used as a line prefix: "Ce vârste au copiii?" → "Ce vârste au copiii". */
const bare = (q: string): string => q.replace(/[?:…\s]+$/, '');

const labelOf = (opts: Option[], v: unknown): string => {
	const s = String(v);
	return opts.find((o) => o.value === s)?.label.replace(/^…/, '') ?? s;
};

export const photoCount = (n: number): string => (n === 1 ? 'o poză' : `${n} poze`);

function followUpText(fu: FollowUp, a: Answers): string {
	const v = a[fu.key];
	if (v === undefined || v === '') return '';
	if (fu.kind === 'input' || fu.kind === 'text') return text(v);
	if (fu.kind === 'stepper') return `${bare(fu.label)}: ${v}`;
	return `${bare(fu.label)}: ${labelOf(fu.options ?? [], v)}`;
}

function withFollowUp(label: string, fu: FollowUp | null | undefined, a: Answers): string {
	const t = fu ? followUpText(fu, a) : '';
	if (!t) return label;
	return fu!.kind === 'input' || fu!.kind === 'text' ? `${label}: ${t}` : `${label} (${t})`;
}

/** A compound value's label, with the typed text when it is the field's "Altceva". */
function fieldValue(f: Field, v: unknown, d: Record<string, unknown>, a: Answers): string {
	const label = labelOf(resolveFieldOptions(f, a), v);
	const typed = f.other && v === f.other.value ? text(d[f.other.key]) : '';
	return typed ? `${label}: ${typed}` : label;
}

export const questionOf = (s: Screen): string =>
	s.short ?? (s.kind === 'cards' && s.eyebrow ? `${s.eyebrow} — ${s.title}` : (s.title ?? s.id));

/** The answer to one screen, as display lines. */
export function answerLines(s: Screen, a: Answers, up: Uploads = {}): string[] {
	switch (s.kind) {
		case 'single': {
			const v = a[s.id];
			if (v === undefined) return [];
			return [withFollowUp(labelOf(resolveOptions(s, a), v), activeFollowUp(s, a), a)];
		}
		case 'multi': {
			const opts = resolveOptions(s, a);
			const sel = arr(a[s.id]);
			if (!sel.length) return [];
			const parts = sel.map((v) =>
				withFollowUp(labelOf(opts, v), opts.find((o) => o.value === v)?.followUp, a)
			);
			return [parts.join(', ')];
		}
		case 'compound': {
			const d = obj(a[s.id]);
			return s.fields
				.filter((f) => f.key && f.kind !== 'heading' && fieldVisible(f, d, a))
				.map((f) => {
					const v = d[f.key!];
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
		case 'furniture': {
			const lines = furnitureItems(a[s.id]).map((x) => {
				const size = x.length || x.width ? ` — ${x.length || '?'} × ${x.width || '?'} cm` : '';
				return `${x.name || 'Obiect'}${size}`;
			});
			const n = (up.photos ?? []).filter((p) => p.group === 'mobilier' && p.roomId === s.room).length;
			if (n) lines.push(`Imagini: ${photoCount(n)}`);
			return lines;
		}
		default:
			return [];
	}
}

/** The plans step: the measuring, the plan itself and the photos of the space. */
function plansRows(a: Answers, up: Uploads): AnswerRow[] {
	const rows: AnswerRow[] = [
		{
			question: 'Ai măsurat spațiul?',
			answer: a[PLAN_MEASURED_KEY] === true ? ['Da, am măsurat spațiul'] : [],
			href: '/planuri'
		}
	];
	if (up.plans) {
		const plan = up.plans.files.map((f) => f.name);
		if (up.plans.drawing) plan.push('Plan desenat');
		rows.push({ question: 'Planul', answer: plan, href: '/planuri' });
	}
	if (up.photos) {
		const n = up.photos.filter((p) => p.group === 'spatiu').length;
		rows.push({
			question: 'Ai imagini cu spațiul tău?',
			answer: n ? [photoCount(n)] : [],
			href: '/planuri'
		});
	}
	return rows;
}

export function answerSections(a: Answers, up: Uploads = {}): AnswerSection[] {
	const sections: AnswerSection[] = [];
	const section = (id: string): AnswerSection => {
		let sec = sections.find((x) => x.id === id);
		if (!sec) {
			sec = { id, label: CHAPTER_LABEL[id] ?? id, rows: [] };
			sections.push(sec);
		}
		return sec;
	};
	for (const s of visibleScreens(a)) {
		if (s.kind === 'card') continue;
		if (s.kind === 'route') section(s.chapter).rows.push(...plansRows(a, up));
		else
			section(s.chapter).rows.push({
				question: questionOf(s),
				answer: answerLines(s, a, up),
				href: `/?s=${s.id}`
			});
	}
	return sections;
}

/** The whole list as plain text, for the HubSpot `um_readback` field. */
export function readbackText(a: Answers, up: Uploads = {}): string {
	const out: string[] = [];
	for (const sec of answerSections(a, up)) {
		out.push(sec.label.toUpperCase());
		for (const r of sec.rows) {
			out.push(r.question);
			out.push(...(r.answer.length ? r.answer.map((x) => `- ${x}`) : ['- fără răspuns']));
		}
		out.push('');
	}
	return out.join('\n').trim();
}
