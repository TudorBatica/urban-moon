import type { Answers } from '$lib/types';
import {
	CHAPTER_LABEL,
	S,
	furnitureItems,
	isVisible,
	resolveCards,
	resolveFieldOptions,
	resolveGroups,
	resolveOptions,
	visibleScreens,
	type AppCard,
	type Field,
	type FollowUp,
	type Screen
} from '$lib/questions/screens';
import { ROOMS } from '$lib/questions/rooms';
import { picked } from '$lib/questions/predicates';

/* The prototype's navigation, chrome and completeness rules, as pure functions. */

export const indexOfScreen = (id: string): number => S.findIndex((s) => s.id === id);

export function screenFor(id: string | null, a: Answers): Screen | null {
	if (!id) return null;
	const s = S.find((x) => x.id === id);
	return s && isVisible(s, a) ? s : null;
}

export const firstVisible = (a: Answers): Screen | null => visibleScreens(a)[0] ?? null;

/** The next visible screen after `id`, or null when the flow is finished. */
export function nextScreen(id: string, a: Answers): Screen | null {
	let i = indexOfScreen(id) + 1;
	while (i < S.length && !isVisible(S[i], a)) i++;
	return i < S.length ? S[i] : null;
}

/** The previous visible screen before `id`, or null when `id` is the first one. */
export function prevScreen(id: string, a: Answers): Screen | null {
	let i = indexOfScreen(id) - 1;
	while (i >= 0 && !isVisible(S[i], a)) i--;
	return i >= 0 ? S[i] : null;
}

export function isLast(s: Screen, a: Answers): boolean {
	const vis = visibleScreens(a);
	return vis.indexOf(s) === vis.length - 1;
}

/** The last visible screen — where /rezumat's Back button goes. */
export function lastVisible(a: Answers): Screen | null {
	const vis = visibleScreens(a);
	return vis[vis.length - 1] ?? null;
}

/* ---------------- completeness ---------------- */

export const followUpDone = (fu: FollowUp, a: Answers): boolean =>
	fu.kind === 'stepper' ? a[fu.key] !== undefined : !!String(a[fu.key] ?? '').trim();

/** The follow-up of a `single` screen, if the picked value opens it. */
export function activeFollowUp(s: Screen, a: Answers): FollowUp | null {
	if (s.kind !== 'single' || !s.followUp) return null;
	const v = a[s.id];
	if (v === undefined) return null;
	const when = s.followUp.when;
	return !when || when(v as string) ? s.followUp : null;
}

export function fieldVisible(f: Field, draft: Record<string, unknown>, a: Answers): boolean {
	return !f.showIf || f.showIf(draft, a);
}

export function fieldDone(f: Field, draft: Record<string, unknown>): boolean {
	if (f.kind === 'heading') return true;
	if (f.kind === 'stepper') return true;
	const v = f.key ? draft[f.key] : undefined;
	/* Picking "Altceva" asks for the text too. */
	if (f.other) {
		const on = Array.isArray(v) ? v.includes(f.other.value) : v === f.other.value;
		if (on && !String(draft[f.other.key] ?? '').trim()) return false;
	}
	if (f.kind === 'pills') return v !== undefined;
	if (f.kind === 'pillsMulti') return !!f.allowEmpty || (Array.isArray(v) && v.length > 0);
	if (f.kind === 'input') return !!String(v ?? '').trim();
	if (f.kind === 'email') return /\S+@\S+\.\S+/.test(String(v ?? ''));
	return true;
}

export function compoundComplete(
	s: Screen,
	draft: Record<string, unknown>,
	a: Answers
): boolean {
	if (s.kind !== 'compound') return true;
	return s.fields.every((f) => !fieldVisible(f, draft, a) || fieldDone(f, draft));
}

/* ---------------- cards ---------------- */

/** Is this card ticked? An `always` card is open from the start. */
export function cardOn(
	card: AppCard,
	draft: Record<string, unknown>,
	pick?: string
): boolean {
	if (card.always) return true;
	if (pick) return draft[pick] === card.value;
	return draft[card.value] === true;
}

/** A ticked card is answered once each of its visible groups has a value. */
export function cardDone(card: AppCard, draft: Record<string, unknown>): boolean {
	return resolveGroups(card, draft).every((g) => draft[g.key] !== undefined);
}

export function cardsComplete(s: Screen, draft: Record<string, unknown>, a: Answers): boolean {
	if (s.kind !== 'cards') return true;
	const cards = resolveCards(s, a);
	const on = cards.filter((c) => cardOn(c, draft, s.pick));
	if (on.length === 0) return !!s.allowEmpty;
	return on.every((c) => cardDone(c, draft));
}

export interface ContinueState {
	enabled: boolean;
	label: string;
}

