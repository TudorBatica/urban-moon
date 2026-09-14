<script lang="ts">
	import Roll from './Roll.svelte';

	interface Props {
		label: string;
		sub?: string;
		value: number;
		min?: number;
		max?: number;
		onchange: (value: number) => void;
	}

	let { label, sub, value, min = 0, max = 9, onchange }: Props = $props();

	const step = (d: number) => {
		const next = Math.min(max, Math.max(min, value + d));
		if (next !== value) onchange(next);
	};
</script>

<div class="cnt">
	<span class="cnt-l">{label}{#if sub}<small>{sub}</small>{/if}</span>
	<div class="st">
		<button type="button" aria-label="Mai puțin: {label}" disabled={value <= min} onclick={() => step(-1)}
			>−</button
		>
		<span class="val" aria-live="polite"><Roll {value} /></span>
		<button type="button" aria-label="Mai mult: {label}" disabled={value >= max} onclick={() => step(1)}
			>+</button
		>
	</div>
</div>
