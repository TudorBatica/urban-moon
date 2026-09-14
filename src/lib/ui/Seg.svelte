<script lang="ts">
	interface Props {
		options: { value: string; label: string }[];
		selected: string[];
		multi?: boolean;
		/** sits inline at the end of a row */
		mini?: boolean;
		label?: string;
		onpick: (value: string) => void;
	}

	let { options, selected, multi = false, mini = false, label, onpick }: Props = $props();

	/* Single choice: the indicator slides to the picked cell, and waits off to the left until then. */
	const at = $derived(options.findIndex((o) => selected.includes(o.value)));
</script>

<div class="seg" class:multi class:mini role={multi ? 'group' : 'radiogroup'} aria-label={label}>
	{#if !multi}
		<span
			class="ind"
			aria-hidden="true"
			style:width="{100 / Math.max(options.length, 1)}%"
			style:transform="translateX({at < 0 ? -100 : at * 100}%)"
		></span>
	{/if}
	{#each options as o (o.value)}
		<button
			type="button"
			class:on={selected.includes(o.value)}
			role={multi ? 'checkbox' : 'radio'}
			aria-checked={selected.includes(o.value)}
			onclick={() => onpick(o.value)}>{o.label}</button
		>
	{/each}
</div>
