<script lang="ts">
	import { untrack } from 'svelte';
	import type { AppCard, CardsScreen } from '@urban-moon/domain-data';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { cardDone, cardOn, resolveCards, resolveGroups } from '$lib/flow/engine';
	import { line } from '$lib/ui/lineMap';
	import Seg from '$lib/ui/Seg.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: CardsScreen;
	}

	let { screen }: Props = $props();

	const cards = $derived(resolveCards(screen, answers));
	const draft = $derived((answers[screen.id] as Record<string, unknown>) || {});

	/* An `always` card is answered from the start, so its default lands before the first touch. */
	untrack(() => {
		const seed: Record<string, unknown> = { ...((answers[screen.id] as object) || {}) };
		let changed = false;
		for (const c of resolveCards(screen, answers)) {
			if (!c.always) continue;
			for (const g of resolveGroups(c, seed))
				if (g.default !== undefined && seed[g.key] === undefined) {
					seed[g.key] = g.default;
					changed = true;
				}
		}
		if (changed) setAnswer(screen.id, seed);
	});

	const on = (c: AppCard) => cardOn(c, draft, screen.pick);
	/** another card won the one-at-a-time pick */
	const away = (c: AppCard) =>
		!!screen.pick && draft[screen.pick] !== undefined && draft[screen.pick] !== c.value;

	function toggle(c: AppCard) {
		if (c.always) return;
		const next: Record<string, unknown> = { ...draft };
		const turningOff = on(c);

		if (screen.pick) {
			/* One card at a time: clear whatever the other card had answered. */
			for (const other of cards) for (const g of other.groups ?? []) delete next[g.key];
			if (turningOff) delete next[screen.pick];
			else next[screen.pick] = c.value;
		} else if (turningOff) {
			delete next[c.value];
			for (const g of c.groups ?? []) delete next[g.key];
		} else {
			next[c.value] = true;
		}

		if (!turningOff)
			for (const g of resolveGroups(c, next))
				if (g.default !== undefined && next[g.key] === undefined) next[g.key] = g.default;

		setAnswer(screen.id, next);
	}

	/** Picking an option in a group also drops any deeper group it just hid. */
	function choose(c: AppCard, key: string, value: string) {
		const next = { ...draft, [key]: value };
		const live = resolveGroups(c, next);
		for (const g of c.groups ?? []) if (!live.includes(g) && g.key !== key) delete next[g.key];
		setAnswer(screen.id, next);
	}

	const placement = $derived(cards.length > 0 && cards.every((c) => c.always));
</script>

{#if screen.eyebrow}
	<h1 class="q sm">{screen.eyebrow}</h1>
	<p class="sub"><b>{screen.title}.</b> {screen.subtitle ?? ''}</p>
{:else}
	<ScreenTitle title={screen.title} subtitle={screen.subtitle} small />
{/if}

{#if placement}
	<!-- placement: one block per appliance, a segmented choice each -->
	<div>
		{#each cards as c (c.value)}
			{#each resolveGroups(c, draft) as g (g.key)}
				<div class="blk">
					<h2>{c.label}</h2>
					<Seg
						options={g.options}
						selected={draft[g.key] === undefined ? [] : [String(draft[g.key])]}
						label={c.label}
						onpick={(v) => choose(c, g.key, v)}
					/>
				</div>
			{/each}
		{/each}
	</div>
{:else}
	<div class="flipset" role="group" aria-label={screen.eyebrow ?? screen.title}>
		{#each cards as c (c.value)}
			{@const isOn = on(c)}
			{@const flips = !!c.groups?.length}
			{@const groups = resolveGroups(c, draft)}
			<div
				class="acard"
				class:on={isOn}
				class:flips
				class:turned={isOn && flips}
				class:await={isOn && flips && !cardDone(c, draft)}
				class:dim={away(c)}
			>
				<button
					type="button"
					class="face"
					aria-pressed={isOn}
					tabindex={isOn && flips ? -1 : 0}
					onclick={() => toggle(c)}
				>
					{@html line(c.icon, c.value)}
					<span>{c.label}{#if c.hint}<small>{c.hint}</small>{/if}</span>
				</button>
				{#if flips}
					<div class="back" inert={!isOn}>
						<div class="back-h">
							<span>{groups[0]?.label ?? c.label}</span>
							<button type="button" class="x" aria-label="Renunț la {c.label}" onclick={() => toggle(c)}
								>×</button
							>
						</div>
						{#each groups as g, gi (g.key)}
							{#if gi > 0 && g.label}<p class="fl">{g.label}</p>{/if}
							<div class="subopts" role="radiogroup" aria-label={g.label ?? c.label}>
								{#each g.options as o, oi (o.value)}
									<button
										type="button"
										class:on={draft[g.key] === o.value}
										role="radio"
										aria-checked={draft[g.key] === o.value}
										style:--i={oi}
										onclick={() => choose(c, g.key, o.value)}
									>
										{@html line(o.icon, o.value)}
										<span>{o.label}</span>
									</button>
								{/each}
							</div>
						{/each}
						<svg class="edge" preserveAspectRatio="none" aria-hidden="true">
							<rect class="draw" x=".5" y=".5" width="99.6%" height="99%" pathLength="1" />
						</svg>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
