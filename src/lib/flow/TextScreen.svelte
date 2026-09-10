<script lang="ts">
	import type { TextScreen } from '$lib/questions/screens';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
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

<div>
	{#each screen.fields as f (f.key)}
		<div class="field">
			{#if f.label}<div class="field-label">{f.label}</div>{/if}
			<textarea
				class="input"
				bind:this={boxes[f.key as string]}
				placeholder={f.placeholder ?? ''}
				value={draft[f.key as string] ?? ''}
				oninput={(e) => set(f.key as string, e.currentTarget.value)}
			></textarea>
			{#if f.chips?.length}
				<div class="chips">
					{#each f.chips as c (c)}
						<button type="button" class="chipbtn" onclick={() => addChip(f.key as string, c)}>
							{c}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	<p class="q-note">Opțional. Poți sări peste.</p>
</div>
