<script lang="ts">
	import type { SingleScreen } from '$lib/questions/screens';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { activeFollowUp, resolveOptions } from '$lib/flow/engine';
	import Tile from '$lib/ui/Tile.svelte';
	import FollowUp from './FollowUp.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: SingleScreen;
	}

	let { screen }: Props = $props();

	const opts = $derived(resolveOptions(screen, answers));
	const fu = $derived(activeFollowUp(screen, answers));

	/* Picking never advances on its own: the user presses Continuă. */
	function pick(value: string) {
		setAnswer(screen.id, value);
		const when = screen.followUp?.when;
		const needsFollow = !!screen.followUp && (!when || when(value));
		if (screen.followUp && !needsFollow) setAnswer(screen.followUp.key, undefined);
	}
</script>

<ScreenTitle title={screen.title} subtitle={screen.subtitle} />

<!-- Few options read best as full-width rows with the icon on the left. -->
<div class="tiles" class:rows={opts.length <= 4}>
	{#each opts as o (o.value)}
		<Tile
			label={o.label}
			hint={o.hint}
			icon={o.icon}
			selected={answers[screen.id] === o.value}
			onclick={() => pick(o.value)}
		/>
	{/each}
</div>

<div class="followups">
	{#if fu}<FollowUp {fu} />{/if}
</div>
