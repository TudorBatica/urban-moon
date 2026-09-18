/* What this browser has already been shown once on the drawing screens. It is
   about the browser, not the project: starting the questionnaire again does not
   clear it. Storage is injected, so the flags can be read and written without
   one. */

export const SEEN_KEY = 'um.draw.seen';

export type SeenFlag = 'zoomHint' | 'slides' | 'landmarkSlide';

export interface SeenStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The browser's own storage, or null: a private window throws on the first read. */
export function localSeenStorage(): SeenStorage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export type SeenFlags = Partial<Record<SeenFlag, boolean>>;

export function readSeen(storage: SeenStorage | null | undefined): SeenFlags {
	if (!storage) return {};
	try {
		const raw = storage.getItem(SEEN_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const out: SeenFlags = {};
		for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
			if (v === true) out[k as SeenFlag] = true;
		}
		return out;
	} catch {
		return {};
	}
}

export function hasSeen(storage: SeenStorage | null | undefined, flag: SeenFlag): boolean {
	return readSeen(storage)[flag] === true;
}

/** Records the flag, keeping whatever else is already there. A full or absent storage is not an error. */
export function markSeen(storage: SeenStorage | null | undefined, flag: SeenFlag): SeenFlags {
	const flags = { ...readSeen(storage), [flag]: true };
	if (storage) {
		try {
			storage.setItem(SEEN_KEY, JSON.stringify(flags));
		} catch {
			/* a full or unavailable storage only costs the client one repeat */
		}
	}
	return flags;
}
