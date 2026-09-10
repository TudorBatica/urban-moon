import { browser } from '$app/environment';
import type { Answers, RoomId } from '$lib/types';

const KEY = 'um.answers';

function load(): Answers {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Answers;
	} catch {
		/* corrupt or unavailable storage — start clean */
	}
	return {};
}

function persist(): void {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(answers));
	} catch {
		/* quota or private mode — answers stay in memory */
	}
}

export const answers: Answers = $state(load());

export function setAnswer(id: string, value: unknown): void {
	if (value === undefined) delete answers[id];
	else answers[id] = value;
	persist();
}

export function resetAnswers(): void {
	for (const k of Object.keys(answers)) delete answers[k];
	if (browser) {
		try {
			localStorage.removeItem(KEY);
		} catch {
			/* ignore */
		}
	}
}

export function pickedRooms(a: Answers = answers): RoomId[] {
	const v = a.c_rooms;
	return Array.isArray(v) ? (v as RoomId[]) : [];
}

export function roomCount(a: Answers = answers): number {
	return pickedRooms(a).length;
}
