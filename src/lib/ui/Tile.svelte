<script lang="ts">
	import { ico, TICK } from '$lib/questions/icons';

	interface Props {
		label: string;
		hint?: string;
		icon?: string;
		selected?: boolean;
		dim?: boolean;
		/** the exclusive "no" of a multi choice: a quieter dashed row under the grid */
		quiet?: boolean;
		onclick?: () => void;
	}

	let { label, hint, icon, selected = false, dim = false, quiet = false, onclick }: Props = $props();
</script>

<button
	type="button"
	class="tile"
	class:on={selected}
	class:dim
	class:quiet
	aria-pressed={selected}
	{onclick}
>
	<span class="tick">{@html TICK}</span>
	{#if icon}<span class="ico">{@html ico(icon)}</span>{/if}
	<span class="txt">
		<span class="lbl">{label}</span>
		{#if hint}<span class="hint">{hint}</span>{/if}
	</span>
</button>
