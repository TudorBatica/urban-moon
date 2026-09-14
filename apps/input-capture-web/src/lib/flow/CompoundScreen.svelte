<script lang="ts">
	import { untrack } from 'svelte';
	import type { CompoundScreen, Field as FieldT } from '@urban-moon/domain-data';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { fieldDone, fieldVisible, resolveFieldOptions } from '$lib/flow/engine';
	import CountRow from '$lib/ui/CountRow.svelte';
	import Field from '$lib/ui/Field.svelte';
	import Keyed from '$lib/ui/Keyed.svelte';
	import Reveal from '$lib/ui/Reveal.svelte';
	import Seg from '$lib/ui/Seg.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: CompoundScreen;
	}

	let { screen }: Props = $props();

	/* Stepper defaults and pillsMulti pruning, on entry. */
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
		/* An empty seed is not an answer: writing `{}` for an untouched screen would resurrect
		   "um.answers" right after a restart. */
		if (changed && Object.keys(seed).length > 0) setAnswer(screen.id, seed);
	});

	const draft = $derived((answers[screen.id] as Record<string, unknown>) || {});

	const set = (key: string, value: unknown) => setAnswer(screen.id, { ...draft, [key]: value });

	function togglePillsMulti(f: FieldT, value: string) {
		const key = f.key as string;
		const cur = (draft[key] as string[]) || [];
		const next = cur.includes(value)
			? cur.filter((v) => v !== value)
			: f.exclusive && value === f.exclusive
				? [value]
				: [...cur.filter((v) => v !== f.exclusive), value];
		set(key, next);
	}

	/** Is the field's "Altceva" value picked? */
	function otherOn(f: FieldT): boolean {
		const v = draft[f.key as string];
		return Array.isArray(v) ? v.includes(f.other?.value) : v === f.other?.value;
	}

	/** pillsMulti values whose option vanished (a showIf turned false) are dropped. */
	function liveMulti(f: FieldT): string[] {
		const opts = resolveFieldOptions(f, answers);
		return ((draft[f.key as string] as string[]) || []).filter((v) =>
			opts.some((o) => o.value === v)
		);
	}

	const one = (v: unknown): string[] => (v === undefined ? [] : [String(v)]);
</script>

<ScreenTitle title={screen.title} subtitle={screen.subtitle} />

{#if screen.steps?.length}
	<ol class="journey">
		{#each screen.steps as st, i (st.label)}
			<li class={st.state} class:solid={screen.steps[i + 1] && screen.steps[i + 1].state !== 'next'}>
				<span class="mark" aria-hidden="true">
					{#if st.state === 'done'}
						<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4L18 8" /></svg>
					{:else}
						<span class="dot"></span>
					{/if}
				</span>
				<span class="lab">{st.label}</span>
				{#if st.meta}<span class="meta">{st.meta}</span>{/if}
			</li>
		{/each}
	</ol>
{/if}

{#if screen.lead}<p class="fl lead">{screen.lead}</p>{/if}

{#each screen.fields as f, i (f.key ?? `h${i}`)}
	{#if fieldVisible(f, draft, answers)}
		{@const key = f.key as string}
		{#if f.kind === 'heading'}
			<h2 class="q2">{f.label}</h2>
		{:else if f.kind === 'stepper'}
			<CountRow
				label={f.label ?? ''}
				value={(draft[key] as number) ?? f.default ?? f.min ?? 0}
				min={f.min ?? 0}
				max={f.max ?? 9}
				onchange={(v) => set(key, v)}
			/>
		{:else if f.kind === 'input' || f.kind === 'email'}
			<Field
				label={f.label}
				type={f.kind === 'email' ? 'email' : 'text'}
				placeholder={f.placeholder}
				autocomplete={f.kind === 'email' ? 'email' : 'name'}
				value={(draft[key] as string) ?? ''}
				oninput={(v) => set(key, v)}
			/>
		{:else if f.kind === 'pills'}
			{@const opts = resolveFieldOptions(f, answers)}
			{#if opts.length === 2}
				<div class="cnt">
					<span class="cnt-l">{f.label?.replace(/\?$/, '')}</span>
					<Seg mini options={opts} selected={one(draft[key])} label={f.label} onpick={(v) => set(key, v)} />
				</div>
			{:else}
				<p class="fl">{f.label}</p>
				{#if opts.length <= 4}
					<Seg options={opts} selected={one(draft[key])} label={f.label} onpick={(v) => set(key, v)} />
				{:else}
					<Keyed variant="row" options={opts} selected={one(draft[key])} label={f.label} onpick={(v) => set(key, v)} />
				{/if}
			{/if}
		{:else if f.kind === 'pillsMulti'}
			{@const opts = resolveFieldOptions(f, answers)}
			<p class="fl">{f.label}</p>
			{#if opts.length <= 4 && !f.tiles}
				<Seg multi options={opts} selected={liveMulti(f)} label={f.label} onpick={(v) => togglePillsMulti(f, v)} />
			{:else}
				<Keyed
					multi
					variant="grid"
					options={opts}
					selected={liveMulti(f)}
					label={f.label}
					onpick={(v) => togglePillsMulti(f, v)}
				/>
			{/if}
		{/if}
		{#if f.other}
			{@const other = f.other}
			<Reveal open={otherOn(f)} done={fieldDone(f, draft)}>
				<Field
					placeholder={other.placeholder}
					ariaLabel={other.placeholder}
					value={(draft[other.key] as string) ?? ''}
					oninput={(v) => set(other.key, v)}
				/>
			</Reveal>
		{/if}
	{/if}
{/each}

<style>
	/* the journey: done, now, then what follows; the line is solid up to where you are */
	.journey {
		list-style: none;
		margin: 4px 0 30px;
		padding: 0;
		max-width: 520px;
	}
	.journey li {
		position: relative;
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) auto;
		align-items: center;
		column-gap: 14px;
		min-height: 50px;
	}
	.journey li:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 13.5px;
		top: calc(50% + 13px);
		height: calc(100% - 26px);
		border-left: 1px dotted var(--grey);
	}
	.journey li.solid::after {
		border-left: 1px solid var(--ink);
	}
	.mark {
		width: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.mark svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: var(--soft);
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.dot {
		display: block;
		width: 9px;
		height: 9px;
		border: 1px solid var(--grey);
		border-radius: 50%;
	}
	.now .dot {
		width: 22px;
		height: 22px;
		border: 1.5px solid var(--ink);
		box-shadow: inset 0 0 0 4px var(--paper), inset 0 0 0 12px var(--ink);
	}
	.lab {
		font: 300 20px/1.2 var(--serif-q);
		font-variation-settings: 'opsz' 30;
		color: var(--grey);
	}
	.now .lab {
		color: var(--ink);
		font-weight: 400;
	}
	.meta {
		font-size: 13px;
		color: var(--grey);
		text-align: right;
		white-space: nowrap;
	}
	.now .meta {
		color: var(--ink);
		font-weight: 500;
	}
	.lead {
		margin-top: 0;
		color: var(--ink);
		font-size: 14.5px;
	}
	@media (max-width: 860px) {
		.lab {
			font-size: 18px;
		}
		.meta {
			font-size: 12px;
			white-space: normal;
		}
	}
</style>
