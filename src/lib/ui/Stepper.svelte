<script lang="ts">
	import { ico } from '$lib/questions/icons';

	interface Props {
		label: string;
		sub?: string;
		icon?: string;
		value: number;
		min?: number;
		max?: number;
		/** compound screens wrap the row in a divider (`.stepper-row`) */
		row?: boolean;
		onchange?: (value: number) => void;
	}

	let { label, sub, icon, value, min = 0, max = 9, row = false, onchange }: Props = $props();

	const step = (d: number) => {
		const next = Math.min(max, Math.max(min, value + d));
		if (next !== value) onchange?.(next);
	};
</script>

<div class="stepper" class:stepper-row={row}>
	{#if icon}<span class="ico">{@html ico(icon)}</span>{/if}
	<span class="name">
		{label}
		{#if sub}<small>{sub}</small>{/if}
	</span>
	<span class="ctl">
		<button type="button" disabled={value <= min} onclick={() => step(-1)} aria-label="Mai puțin"
			>−</button
		>
		<span class="val">{value}</span>
		<button type="button" disabled={value >= max} onclick={() => step(1)} aria-label="Mai mult"
			>+</button
		>
	</span>
</div>
