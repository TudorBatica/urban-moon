<script lang="ts">
	import { untrack } from 'svelte';
	import { roll } from './motion';

	let { value }: { value: number } = $props();

	/* Which way the digits roll: read once per change, against the value before it. */
	let last = untrack(() => value);
	const up = $derived.by(() => {
		const grew = value >= last;
		last = value;
		return grew;
	});
</script>

<span class="roll">
	{#key value}
		<span in:roll={{ up, enter: true }} out:roll={{ up, enter: false }}>{value}</span>
	{/key}
</span>
