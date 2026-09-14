<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ACCEPTED_TYPES } from '$lib/state/plans.svelte';

	interface Props {
		label: string;
		hint: string;
		disabled?: boolean;
		/** the file picker's accept list; plans by default */
		accept?: string;
		/** one line instead of a block, for the optional photos */
		slim?: boolean;
		onfiles: (files: File[]) => void;
		/** actions shown before the upload (draw the plan, the drawn plan) */
		children?: Snippet;
	}

	let {
		label,
		hint,
		disabled = false,
		accept = ACCEPTED_TYPES.join(','),
		slim = false,
		onfiles,
		children
	}: Props = $props();

	let input = $state<HTMLInputElement | null>(null);
	let camera = $state<HTMLInputElement | null>(null);
	let over = $state(0);

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
	aria-label={label}
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
	<div class="acts" class:one={!children}>
		{@render children?.()}
		<button
			type="button"
			class="drop"
			class:solid={!slim}
			class:slim
			data-testid="tile-upload"
			{disabled}
			onclick={() => pick(input)}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></svg>
			<span>
				<span class="big"><u>{label}</u>{#if slim}{' '}{:else}<br />{/if}sau trage-le aici</span>
				<span class="sm">{hint}</span>
			</span>
		</button>
	</div>

	<div class="dz-more">
		<button type="button" class="lnk" data-testid="btn-camera" {disabled} onclick={() => pick(camera)}>
			Fă o poză cu telefonul
		</button>
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
