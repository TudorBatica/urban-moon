<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import { loadCursor, saveCursor } from '$lib/state/cursor.svelte';
	import { S, isVisible, type Screen } from '$lib/questions/screens';
	import { continueState, firstVisible, nextScreen, prevScreen } from '$lib/flow/engine';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SingleScreen from '$lib/flow/SingleScreen.svelte';
	import MultiScreen from '$lib/flow/MultiScreen.svelte';
	import CompoundScreen from '$lib/flow/CompoundScreen.svelte';
	import TextScreen from '$lib/flow/TextScreen.svelte';
	import CardsScreen from '$lib/flow/CardsScreen.svelte';
	import CardScreen from '$lib/flow/CardScreen.svelte';

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

	/* As in the prototype: on a wide viewport the first text control takes focus. */
	$effect(() => {
		const id = current?.id;
		if (!id || !browser || window.innerWidth <= 700) return;
		const first = document.querySelector<HTMLElement>('#card input, #card textarea');
		first?.focus({ preventScroll: true });
	});

	const cont = $derived(current && current.kind !== 'route' ? continueState(current, answers) : null);
	const hasBack = $derived(!!current && !!prevScreen(current.id, answers));

	function forward() {
		if (!current) return;
		const target = nextScreen(current.id, answers);
		goto(target ? `/?s=${target.id}` : '/rezumat');
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
		const prev = prevScreen(current.id, answers);
		if (prev) goto(`/?s=${prev.id}`);
	}

	function onContinue() {
		if (cont?.enabled) forward();
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (e.key !== 'Enter' || t?.tagName === 'TEXTAREA') return;
		e.preventDefault();
		onContinue();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if current && current.kind !== 'route'}
	{#key current.id}
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
		{:else if current.kind === 'card'}
			<CardScreen screen={current} />
		{/if}
	{/key}

	<NavBar
		backHidden={!hasBack}
		nextLabel={cont?.label ?? 'Continuă'}
		nextDisabled={!cont?.enabled}
		onback={back}
		onnext={onContinue}
	/>
{/if}
