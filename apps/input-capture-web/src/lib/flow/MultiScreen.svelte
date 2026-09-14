<script lang="ts">
	import { untrack } from 'svelte';
	import type { MultiScreen } from '@urban-moon/domain-data';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { followUpDone, resolveOptions } from '$lib/flow/engine';
	import { line, lineKey } from '$lib/ui/lineMap';
	import Keyed from '$lib/ui/Keyed.svelte';
	import Reveal from '$lib/ui/Reveal.svelte';
	import FollowUp from './FollowUp.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: MultiScreen;
	}

	let { screen }: Props = $props();

	const opts = $derived(resolveOptions(screen, answers));

	/* Objects get drawn tiles when every option has a drawing (the small appliances). */
	const tiles = $derived(opts.length > 0 && opts.every((o) => lineKey(o.icon, o.value)));

	/* Values that no longer have an option are pruned, once, on entry. */
	untrack(() => {
		const cur = (answers[screen.id] as string[]) || [];
		const live = resolveOptions(screen, answers);
		const kept = cur.filter((v) => live.some((o) => o.value === v));
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

<ScreenTitle title={screen.title} subtitle={screen.subtitle} optional={screen.allowEmpty} />

{#if screen.id === 'c_rooms'}
	<div class="gseg" role="group" aria-label={screen.title}>
		{#each opts as o (o.value)}
			<button
				type="button"
				class:on={sel.includes(o.value)}
				role="checkbox"
				aria-checked={sel.includes(o.value)}
				onclick={() => toggle(o.value)}>{o.label}</button
			>
		{/each}
	</div>
{:else if tiles}
	<div class="tiles small" role="group" aria-label={screen.title}>
		{#each opts as o (o.value)}
			{@const on = sel.includes(o.value)}
			<button
				type="button"
				class="tile"
				class:on
				class:dim={!!screen.max && sel.length >= screen.max && !on}
				role="checkbox"
				aria-checked={on}
				onclick={() => toggle(o.value)}
			>
				{@html line(o.icon, o.value)}
				<span>{o.label}{#if o.hint}<small>{o.hint}</small>{/if}</span>
			</button>
		{/each}
	</div>
{:else}
	<Keyed
		multi
		variant={opts.length > 7 ? 'grid' : 'list'}
		options={opts}
		selected={sel}
		max={screen.max}
		hotkeys
		label={screen.title}
		onpick={toggle}
	/>
{/if}

{#each opts as o (o.value)}
	{#if o.followUp}
		{@const on = sel.includes(o.value)}
		<Reveal open={on} done={on && followUpDone(o.followUp, answers)}>
			<FollowUp fu={o.followUp} active={on} hostLabel={o.followUp.kind === 'stepper' ? o.label : undefined} />
		</Reveal>
	{/if}
{/each}
