<script lang="ts">
	import { untrack } from 'svelte';
	import type { AppCard, CardsScreen } from '$lib/questions/screens';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { cardDone, cardOn, resolveCards, resolveGroups } from '$lib/flow/engine';
	import { ico, TICK } from '$lib/questions/icons';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: CardsScreen;
	}

	let { screen }: Props = $props();

	const cards = $derived(resolveCards(screen, answers));
	const draft = $derived((answers[screen.id] as Record<string, unknown>) || {});

	/* An `always` card is open from the start, so its default lands before the first touch. */
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
	const done = (c: AppCard) => on(c) && cardDone(c, draft);
	/** the card is pushed aside because another one won the exclusive pick */
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
</script>

{#snippet options(c: AppCard)}
	<div class="groups">
		{#each resolveGroups(c, draft) as g (g.key)}
			<div class="gp">
				{#if g.label}<div class="gp-label">{g.label}</div>{/if}
				{#each g.options as o (o.value)}
					<button
						type="button"
						class="opt"
						class:on={draft[g.key] === o.value}
						aria-pressed={draft[g.key] === o.value}
						onclick={() => choose(c, g.key, o.value)}
					>
						{#if o.icon}<span class="ico">{@html ico(o.icon)}</span>{/if}
						<span class="opt-txt">
							<span>{o.label}</span>
							{#if o.hint}<small>{o.hint}</small>{/if}
						</span>
					</button>
				{/each}
			</div>
		{/each}
	</div>
{/snippet}

{#if screen.eyebrow}<p class="deck-eyebrow">{screen.eyebrow}</p>{/if}
<ScreenTitle title={screen.title} subtitle={screen.subtitle} />

<div class="deck" class:pick={!!screen.pick}>
	{#each cards as c (c.value)}
		{@const open = on(c) && !!c.groups?.length}
		<section class="acard" class:on={on(c)} class:open class:always={c.always} class:away={away(c)}>
			{#if c.always}
				<!-- placement cards are answered from the start: there is no face to turn -->
				<div class="face back">
					<span class="tick" class:show={done(c)}>{@html TICK}</span>
					<div class="acard-head">
						<span class="ico">{@html ico(c.icon)}</span>
						<span class="txt"><span class="lbl">{c.label}</span></span>
					</div>
					{@render options(c)}
				</div>
			{:else}
				<div class="flip">
					<!-- front: the card as it sits, closed -->
					<button
						type="button"
						class="face front"
						aria-pressed={on(c)}
						tabindex={open ? -1 : 0}
						onclick={() => toggle(c)}
					>
						<span class="tick" class:show={on(c) && !c.groups?.length}>{@html TICK}</span>
						<span class="acard-head">
							<span class="ico">{@html ico(c.icon)}</span>
							<span class="txt">
								<span class="lbl">{c.label}</span>
								{#if c.hint}<span class="hint">{c.hint}</span>{/if}
							</span>
						</span>
					</button>

					<!-- back: the same card, turned over onto its options -->
					<div class="face back">
						<span class="tick" class:show={done(c)}>{@html TICK}</span>
						<button
							type="button"
							class="acard-head"
							tabindex={open ? 0 : -1}
							onclick={() => toggle(c)}
						>
							<span class="ico">{@html ico(c.icon)}</span>
							<span class="txt"><span class="lbl">{c.label}</span></span>
						</button>
						{@render options(c)}
					</div>
				</div>
			{/if}
		</section>
	{/each}
</div>
