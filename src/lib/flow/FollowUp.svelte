<script lang="ts">
	import { untrack } from 'svelte';
	import type { FollowUp } from '$lib/questions/screens';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import Pills from '$lib/ui/Pills.svelte';
	import Stepper from '$lib/ui/Stepper.svelte';

	interface Props {
		fu: FollowUp;
		/** the parent option's label, shown as small text under a stepper's name */
		hostLabel?: string;
	}

	let { fu, hostLabel }: Props = $props();

	const seed = (): number => fu.defaultOf?.(answers) ?? fu.default ?? fu.min ?? 0;

	untrack(() => {
		if (fu.kind === 'stepper' && answers[fu.key] === undefined) setAnswer(fu.key, seed());
	});

	const value = $derived(answers[fu.key]);
</script>

<div class="followup">
	{#if fu.kind === 'stepper'}
		<Stepper
			label={fu.label}
			sub={hostLabel}
			icon={fu.icon}
			value={(value as number) ?? seed()}
			min={fu.min ?? 0}
			max={fu.max ?? 12}
			onchange={(v) => setAnswer(fu.key, v)}
		/>
	{:else}
		<div class="field-label">{fu.label}</div>
		<Pills
			options={fu.options ?? []}
			value={(value as string) ?? null}
			onselect={(v) => setAnswer(fu.key, v)}
		/>
	{/if}
</div>
