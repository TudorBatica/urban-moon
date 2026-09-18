import { describe, expect, it } from 'vitest';
import { deviceForPointerType, initialDevice, watchDevice, type DeviceWindow } from './device';

function fakeWindow(coarse: boolean): DeviceWindow & { fire(pointerType: string): void; live: number } {
	const listeners: ((e: PointerEvent) => void)[] = [];
	return {
		matchMedia: (q: string) => ({ matches: coarse && q === '(pointer: coarse)' }),
		addEventListener: (_t, fn) => {
			listeners.push(fn);
		},
		removeEventListener: (_t, fn) => {
			const i = listeners.indexOf(fn);
			if (i >= 0) listeners.splice(i, 1);
		},
		fire: (pointerType: string) => {
			for (const fn of [...listeners]) fn({ pointerType } as PointerEvent);
		},
		get live() {
			return listeners.length;
		}
	};
}

describe('which device the words are for', () => {
	it('starts from what the browser says the pointer is', () => {
		expect(initialDevice(fakeWindow(true))).toBe('phone');
		expect(initialDevice(fakeWindow(false))).toBe('desktop');
		expect(initialDevice(null)).toBe('desktop');
		expect(initialDevice({})).toBe('desktop');
	});

	it('reads a finger or a pen as touch and a mouse as not', () => {
		expect(deviceForPointerType('touch')).toBe('phone');
		expect(deviceForPointerType('pen')).toBe('phone');
		expect(deviceForPointerType('mouse')).toBe('desktop');
		expect(deviceForPointerType(undefined)).toBe('desktop');
	});

	it('follows the pointer last used, and reports only changes', () => {
		const win = fakeWindow(false);
		const seen: string[] = [];
		watchDevice(win, (d) => seen.push(d));
		win.fire('mouse');
		win.fire('touch');
		win.fire('touch');
		win.fire('mouse');
		expect(seen).toEqual(['phone', 'desktop']);
	});

	it('ignores an event that names no pointer', () => {
		const win = fakeWindow(false);
		const seen: string[] = [];
		watchDevice(win, (d) => seen.push(d));
		win.fire('');
		expect(seen).toEqual([]);
	});

	it('stops listening when asked', () => {
		const win = fakeWindow(false);
		const seen: string[] = [];
		const stop = watchDevice(win, (d) => seen.push(d));
		expect(win.live).toBe(1);
		stop();
		expect(win.live).toBe(0);
		win.fire('touch');
		expect(seen).toEqual([]);
	});
});
