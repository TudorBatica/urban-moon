<script lang="ts">
	import { untrack } from 'svelte';
	import type { FollowUp as FollowUpT, SingleScreen } from '@urban-moon/domain-data';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { activeFollowUp, followUpDone, resolveOptions } from '$lib/flow/engine';
	import { line, lineKey } from '$lib/ui/lineMap';
	import Keyed from '$lib/ui/Keyed.svelte';
	import Reveal from '$lib/ui/Reveal.svelte';
	import FollowUp from './FollowUp.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: SingleScreen;
	}

	let { screen }: Props = $props();

	const opts = $derived(resolveOptions(screen, answers));
	const fu = $derived(activeFollowUp(screen, answers));
	const sel = $derived(answers[screen.id] === undefined ? [] : [String(answers[screen.id])]);

	/* Objects get drawn tiles when every option has a drawing; everything else is a keyed list. */
	const tiles = $derived(opts.length > 0 && opts.every((o) => lineKey(o.icon, o.value)));

	/* The follow-up stays mounted while its card closes, so it folds away with its content. */
	let shown = $state<FollowUpT | null>(untrack(() => fu));
	$effect(() => {
		if (fu) shown = fu;
	});

	/* Picking never advances on its own: the user presses the arrow. */
	function pick(value: string) {
		setAnswer(screen.id, value);
		const when = screen.followUp?.when;
		const needsFollow = !!screen.followUp && (!when || when(value));
		if (screen.followUp && !needsFollow) setAnswer(screen.followUp.key, undefined);
	}
</script>

<ScreenTitle title={screen.title} subtitle={screen.subtitle} />

{#if tiles}
	<div class="tiles" role="radiogroup" aria-label={screen.title}>
		{#each opts as o (o.value)}
			<button
				type="button"
				class="tile"
				class:on={sel.includes(o.value)}
				role="radio"
				aria-checked={sel.includes(o.value)}
				onclick={() => pick(o.value)}
			>
				{@html line(o.icon, o.value)}
				<span>{o.label}{#if o.hint}<small>{o.hint}</small>{/if}</span>
			</button>
		{/each}
	</div>
{:else}
	<Keyed options={opts} selected={sel} hotkeys label={screen.title} onpick={pick} />
{/if}

{#if screen.followUp}
	<Reveal open={!!fu} done={!!fu && followUpDone(fu, answers)}>
		{#if shown}<FollowUp fu={shown} active={!!fu} />{/if}
	</Reveal>
{/if}
