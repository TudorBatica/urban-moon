/**
 * The editor itself: one session, the elements it draws into, the viewport, the
 * listeners, and the handle the host holds. A FACTORY — what would be module
 * state is per-instance, and every lookup is scoped to the mount root, so two
 * editors can share a page.
 */

import { hasSeen, localSeenStorage, markSeen } from '../seen';
import { RO } from './copy';
import { bindDom, closestOf, unbindDom, viewOf } from './dom';
import { renderCtrlLayer } from './ctrlLayer';
import { commitActiveField } from './chips';
import { installGestures } from './gestures';
import { installKeys, pressingControl, typingInField, type KeyAction, type KeyContext } from './keys';
import { settleLandmarks } from './landmarkEdits';
import { landmarksOfModel, type EditorLandmark } from './landmarks';
import { cloneModel, findSegAnywhere, selectedSegId, type Model, type Wall } from './model';
import { createNumbers } from './numbers';
import { cycleDoorSwing, mergeAdjacentPlain } from './openings';
import { planMarkup } from './planMarkup';
import { renderConfirm, renderHint, renderPlates, renderToast } from './plates';
import { installRetarget } from './retarget';
import {
	armedTool,
	createSession,
	escapeTool,
	pickTool,
	segIsFresh,
	type ConfirmState,
	type Session
} from './session';
import { hintNow, planScene } from './scene';
import { buildRoomSnapshot } from './snapshot';
import { planBox } from './topology';
import { deleteSelection } from './walls';
import { createViewport } from './viewport';
import type { FloorplanHandle, FloorplanModel, MountFloorplanOptions } from './index';
import type { RoomSnapshot } from '$lib/types';

declare global {
	interface Window {
		/** automation only, with exposeGlobals on */
		__room?: () => RoomSnapshot;
		__reset?: () => void;
		__lastModel?: Model;
	}
}

/** The zoom line shows for four seconds, the first time in this browser. */
const ZOOM_HINT_MS = 4000;

