<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ACCEPTED_TYPES } from '$lib/state/plans.svelte';
	import { pico } from './icons';

	interface Props {
		label: string;
		hint: string;
		disabled?: boolean;
		onfiles: (files: File[]) => void;
		/** Extra tiles rendered next to the upload tile (draw tile, drawing card). */
		children?: Snippet;
	}

	let { label, hint, disabled = false, onfiles, children }: Props = $props();

	let input = $state<HTMLInputElement | null>(null);
	let camera = $state<HTMLInputElement | null>(null);
	let over = $state(0);

	const accept = ACCEPTED_TYPES.join(',');

	function take(list: FileList | null): void {
		if (!list || list.length === 0) return;
		onfiles(Array.from(list));
	}

	function pick(el: HTMLInputElement | null): void {
		if (disabled || !el) return;
		el.value = '';
		el.click();
	}

	function onDrop(e: DragEvent): void {
		e.preventDefault();
		over = 0;
		if (disabled) return;
		take(e.dataTransfer?.files ?? null);
	}
</script>

<div
	class="dz"
	class:over={over > 0}
	data-testid="dropzone"
	role="group"
	aria-label="Adaugă planurile"
	ondragenter={(e) => {
		e.preventDefault();
		over += 1;
	}}
	ondragover={(e) => e.preventDefault()}
	ondragleave={() => {
		over = Math.max(0, over - 1);
	}}
	ondrop={onDrop}
>
	<div class="tiles wide">
		<button
			type="button"
			class="tile dz-tile"
			data-testid="tile-upload"
			{disabled}
			onclick={() => pick(input)}
		>
			<span class="ico">{@html pico('upload')}</span>
			<span class="lbl">{label}</span>
			<span class="hint">{hint}</span>
		</button>
		{@render children?.()}
	</div>

	<div class="dz-more">
		<button
			type="button"
			class="chipbtn"
			data-testid="btn-camera"
			{disabled}
			onclick={() => pick(camera)}
		>
			<span class="ico-sm">{@html pico('camera')}</span>
			Fă o poză
		</button>
		<span class="dz-drag">sau trage fișierele aici</span>
	</div>

	<input
		bind:this={input}
		type="file"
		multiple
		{accept}
		class="sr"
		data-testid="file-input"
		onchange={(e) => take(e.currentTarget.files)}
	/>
	<input
		bind:this={camera}
		type="file"
		accept="image/*"
		capture="environment"
		class="sr"
		data-testid="camera-input"
		onchange={(e) => take(e.currentTarget.files)}
	/>
</div>

<style>
	.dz {
		padding: 10px;
		margin: 0 -10px;
		border-radius: 24px;
		border: 1.5px dashed transparent;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.dz.over {
		border-color: var(--ink);
		background: var(--brass-tint);
	}
	.dz-tile {
		min-height: 148px;
	}
	.dz-tile:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.dz-more {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 12px;
	}
	.chipbtn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
	}
	.ico-sm {
		width: 24px;
		height: 24px;
		display: block;
	}
	.ico-sm :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.dz-drag {
		font-size: 0.84rem;
		color: var(--smoke);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
</style>
