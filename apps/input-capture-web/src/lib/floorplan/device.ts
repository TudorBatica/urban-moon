/* Which device the words are written for. It starts from what the browser
   says the pointer is and then follows whatever was last used, so a tablet
   with a mouse attached is told about the mouse — the same rule the editor's
   hint line follows. Pure, with the window injected. */

export type Device = 'phone' | 'desktop';

export interface DeviceWindow {
	matchMedia?: (query: string) => { matches: boolean };
	addEventListener: (
		type: 'pointerdown',
		fn: (e: PointerEvent) => void,
		options?: boolean | AddEventListenerOptions
	) => void;
	removeEventListener: (
		type: 'pointerdown',
		fn: (e: PointerEvent) => void,
		options?: boolean | EventListenerOptions
	) => void;
}

/** A pointer that is not a mouse is a finger or a pen: touch words. */
export function deviceForPointerType(pointerType: string | undefined): Device {
	if (!pointerType) return 'desktop';
	return pointerType === 'mouse' ? 'desktop' : 'phone';
}

export function initialDevice(win: Pick<DeviceWindow, 'matchMedia'> | null | undefined): Device {
	const coarse = !!win?.matchMedia?.('(pointer: coarse)').matches;
	return coarse ? 'phone' : 'desktop';
}

/** Reports every change of the pointer in use; returns the way to stop listening. */
export function watchDevice(win: DeviceWindow, onChange: (device: Device) => void): () => void {
	let current = initialDevice(win);
	const listener = (e: PointerEvent): void => {
		if (!e.pointerType) return;
		const next = deviceForPointerType(e.pointerType);
		if (next === current) return;
		current = next;
		onChange(next);
	};
	win.addEventListener('pointerdown', listener, true);
	return () => win.removeEventListener('pointerdown', listener, true);
}