/** Exactly the prototype's `refreshContinue`. */
export function continueState(s: Screen, a: Answers): ContinueState {
	const last = isLast(s, a);
	const label = last ? 'Vezi ce am înțeles' : 'Continuă';
	const skip = last ? 'Sar peste, vezi ce am înțeles' : 'Sar peste';
	if (s.kind === 'single') {
		const v = a[s.id];
		const fu = activeFollowUp(s, a);
		return { enabled: v !== undefined && (!fu || followUpDone(fu, a)), label };
	}
	if (s.kind === 'multi') {
		const sel = (a[s.id] as string[]) || [];
		const opts = resolveOptions(s, a);
		const pending = opts.filter(
			(o) => o.followUp && sel.includes(o.value) && !followUpDone(o.followUp, a)
		);
		return {
			enabled: (sel.length > 0 || !!s.allowEmpty) && pending.length === 0,
			label: sel.length === 0 && s.allowEmpty ? skip : label
		};
	}
	if (s.kind === 'compound') {
		const draft = (a[s.id] as Record<string, unknown>) || {};
		return { enabled: compoundComplete(s, draft, a), label };
	}
	if (s.kind === 'cards') {
		const draft = (a[s.id] as Record<string, unknown>) || {};
		const none = !!s.allowEmpty && resolveCards(s, a).every((c) => !cardOn(c, draft, s.pick));
		return { enabled: cardsComplete(s, draft, a), label: none ? skip : label };
	}
	if (s.kind === 'text') {
		const d = (a[s.id] as Record<string, string>) || {};
		const empty = s.fields.every((f) => !String(d[f.key ?? ''] ?? '').trim());
		return {
			enabled: true,
			label: empty ? skip : label
		};
	}
	if (s.kind === 'furniture') {
		const empty = furnitureItems(a[s.id]).length === 0;
		return {
			enabled: true,
			label: empty ? skip : label
		};
	}
	if (s.kind === 'card') return { enabled: true, label: 'Începem' };
	return { enabled: true, label };
}

/** The number of questions a chapter card announces. */
export function chapterQuestionCount(chapter: string, a: Answers): number {
	return visibleScreens(a).filter(
		(x) => x.chapter === chapter && x.kind !== 'card' && !(x.kind === 'multi' && x.sub)
	).length;
}

/* ---------------- chrome: rail + meter ---------------- */

export interface RailChapter {
	id: string;
	label: string;
	state: 'todo' | 'now' | 'done';
}

export interface Chrome {
	chapters: RailChapter[];
	label: string;
	/** 0..1 */
	progress: number;
}

/** Despre tine · Planuri · Locuința · <picked rooms, in ROOMS order>. */
export function chapterList(a: Answers): { id: string; label: string }[] {
	const list = [
		{ id: 'despre_tine', label: CHAPTER_LABEL.despre_tine },
		{ id: 'planuri', label: CHAPTER_LABEL.planuri },
		{ id: 'locuinta', label: CHAPTER_LABEL.locuinta }
	];
	for (const r of ROOMS) if (picked(a, r.id)) list.push({ id: r.id, label: r.label });
	return list;
}

const counted = (s: Screen): boolean => s.kind !== 'card' && !(s.kind === 'multi' && s.sub);

/**
 * The header chrome for a page.
 * `current` is the flow screen being shown, or null off the flow.
 * `mode`: 'flow' | 'planuri' | 'done'.
 */
export function chromeFor(
	mode: 'flow' | 'planuri' | 'done',
	current: Screen | null,
	a: Answers,
	plansComplete: boolean
): Chrome {
	const chapters = chapterList(a);
	const vis = visibleScreens(a);

	if (mode === 'done') {
		return {
			chapters: chapters.map((c) => ({ ...c, state: 'done' as const })),
			label: 'Ce am înțeles',
			progress: 1
		};
	}

	const nowChapter = mode === 'planuri' ? 'planuri' : (current?.chapter ?? null);
	const curIdx = current ? vis.indexOf(current) : mode === 'planuri' ? vis.findIndex((s) => s.chapter === 'planuri') : vis.length;

	const rail: RailChapter[] = chapters.map((c) => {
		if (c.id === nowChapter) return { ...c, state: 'now' };
		if (c.id === 'planuri') return { ...c, state: plansComplete ? 'done' : 'todo' };
		const idxs = vis.map((s, i) => (s.chapter === c.id ? i : -1)).filter((i) => i >= 0);
		const done = idxs.length > 0 && idxs[idxs.length - 1] < curIdx;
		return { ...c, state: done ? 'done' : 'todo' };
	});

	if (mode === 'planuri')
		return { chapters: rail, label: CHAPTER_LABEL.planuri, progress: plansComplete ? 1 : 0 };

	if (!current) return { chapters: rail, label: '', progress: 0 };

	const inChapter = vis.filter((s) => s.chapter === current.chapter && counted(s));
	const n = inChapter.length;
	const pos = vis.indexOf(current);
	const i = vis.filter(
		(s) => s.chapter === current.chapter && counted(s) && vis.indexOf(s) <= pos
	).length;
	const label = CHAPTER_LABEL[current.chapter] || '';
	if (current.kind === 'card') return { chapters: rail, label: `${label} · ${n} întrebări`, progress: 0 };
	return { chapters: rail, label: `${label} · ${i} din ${n}`, progress: n ? i / n : 0 };
}

/** The question counter in the top bar: position among the chapter's questions. */
export function counterFor(s: Screen | null, a: Answers): { i: number; n: number } | null {
	if (!s || !counted(s) || s.kind === 'route') return null;
	const inChapter = visibleScreens(a).filter((x) => x.chapter === s.chapter && counted(x));
	const i = inChapter.indexOf(s);
	return i < 0 ? null : { i: i + 1, n: inChapter.length };
}

export { resolveOptions, resolveFieldOptions, resolveCards, resolveGroups, visibleScreens, isVisible };
