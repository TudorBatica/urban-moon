<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		label?: string;
		value: string;
		placeholder?: string;
		type?: 'text' | 'email';
		autocomplete?: HTMLInputAttributes['autocomplete'];
		inputmode?: HTMLInputAttributes['inputmode'];
		ariaLabel?: string;
		/** for focusing from outside */
		ref?: HTMLInputElement;
		oninput: (value: string) => void;
	}

	let {
		label,
		value,
		placeholder = '',
		type = 'text',
		autocomplete,
		inputmode,
		ariaLabel,
		ref = $bindable(),
		oninput
	}: Props = $props();
</script>

<label class="field">
	{#if label}<span class="field-l">{label}</span>{/if}
	<input
		class="in"
		bind:this={ref}
		{type}
		{placeholder}
		{autocomplete}
		{inputmode}
		aria-label={ariaLabel}
		{value}
		oninput={(e) => oninput(e.currentTarget.value)}
	/>
</label>
