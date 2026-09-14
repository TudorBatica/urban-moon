<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { loadCursor, saveCursor } from '$lib/state/cursor.svelte';
	import { CHAPTER_LABEL, S, isVisible, type Screen } from '$lib/questions/screens';
	import {
		continueState,
		counterFor,
		firstVisible,
		indexOfScreen,
		nextScreen,
		prevScreen
	} from '$lib/flow/engine';
	import { artFor } from '$lib/ui/images';
	import { pageIn, pageOut } from '$lib/ui/motion';
	import Frame from '$lib/ui/Frame.svelte';
	import GoBar from '$lib/ui/GoBar.svelte';
	import SingleScreen from '$lib/flow/SingleScreen.svelte';
	import MultiScreen from '$lib/flow/MultiScreen.svelte';
	import CompoundScreen from '$lib/flow/CompoundScreen.svelte';
	import TextScreen from '$lib/flow/TextScreen.svelte';
	import CardsScreen from '$lib/flow/CardsScreen.svelte';
	import CardScreen from '$lib/flow/CardScreen.svelte';
	import FurnitureScreen from '$lib/flow/FurnitureScreen.svelte';

	const requested = $derived(page.url.searchParams.get('s'));

	/** The screen the URL names, when it exists and is visible. */
	const current = $derived.by((): Screen | null => {
		if (!requested) return null;
		const s = S.find((x) => x.id === requested);
		return s && isVisible(s, answers) ? s : null;
	});

	/* Resolve `/` with no (or a stale) `?s=`: resume from the saved cursor, else start over. */
	$effect(() => {
		if (current) return;
		const saved = loadCursor();
		const savedScreen = saved ? S.find((x) => x.id === saved) : undefined;
		const target =
			savedScreen && isVisible(savedScreen, answers) ? savedScreen : firstVisible(answers);
		if (target) goto(`/?s=${target.id}`, { replaceState: true, noScroll: true });
	});

	/* A `route` screen is a doorway: hand off without leaving a history entry behind. */
	$effect(() => {
		if (current?.kind === 'route') goto(current.href, { replaceState: true });
	});

	$effect(() => {
		if (current && current.kind !== 'route') saveCursor(current.id);
	});

	/* On a wide viewport the first text control takes focus. */
	$effect(() => {
		const id = current?.id;
		if (!id || !browser || window.innerWidth <= 860) return;
		const first = document.querySelector<HTMLElement>('.page:last-child input, .page:last-child textarea');
		first?.focus({ preventScroll: true });
	});

	const cont = $derived(current && current.kind !== 'route' ? continueState(current, answers) : null);
	const prev = $derived(current ? prevScreen(current.id, answers) : null);
	const art = $derived(current ? artFor(current) : null);
	const count = $derived(counterFor(current, answers));

	/* Forward, pages leave upward; going back, they leave downward. */
	let dir = $state(1);
	let lastIndex = -1;
	$effect.pre(() => {
		const i = current ? indexOfScreen(current.id) : -1;
		if (i < 0) return;
		dir = lastIndex < 0 || i >= lastIndex ? 1 : -1;
		lastIndex = i;
	});

	function forward() {
		if (!current) return;
		const target = nextScreen(current.id, answers);
		goto(target ? `/?s=${target.id}` : '/rezumat', { noScroll: false });
	}

	/** On a one-card-at-a-time section, Back first returns to the choice itself. */
	function unpick(): boolean {
		if (current?.kind !== 'cards' || !current.pick) return false;
		const draft = (answers[current.id] as Record<string, unknown>) || {};
		if (draft[current.pick] === undefined) return false;
		const next = { ...draft };
		delete next[current.pick];
		for (const c of current.cards) for (const g of c.groups ?? []) delete next[g.key];
		setAnswer(current.id, next);
		return true;
	}

	function back() {
		if (!current || unpick()) return;
		goto(prev ? `/?s=${prev.id}` : '/cuprins');
	}

	function onContinue() {
		if (cont?.enabled) forward();
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (e.key !== 'Enter' || t?.tagName === 'TEXTAREA' || t?.tagName === 'BUTTON') return;
		e.preventDefault();
		onContinue();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if current && current.kind !== 'route'}
	<Frame
		img={art?.img}
		imgMobile={art?.mobile}
		mode={art?.mode}
		{count}
		counter={CHAPTER_LABEL[current.chapter] ?? ''}
	>
		<div class="pages">
			{#key current.id}
				<div class="page" in:pageIn={{ dir }} out:pageOut={{ dir }}>
					{#if current.kind === 'single'}
						<SingleScreen screen={current} />
					{:else if current.kind === 'multi'}
						<MultiScreen screen={current} />
					{:else if current.kind === 'compound'}
						<CompoundScreen screen={current} />
					{:else if current.kind === 'text'}
						<TextScreen screen={current} />
					{:else if current.kind === 'cards'}
						<CardsScreen screen={current} />
					{:else if current.kind === 'furniture'}
						<FurnitureScreen screen={current} />
					{:else if current.kind === 'card'}
						<CardScreen screen={current} />
					{/if}
				</div>
			{/key}
		</div>

		{#snippet bottom()}
			<GoBar
				backLabel={prev ? 'Înapoi' : 'Cuprins'}
				onback={back}
				label={cont?.label ?? 'Continuă'}
				disabled={!cont?.enabled}
				bounce={current.kind === 'card'}
				bounceKey={current.id}
				onnext={onContinue}
			/>
		{/snippet}
	</Frame>
{/if}