export function createEditor(root: HTMLElement, opts: MountFloorplanOptions = {}): FloorplanHandle {
	if (!root || !root.ownerDocument) throw new Error('mountFloorplan: a root element is required');
	const onChangeCb = typeof opts.onChange === 'function' ? opts.onChange : null;
	/* The help the hint offers lives outside the engine; without a host to show it
	   the line carries no link and ? does nothing. */
	const onHelpCb = typeof opts.onHelp === 'function' ? opts.onHelp : null;
	const exposeGlobals = !!opts.exposeGlobals;
	let destroyed = false;

	const doc = root.ownerDocument;
	const win = viewOf(root);

	/* The hint speaks in touch words or mouse words, starting from what the device
	   says it is and following whatever the client last used. */
	const s: Session = createSession({
		mode: opts.mode,
		landmarkKind: opts.landmarkKind,
		tools: opts.tools ?? null,
		touchWords: !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches)
	});
	const isFresh = segIsFresh(s);
	const seenStorage = opts.seenStorage !== undefined ? opts.seenStorage : localSeenStorage();
	const dom = bindDom(root, s.mode);

	/** The plate of the piece in focus, as the last render left it. */
	let focusPlateEl: HTMLElement | null = null;
	let zoomHintTimer: ReturnType<Window['setTimeout']> | null = null;

	const viewport = createViewport(dom, {
		planBox: () => planBox(s.model),
		focusPlate: () => focusPlateEl,
		onZoomed: () => noteZoomed()
	});

	function noteZoomed(): void {
		if (hasSeen(seenStorage, 'zoomHint')) return;
		markSeen(seenStorage, 'zoomHint');
		s.zoomHintUntil = Date.now() + ZOOM_HINT_MS;
		if (zoomHintTimer) win.clearTimeout(zoomHintTimer);
		zoomHintTimer = win.setTimeout(() => {
			if (!destroyed) render();
		}, ZOOM_HINT_MS + 100);
	}

	/* ----- the model's own history ----------------------------------------- */

	function pushHistory(): void {
		s.history.push(s.model);
	}
	function restoreSnapshot(snap: { walls: Wall[]; landmarks?: EditorLandmark[] }): void {
		const restored = cloneModel({ walls: snap.walls, landmarks: landmarksOfModel(snap) });
		s.model.walls = restored.walls;
		s.model.landmarks = restored.landmarks;
	}
	function undo(): void {
		const prev = s.history.undo(s.model);
		if (!prev) return;
		restoreSnapshot(prev);
		s.selection = null;
		s.drag = null;
		render();
	}
	function redo(): void {
		const next = s.history.redo(s.model);
		if (!next) return;
		restoreSnapshot(next);
		s.selection = null;
		s.drag = null;
		render();
	}
	function resetAll(): void {
		s.model = { walls: [], landmarks: [] };
		s.history.clear();
		s.selection = null;
		s.drag = null;
		s.toast = null;
		s.confirm = null;
		s.activeTool = armedTool(s.mode, s.tools);
		s.justMade = null;
		s.refusedTool = false;
		viewport.reset();
		render();
	}
	/** The piece or the square in focus goes, and with it the focus itself. */
	function deleteFocused(): void {
		const released = (): void => {
			s.selection = null;
			s.justMade = null;
		};
		if (!deleteSelection(s.ids, s.model, s.selection, isFresh, pushHistory, released)) return;
		render();
	}

	/* ----- the toast and the confirm: state here, DOM in the render --------- */

	function showToast(text: string): void {
		s.toast = { text };
	}
	function showConfirm(message: string, yesLabel: string, onYes: () => void, onNo: () => void): void {
		s.confirm = { message, yesLabel, onYes, onNo };
		render();
	}
	function offerClamp(res: { max?: number }, apply: (cm: number) => void): void {
		const max = res.max ?? 0;
		showConfirm(RO.clamp(max), RO.clampYes(max), () => apply(max), () => {});
	}

	function roomSnapshot(): RoomSnapshot {
		return buildRoomSnapshot(s.model);
	}

	/* ----- the render ------------------------------------------------------ */

	/**
	 * Rendering settles the model, which can change it: a wall that moved since the
	 * last render may no longer hold a landmark where it was, and the piece that
	 * was in focus as of the last render, if it no longer is, has just become
	 * eligible to merge into a collinear same-kind neighbour.
	 */
	function settle(): void {
		const focusedLandmark = s.selection && 'landmarkId' in s.selection ? s.selection.landmarkId : null;
		if (settleLandmarks(s.model, focusedLandmark)) s.selection = null;
		const curSelSegId = selectedSegId(s.selection);
		if (s.lastSettledSegId !== null && s.lastSettledSegId !== curSelSegId) {
			const settleF = findSegAnywhere(s.model, s.lastSettledSegId);
			if (settleF) mergeAdjacentPlain(settleF.wall, isFresh);
		}
		s.lastSettledSegId = curSelSegId;
	}

	const numbers = createNumbers(s, { isFresh, pushHistory, render, showToast, offerClamp });

	function renderHintNow(): void {
		renderHint(dom, hintNow(s), !!onHelpCb);
	}

	function render(): void {
		if (destroyed) return;
		settle();
		/* The plates first: the view is fitted into the canvas minus the bands they
		   cover, so they have to be on screen and measurable before it. */
		renderPlates({
			dom,
			session: s,
			isNarrow: viewport.isNarrow(),
			canUndo: s.history.canUndo(),
			canRedo: s.history.canRedo(),
			on: {
				pick: (id) => {
					if (pickTool(s, id)) render();
				},
				undo,
				redo,
				zoomIn: () => {
					viewport.zoomBy(1.25, null);
					render();
				},
				zoomOut: () => {
					viewport.zoomBy(1 / 1.25, null);
					render();
				},
				fit: () => {
					viewport.fitNow(render);
					render();
				}
			}
		});
		renderHintNow();
		viewport.applyView();
		const t = viewport.transform();
		const scene = planScene(s, viewport.visibleBox(t), t.scale);
		dom.svg.innerHTML = planMarkup(scene);
		focusPlateEl = renderCtrlLayer({
			dom,
			session: s,
			scale: t.scale,
			visibleBox: scene.visibleBox,
			dims: scene.dims,
			liveDim: scene.liveDim,
			cmToStage: (pt) => viewport.cmToStage(pt, t),
			isNarrow: viewport.isNarrow(),
			deps: {
				confirm: (message, yesLabel, onYes) => {
					showConfirm(message, yesLabel, onYes, () => {});
					render();
				},
				commitDim: numbers.commitDim,
				deleteFocused,
				commitSegmentLength: numbers.commitSegmentLength,
				pushHistory,
				render
			}
		});
		renderToast(dom, s.toast);
		renderConfirm(dom, s.confirm);
		if (exposeGlobals) win.__lastModel = s.model;
		notifyChange();
	}

	/* onChange fires after a render that actually changed the model — never on a
	   bare resize re-render, and never re-entrantly. */
	let lastChangeSig: string | null = null;
	let inNotify = false;
	function notifyChange(): void {
		if (!onChangeCb || inNotify) return;
		let sig: string | null = null;
		try {
			sig = JSON.stringify(s.model);
		} catch {
			sig = null;
		}
		if (sig !== null && sig === lastChangeSig) return;
		lastChangeSig = sig;
		inNotify = true;
		try {
			onChangeCb(roomSnapshot());
		} finally {
			inNotify = false;
		}
	}

	/* ----- the pointer and the keys ---------------------------------------- */

	const gestures = installGestures(s, dom, viewport, {
		render,
		pushHistory,
		restoreSnapshot,
		showToast,
		commitActiveField: () => {
			commitActiveField(doc, win);
		},
		noteZoomed,
		isFresh
	});

	function keyContext(e: KeyboardEvent): KeyContext {
		const f = findSegAnywhere(s.model, selectedSegId(s.selection));
		return {
			keysEnabled: s.keysEnabled,
			typingInField: typingInField(e.target, win),
			pressingControl: pressingControl(e.target, win),
			hasHelp: !!onHelpCb,
			hasSelection: !!s.selection,
			focusedDoor: !!(f && f.seg.kind === 'door'),
			tools: s.tools
		};
	}

	function applyKeyAction(action: KeyAction): void {
		if (action.kind === 'space') {
			gestures.setSpaceDown(true);
			return;
		}
		if (action.kind === 'spaceUp') {
			gestures.setSpaceDown(false);
			return;
		}
		if (action.kind === 'undo') return undo();
		if (action.kind === 'redo') return redo();
		if (action.kind === 'escape') {
			if (s.drag) gestures.cancelStroke();
			escapeTool(s);
			render();
			return;
		}
		if (action.kind === 'help') {
			if (onHelpCb) onHelpCb();
			return;
		}
		if (action.kind === 'delete') return deleteFocused();
		if (action.kind === 'zoom') {
			viewport.zoomBy(action.factor, null);
			render();
			return;
		}
		if (action.kind === 'fit') {
			viewport.fitNow(render);
			render();
			return;
		}
		if (action.kind === 'rotate') {
			const f = findSegAnywhere(s.model, selectedSegId(s.selection));
			if (!f) return;
			pushHistory();
			cycleDoorSwing(s.model, f.wall.id, f.seg.id);
			render();
			return;
		}
		if (pickTool(s, action.id)) render();
	}

	/* ----- the wiring ------------------------------------------------------ */

	const winListeners: [string, EventListener][] = [];
	function onWin(type: string, fn: EventListener): void {
		win.addEventListener(type, fn);
		winListeners.push([type, fn]);
	}
	const rootListeners: [string, EventListener][] = [];
	function onRootCapture(type: string, fn: EventListener): void {
		root.addEventListener(type, fn, true);
		rootListeners.push([type, fn]);
	}

	// The words a hint uses follow the pointer last used.
	const onPointerWords = (e: Event): void => {
		if (!(e instanceof win.PointerEvent) || !e.pointerType) return;
		const nowTouch = e.pointerType !== 'mouse';
		if (nowTouch !== s.touchWords) {
			s.touchWords = nowTouch;
			renderHintNow();
		}
	};
	onRootCapture('pointerdown', onPointerWords);

	/* The retarget guards go on after it, because a press they take over never
	   reaches a listener registered later. */
	const removeRetarget = installRetarget(root, win, (e) => gestures.onPointerDown(e));

	dom.hint.addEventListener('click', (e: MouseEvent) => {
		const link = closestOf(win, e.target, '.fp-help');
		if (!link || !onHelpCb) return;
		e.preventDefault();
		onHelpCb();
	});

	dom.toastDismiss.addEventListener('click', () => {
		s.toast = null;
		render();
	});

	const answerConfirm = (take: (cs: ConfirmState) => void) => (): void => {
		const cs = s.confirm;
		s.confirm = null;
		if (cs) take(cs);
		render();
	};
	dom.confirmYes.addEventListener('click', answerConfirm((cs) => cs.onYes()));
	dom.confirmNo.addEventListener('click', answerConfirm((cs) => cs.onNo()));
	dom.confirmDialog.addEventListener('mousedown', (e: MouseEvent) => {
		if (closestOf(win, e.target, 'button')) e.preventDefault();
	});

	/* A field commits on blur, and blur re-renders, which can destroy the button
	   mid-press: suppress the focus shift on mousedown, then read the field's live
	   value in a capture-phase click before any button's own handler runs. */
	dom.app.addEventListener('mousedown', (e: MouseEvent) => {
		if (closestOf(win, e.target, 'button')) e.preventDefault();
	});
	dom.app.addEventListener(
		'click',
		(e: MouseEvent) => {
			if (!closestOf(win, e.target, 'button')) return;
			if (!commitActiveField(doc, win)) e.stopImmediatePropagation();
		},
		true
	);

	// A resize keeps the view where it is; only its pixel size changed.
	onWin('resize', () => render());
	onWin('orientationchange', () => {
		win.setTimeout(() => {
			if (!destroyed) render();
		}, 60);
	});
	const removeKeys = installKeys(win, { context: keyContext, apply: applyKeyAction });

	/* ----- the handle ------------------------------------------------------ */

	/**
	 * A model saved by an earlier editor still carries the ceiling height; it is
	 * accepted and ignored, because the height now lives on the saved drawing's own
	 * snapshot. One saved before landmarks existed simply has none.
	 */
	function setModel(m: FloorplanModel): void {
		if (!m || typeof m !== 'object' || !Array.isArray(m.walls)) {
			throw new Error('setModel: expected { walls }');
		}
		restoreSnapshot({ walls: m.walls, landmarks: landmarksOfModel(m) });
		s.history.clear();
		s.selection = null;
		s.drag = null;
		s.toast = null;
		s.confirm = null;
		s.lastSettledSegId = null;
		s.activeTool = armedTool(s.mode, s.tools);
		s.justMade = null;
		s.refusedTool = false;
		viewport.stopFitEase();
		viewport.reset();
		s.ids.bumpPast(s.model);
		render();
	}

	function destroy(): void {
		if (destroyed) return;
		destroyed = true;
		gestures.destroy();
		viewport.destroy();
		if (zoomHintTimer) win.clearTimeout(zoomHintTimer);
		winListeners.forEach(([type, fn]) => win.removeEventListener(type, fn));
		rootListeners.forEach(([type, fn]) => root.removeEventListener(type, fn, true));
		winListeners.length = 0;
		rootListeners.length = 0;
		removeRetarget();
		removeKeys();
		if (exposeGlobals) {
			if (win.__room === roomSnapshot) delete win.__room;
			if (win.__reset === resetAll) delete win.__reset;
			delete win.__lastModel;
		}
		unbindDom(dom);
	}

	if (exposeGlobals) {
		win.__room = roomSnapshot;
		win.__reset = resetAll;
	}

	render();

	return {
		room: () => roomSnapshot(),
		getModel: () => cloneModel(s.model), // already a deep clone
		setModel,
		reset: () => resetAll(),
		isEmpty: () => s.model.walls.length === 0,
		/** an override for the hint line, e.g. while the host is saving */
		setHintState: (state) => {
			s.hintState = state || null;
			render();
		},
		/** the engine's keys stand down while the host has a note open */
		setKeysEnabled: (on) => {
			s.keysEnabled = !!on;
		},
		destroy
	};
}
