<script lang="ts">
	import type { Option } from '$lib/questions/screens';

	interface Props {
		options: Option[];
		selected: string[];
		multi?: boolean;
		/** list: one per row · grid: two columns, for long lists · row: compact, wrapping */
		variant?: 'list' | 'grid' | 'row';
		/** multi only: at the cap, the rest dim */
		max?: number;
		/** pressing an option's letter picks it */
		hotkeys?: boolean;
		label?: string;
		onpick: (value: string) => void;
	}

	let {
		options,
		selected,
		multi = false,
		variant = 'list',
		max,
		hotkeys = false,
		label,
		onpick
	}: Props = $props();

	const letter = (i: number): string => String.fromCharCode(65 + i);

	function onKey(e: KeyboardEvent) {
		if (!hotkeys || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
		if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return;
		const i = e.key.toUpperCase().charCodeAt(0) - 65;
		if (i < 0 || i >= options.length) return;
		e.preventDefault();
		onpick(options[i].value);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="opts {variant}" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
	{#each options as o, i (o.value)}
		{@const on = selected.includes(o.value)}
		<button
			type="button"
			class="opt"
			class:on
			class:dim={multi && !!max && selected.length >= max && !on}
			role={multi ? 'checkbox' : 'radio'}
			aria-checked={on}
			onclick={() => onpick(o.value)}
		>
			<span class="k" aria-hidden="true"
				>{letter(i)}<svg viewBox="0 0 24 24"><path pathLength="1" d="M7 12.5l3.5 3.5L17 9" /></svg></span
			>
			<span class="t">{o.label}{#if o.hint}<small>{o.hint}</small>{/if}</span>
		</button>
	{/each}
</div>
