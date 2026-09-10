<script lang="ts">
	import { untrack } from 'svelte';
	import type { MultiScreen } from '$lib/questions/screens';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { resolveOptions } from '$lib/flow/engine';
	import Tile from '$lib/ui/Tile.svelte';
	import FollowUp from './FollowUp.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: MultiScreen;
	}

	let { screen }: Props = $props();

	const opts = $derived(resolveOptions(screen, answers));

	/* The prototype prunes values that no longer have an option, once, on entry. */
	untrack(() => {
		const cur = (answers[screen.id] as string[]) || [];
		const live = resolveOptions(screen, answers);
		const kept = cur.filter((v) => live.some((o) => o.value === v));
		/* Only a real prune is worth persisting — see CompoundScreen for the empty-seed rule. */
		if (kept.length !== cur.length) setAnswer(screen.id, kept);
	});

	const sel = $derived(((answers[screen.id] as string[]) || []) as string[]);

	function toggle(value: string) {
		let next = [...sel];
		if (next.includes(value)) next = next.filter((v) => v !== value);
		else if (screen.exclusive && value === screen.exclusive) next = [value];
		else {
			next = next.filter((v) => v !== screen.exclusive);
			if (screen.max && next.length >= screen.max) return;
			next = [...next, value];
		}
		for (const o of opts) if (o.followUp && !next.includes(o.value)) setAnswer(o.followUp.key, undefined);
		setAnswer(screen.id, next);
	}
</script>

<ScreenTitle title={screen.title} subtitle={screen.subtitle ?? 'Poți alege mai multe.'} />

<div class="tiles">
	{#each opts as o (o.value)}
		<Tile
			label={o.label}
			hint={o.hint}
			icon={o.icon}
			selected={sel.includes(o.value)}
			dim={!!screen.max && sel.length >= screen.max && !sel.includes(o.value)}
			quiet={!!screen.exclusive && o.value === screen.exclusive}
			onclick={() => toggle(o.value)}
		/>
	{/each}
</div>

<div class="followups">
	{#each opts as o (o.value)}
		{#if o.followUp && sel.includes(o.value)}
			<FollowUp fu={o.followUp} hostLabel={o.label} />
		{/if}
	{/each}
</div>
