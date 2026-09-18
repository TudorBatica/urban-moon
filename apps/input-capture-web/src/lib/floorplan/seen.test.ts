import { describe, expect, it } from 'vitest';
import { SEEN_KEY, hasSeen, markSeen, readSeen, type SeenStorage } from './seen';

function fakeStorage(initial: Record<string, string> = {}): SeenStorage & { data: Record<string, string> } {
	const data = { ...initial };
	return {
		data,
		getItem: (k) => (k in data ? data[k] : null),
		setItem: (k, v) => {
			data[k] = v;
		}
	};
}

describe('the seen-once flags', () => {
	it('are empty in a fresh browser', () => {
		expect(readSeen(fakeStorage())).toEqual({});
		expect(hasSeen(fakeStorage(), 'zoomHint')).toBe(false);
	});

	it('are written under one key, as an object', () => {
		const s = fakeStorage();
		markSeen(s, 'zoomHint');
		expect(JSON.parse(s.data[SEEN_KEY])).toEqual({ zoomHint: true });
		expect(hasSeen(s, 'zoomHint')).toBe(true);
	});

	it('remember the slides apart from the zoom hint', () => {
		const s = fakeStorage();
		expect(hasSeen(s, 'slides')).toBe(false);
		markSeen(s, 'slides');
		expect(JSON.parse(s.data[SEEN_KEY])).toEqual({ slides: true });
		expect(hasSeen(s, 'slides')).toBe(true);
		expect(hasSeen(s, 'zoomHint')).toBe(false);
		markSeen(s, 'zoomHint');
		expect(readSeen(s)).toEqual({ slides: true, zoomHint: true });
	});

	it('keep flags this version does not know about', () => {
		const s = fakeStorage({ [SEEN_KEY]: JSON.stringify({ somethingElse: true }) });
		markSeen(s, 'zoomHint');
		expect(JSON.parse(s.data[SEEN_KEY])).toEqual({ somethingElse: true, zoomHint: true });
	});

	it('survive corrupt or foreign contents', () => {
		expect(readSeen(fakeStorage({ [SEEN_KEY]: 'not json' }))).toEqual({});
		expect(readSeen(fakeStorage({ [SEEN_KEY]: '[1,2]' }))).toEqual({});
		expect(readSeen(fakeStorage({ [SEEN_KEY]: '{"zoomHint":"yes"}' }))).toEqual({});
	});

	it('work without a storage at all', () => {
		expect(readSeen(null)).toEqual({});
		expect(hasSeen(null, 'zoomHint')).toBe(false);
		expect(markSeen(null, 'zoomHint')).toEqual({ zoomHint: true });
	});

	it('cost only a repeat when the storage refuses the write', () => {
		const s: SeenStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			}
		};
		expect(() => markSeen(s, 'zoomHint')).not.toThrow();
		expect(hasSeen(s, 'zoomHint')).toBe(false);
	});
});
