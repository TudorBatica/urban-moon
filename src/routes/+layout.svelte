<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Rail from '$lib/ui/Rail.svelte';
	import Meter from '$lib/ui/Meter.svelte';
	import { answers, resetAnswers } from '$lib/state/answers.svelte';
	import { clearCursor, loadCursor } from '$lib/state/cursor.svelte';
	import { isPlansComplete, plans, resetPlans } from '$lib/state/plans.svelte';
	import { clearSubmissionState } from '$lib/submit/submit';
	import { S, isVisible, type Screen } from '$lib/questions/screens';
	import { chromeFor, firstVisible } from '$lib/flow/engine';

	let { children } = $props();

	const path = $derived(page.url.pathname);

	/** The flow screen the chrome should describe — the URL's, else the resume target. */
	const current = $derived.by((): Screen | null => {
		if (path !== '/') return null;
		const id = page.url.searchParams.get('s') ?? loadCursor();
		const s = id ? S.find((x) => x.id === id) : undefined;
		return s && isVisible(s, answers) ? s : firstVisible(answers);
	});

	const mode = $derived.by((): 'flow' | 'planuri' | 'done' | null => {
		if (path === '/') return 'flow';
		if (path === '/planuri') return 'planuri';
		if (path === '/rezumat' || path === '/multumim') return 'done';
		return null;
	});

	const chrome = $derived(
		mode ? chromeFor(mode, current, answers, isPlansComplete(plans)) : null
	);

	const hasAnswers = $derived(Object.keys(answers).length > 0);

	async function restart() {
		resetAnswers();
		await resetPlans();
		clearCursor();
		clearSubmissionState();
		await goto('/');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if path === '/deseneaza'}
	<!-- The floorplan editor is full screen: no app chrome at all. -->
	{@render children()}
{:else}
	<div class="app">
		<header class="top">
			<div class="brand">
				<div class="wordmark">URBAN MOON<small>Configurează-ți proiectul</small></div>
				{#if hasAnswers}
					<button type="button" class="restart" onclick={restart}>Începe din nou</button>
				{/if}
			</div>
			{#if chrome}
				<Rail chapters={chrome.chapters} />
				<Meter chapters={chrome.chapters} progress={chrome.progress} label={chrome.label} />
			{/if}
		</header>
		<main class="stage">
			<section id="card" aria-live="polite">
				{@render children()}
			</section>
		</main>
	</div>
{/if}
