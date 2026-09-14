import { browser } from '$app/environment';

/** The resume cursor: the id of the last flow screen the user was on. */
const KEY = 'um.cursor';

export function loadCursor(): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

export function saveCursor(id: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, id);
	} catch {
		/* quota or private mode */
	}
}

export function clearCursor(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* ignore */
	}
}
