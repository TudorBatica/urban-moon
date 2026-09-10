<script lang="ts">
	import { untrack } from 'svelte';
	import type { CompoundScreen, Field } from '$lib/questions/screens';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { fieldVisible, resolveFieldOptions } from '$lib/flow/engine';
	import Pills from '$lib/ui/Pills.svelte';
	import Stepper from '$lib/ui/Stepper.svelte';
	import Tile from '$lib/ui/Tile.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: CompoundScreen;
	}

	let { screen }: Props = $props();

	/* Stepper defaults and pillsMulti pruning, as the prototype does on entry. */
	untrack(() => {
		const seed: Record<string, unknown> = { ...((answers[screen.id] as object) || {}) };
		let changed = answers[screen.id] === undefined;
		for (const f of screen.fields) {
			if (!f.key) continue;
			if (f.kind === 'stepper' && seed[f.key] === undefined) {
				seed[f.key] = f.default ?? f.min ?? 0;
				changed = true;
			}
			if (f.kind === 'pillsMulti' && Array.isArray(seed[f.key])) {
				const opts = resolveFieldOptions(f, answers);
				const cur = seed[f.key] as string[];
				const kept = cur.filter((v) => opts.some((o) => o.value === v));
				if (kept.length !== cur.length) {
					seed[f.key] = kept;
					changed = true;
				}
			}
		}
		/* An empty seed is not an answer: writing `{}` for a screen the user has not
		   touched yet resurrects "um.answers" right after a restart and lights up the
		   "Începe din nou" button on a brand-new project. */
		if (changed && Object.keys(seed).length > 0) setAnswer(screen.id, seed);
	});

	const draft = $derived((answers[screen.id] as Record<string, unknown>) || {});

	const set = (key: string, value: unknown) => setAnswer(screen.id, { ...draft, [key]: value });

	function togglePillsMulti(f: Field, value: string) {
		const key = f.key as string;
		const cur = (draft[key] as string[]) || [];
		const next = cur.includes(value)
			? cur.filter((v) => v !== value)
			: f.exclusive && value === f.exclusive
				? [value]
				: [...cur.filter((v) => v !== f.exclusive), value];
		set(key, next);
	}

	/** pillsMulti values whose option vanished (a showIf turned false) are dropped. */
	function liveMulti(f: Field): string[] {
		const opts = resolveFieldOptions(f, answers);
		return ((draft[f.key as string] as string[]) || []).filter((v) =>
			opts.some((o) => o.value === v)
		);
	}
</script>

<ScreenTitle title={screen.title} subtitle={screen.subtitle} />

<div>
	{#each screen.fields as f, i (f.key ?? `h${i}`)}
		{#if fieldVisible(f, draft, answers)}
			{#if f.kind === 'heading'}
				<h2 class="heading">{f.label}</h2>
			{:else if f.kind === 'stepper'}
				<Stepper
					row
					label={f.label ?? ''}
					icon={f.icon}
					value={(draft[f.key as string] as number) ?? f.default ?? f.min ?? 0}
					min={f.min ?? 0}
					max={f.max ?? 9}
					onchange={(v) => set(f.key as string, v)}
				/>
			{:else}
				<div class="field">
					<div class="field-label">{f.label}</div>
					{#if f.kind === 'input' || f.kind === 'email'}
						<input
							class="input"
							type={f.kind === 'email' ? 'email' : 'text'}
							placeholder={f.placeholder ?? ''}
							autocomplete={f.kind === 'email' ? 'email' : 'name'}
							value={(draft[f.key as string] as string) ?? ''}
							oninput={(e) => set(f.key as string, e.currentTarget.value)}
						/>
					{:else if f.kind === 'pills'}
						<Pills
							options={resolveFieldOptions(f, answers)}
							value={(draft[f.key as string] as string) ?? null}
							onselect={(v) => set(f.key as string, v)}
						/>
					{:else if f.kind === 'pillsMulti'}
						{@const opts = resolveFieldOptions(f, answers)}
						{@const sel = liveMulti(f)}
						{#if f.tiles}
							<div class="tiles">
								{#each opts as o (o.value)}
									<Tile
										label={o.label}
										hint={o.hint}
										icon={o.icon}
										selected={sel.includes(o.value)}
										onclick={() => togglePillsMulti(f, o.value)}
									/>
								{/each}
							</div>
						{:else}
							<Pills options={opts} multi value={sel} onselect={(v) => togglePillsMulti(f, v)} />
						{/if}
					{/if}
				</div>
			{/if}
		{/if}
	{/each}
</div>
