<script lang="ts">
	import type { TextScreen } from '$lib/questions/screens';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import Field from '$lib/ui/Field.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: TextScreen;
	}

	let { screen }: Props = $props();

	const draft = $derived((answers[screen.id] as Record<string, string>) || {});

	const set = (key: string, value: string) => setAnswer(screen.id, { ...draft, [key]: value });

	let boxes: Record<string, HTMLTextAreaElement | undefined> = $state({});

	function addChip(key: string, chip: string) {
		const cur = (draft[key] || '').trim();
		set(key, cur ? cur.replace(/[.;]\s*$/, '') + '; ' + chip : chip);
		boxes[key]?.focus();
	}
</script>

<ScreenTitle title={screen.title} subtitle={screen.subtitle} />

{#each screen.fields as f (f.key)}
	{@const key = f.key as string}
	{#if !f.chips?.length}
		<!-- a short answer: a line, not a box -->
		<Field label={f.label} placeholder={f.placeholder} value={draft[key] ?? ''} oninput={(v) => set(key, v)} />
	{:else}
		<div class="tfield">
			{#if f.label}<p class="fl">{f.label}</p>{/if}
			<textarea
				class="ta"
				class:short={screen.fields.length > 1}
				bind:this={boxes[key]}
				aria-label={f.label ?? screen.title}
				placeholder={f.placeholder ?? ''}
				value={draft[key] ?? ''}
				oninput={(e) => set(key, e.currentTarget.value)}
			></textarea>
			<div class="tags">
				{#each f.chips as c (c)}
					<button type="button" onclick={() => addChip(key, c)}>{c}</button>
				{/each}
			</div>
		</div>
	{/if}
{/each}

<style>
	.tfield + .tfield {
		margin-top: 8px;
	}
	.tfield :global(.fl) {
		margin-top: 18px;
	}
	.short {
		min-height: 88px;
	}
</style>
