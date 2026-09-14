<script lang="ts">
	import { onMount } from 'svelte';
	import type { RoomSnapshot } from '$lib/types';
	import type { FloorplanHandle, FloorplanModel } from './engine.js';
	import { mountFloorplan } from './engine.js';
	import './engine.css';

	interface Props {
		/** An engine model from a previous session — restored with setModel. */
		initialModel?: unknown;
		onchange?: (room: RoomSnapshot) => void;
	}

	let { initialModel, onchange }: Props = $props();

	let host: HTMLDivElement;
	let api: FloorplanHandle | null = null;

	onMount(() => {
		api = mountFloorplan(host, {
			onChange: (r: RoomSnapshot) => onchange?.(r)
		});
		/* The engine's own svg is `#roomSvg` / data-testid="room-svg"; the app's
		   contract calls it `editor-svg`, so the mounted node carries that name. */
		host.querySelector('#roomSvg')?.setAttribute('data-testid', 'editor-svg');
		if (initialModel) api.setModel(initialModel as FloorplanModel);
		return () => {
			api?.destroy();
			api = null;
		};
	});

	/** The window.__room() snapshot, or null before mount. */
	export function room(): RoomSnapshot | null {
		return api ? api.room() : null;
	}
	/** The engine-internal, opaque model — persisted so the plan can be re-edited. */
	export function getModel(): unknown {
		return api ? api.getModel() : null;
	}
	export function reset(): void {
		api?.reset();
	}
</script>

<div class="fp-host" data-testid="editor" bind:this={host}></div>

<style>
	/* The engine reads its own --fp-* tokens, each already `var(--app-token,
	   fallback)`; naming them here keeps the mapping explicit and survives a
	   host that scopes the palette to something other than :root. */
	.fp-host {
		--fp-paper: var(--paper);
		--fp-ink: var(--ink);
		--fp-brass: var(--brass);
		--fp-brass-deep: var(--brass-deep);
		--fp-stone: var(--stone);
		--fp-stone-soft: var(--stone-soft);
		--fp-smoke: var(--smoke);
		--fp-ash: var(--ash);
		--fp-white: var(--white);
		--fp-sans: var(--sans);

		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
	}
</style>
