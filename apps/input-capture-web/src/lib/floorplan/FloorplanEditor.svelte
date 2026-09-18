<script lang="ts">
	import { onMount } from 'svelte';
	import type { RoomSnapshot } from '$lib/types';
	import type { FloorplanHandle, FloorplanModel } from './engine.js';
	import { mountFloorplan } from './engine.js';
	import './engine.css';

	interface Props {
		/** An engine model from a previous session — restored with setModel. */
		initialModel?: unknown;
		/** the step this editor is for: drawing the plan, or placing landmarks on it */
		mode?: 'plan' | 'landmarks';
		/** in landmarks mode, the kind the tool places */
		landmarkKind?: string;
		onchange?: (room: RoomSnapshot) => void;
		/** the client asked how to draw: the hint's link, or the ? key */
		onhelp?: () => void;
	}

	let { initialModel, mode = 'plan', landmarkKind, onchange, onhelp }: Props = $props();

	let host: HTMLDivElement;
	let api: FloorplanHandle | null = null;

	onMount(() => {
		api = mountFloorplan(host, {
			mode,
			landmarkKind,
			onChange: (r: RoomSnapshot) => onchange?.(r),
			onHelp: onhelp ? () => onhelp?.() : undefined
		});
		if (initialModel) api.setModel(initialModel as FloorplanModel);
		return () => {
			api?.destroy();
			api = null;
		};
	});

	/** The room snapshot, or null before mount. */
	export function room(): RoomSnapshot | null {
		return api ? api.room() : null;
	}
	/** The engine-internal, opaque model — persisted so the plan can be re-edited. */
	export function getModel(): unknown {
		return api ? api.getModel() : null;
	}
	export function isEmpty(): boolean {
		return api ? api.isEmpty() : true;
	}
	/** An override for the hint line: 'saving' while the plan is being saved. */
	export function setHintState(state: string | null): void {
		api?.setHintState(state);
	}
	/** The editor's own keys stand down while a note is open. */
	export function setKeysEnabled(on: boolean): void {
		api?.setKeysEnabled(on);
	}
	export function reset(): void {
		api?.reset();
	}
</script>

<div class="fp-host" data-testid="editor" bind:this={host}></div>

<style>
	.fp-host {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
	}
</style>
