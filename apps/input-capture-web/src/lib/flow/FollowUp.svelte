<script lang="ts">
	import type { FollowUp } from '@urban-moon/domain-data';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import CountRow from '$lib/ui/CountRow.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Keyed from '$lib/ui/Keyed.svelte';
	import Seg from '$lib/ui/Seg.svelte';

	interface Props {
		fu: FollowUp;
		/** the follow-up is showing: only then does a stepper write its starting value */
		active?: boolean;
		/** the parent option's label, under a stepper's name */
		hostLabel?: string;
	}

	let { fu, active = true, hostLabel }: Props = $props();

	const seed = (): number => fu.defaultOf?.(answers) ?? fu.default ?? fu.min ?? 0;

	$effect(() => {
		if (active && fu.kind === 'stepper' && answers[fu.key] === undefined) setAnswer(fu.key, seed());
	});

	const value = $derived(answers[fu.key]);
</script>

{#if fu.kind === 'stepper'}
	<CountRow
		label={fu.label}
		sub={hostLabel}
		value={(value as number) ?? seed()}
		min={fu.min ?? 0}
		max={fu.max ?? 12}
		onchange={(v) => setAnswer(fu.key, v)}
	/>
{:else if fu.kind === 'input' || fu.kind === 'text'}
	<Field
		label={fu.label}
		placeholder={fu.placeholder}
		value={(value as string) ?? ''}
		oninput={(v) => setAnswer(fu.key, v)}
	/>
{:else}
	<p class="fl">{fu.label}</p>
	{#if (fu.options?.length ?? 0) <= 4}
		<Seg
			options={fu.options ?? []}
			selected={value === undefined ? [] : [String(value)]}
			label={fu.label}
			onpick={(v) => setAnswer(fu.key, v)}
		/>
	{:else}
		<Keyed
			variant="row"
			options={fu.options ?? []}
			selected={value === undefined ? [] : [String(value)]}
			label={fu.label}
			onpick={(v) => setAnswer(fu.key, v)}
		/>
	{/if}
{/if}
