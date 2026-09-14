<script lang="ts">
	import { goto } from '$app/navigation';
	import { answers, resetAnswers } from '$lib/state/answers.svelte';
	import { clearCursor, loadCursor } from '$lib/state/cursor.svelte';
	import { isPlansComplete, plans, resetPlans } from '$lib/state/plans.svelte';
	import { resetPhotos } from '$lib/state/photos.svelte';
	import { clearSubmissionState } from '$lib/submit/submit';
	import { S, isVisible } from '$lib/questions/screens';
	import { chapterQuestionCount, chromeFor, firstVisible, visibleScreens } from '$lib/flow/engine';
	import { IMG, THUMB, unsplash } from '$lib/ui/images';
	import Frame from '$lib/ui/Frame.svelte';
	import GoBar from '$lib/ui/GoBar.svelte';

	/* The contents: every chapter of this project, where it stands, and a way back into it. */

	const resume = $derived.by(() => {
		const id = loadCursor();
		const s = id ? S.find((x) => x.id === id) : undefined;
		return s && isVisible(s, answers) ? s : firstVisible(answers);
	});

	const chapters = $derived(chromeFor('flow', resume, answers, isPlansComplete(plans)).chapters);

	const started = $derived(Object.keys(answers).length > 0);

	function hrefOf(chapter: string): string {
		const s = visibleScreens(answers).find((x) => x.chapter === chapter && x.kind !== 'route');
		return s ? `/?s=${s.id}` : '/';
	}

	function metaOf(chapter: string): string {
		if (chapter === 'planuri') return 'Planul și pozele spațiului';
		const n = chapterQuestionCount(chapter, answers);
		return n === 1 ? 'O întrebare' : `${n} întrebări`;
	}

	const STATE = { done: 'Gata', now: 'Aici ai rămas', todo: '' } as const;

	async function restart(): Promise<void> {
		resetAnswers();
		await resetPlans();
		await resetPhotos();
		clearCursor();
		clearSubmissionState();
		await goto('/');
	}
</script>

<svelte:head><title>Cuprins · Urban Moon</title></svelte:head>

<Frame img={IMG.kitchenBW} mode="dense" counter="Cuprins">
	<h1 class="q">Cuprins</h1>
	<p class="sub">Poți reveni oricând la un capitol. Răspunsurile rămân salvate în acest browser.</p>

	<ol class="toc">
		{#each chapters as c, i (c.id)}
			<li>
				<a href={hrefOf(c.id)} class={c.state} aria-current={c.state === 'now' ? 'step' : undefined}>
					<span class="th"><img src={unsplash(THUMB[c.id] ?? IMG.kitchenWhite, 200)} alt="" loading="lazy" /></span>
					<span class="tt">
						<span class="n">{String(i + 1).padStart(2, '0')}</span>{c.label}
						<small>{metaOf(c.id)}</small>
					</span>
					<span class="st">{STATE[c.state]}</span>
				</a>
			</li>
		{/each}
		<li>
			<a href="/rezumat">
				<span class="th"><img src={unsplash(THUMB.trimitere, 200)} alt="" loading="lazy" /></span>
				<span class="tt">
					<span class="n">{String(chapters.length + 1).padStart(2, '0')}</span>Trimitere
					<small>Ce am înțeles, apoi trimiți</small>
				</span>
				<span class="st"></span>
			</a>
		</li>
	</ol>

	{#if started}
		<button type="button" class="lnk restart" onclick={restart}>Începe din nou</button>
	{/if}

	{#snippet bottom()}
		<GoBar
			backHidden
			label={started ? 'Continuă de unde ai rămas' : 'Începem'}
			onnext={() => goto(resume ? `/?s=${resume.id}` : '/')}
		/>
	{/snippet}
</Frame>

<style>
	.toc {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--hair);
	}
	.toc a {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr) auto;
		gap: 16px;
		align-items: center;
		padding: 10px 0;
		border-bottom: 1px solid var(--hair);
		color: var(--ink);
		text-decoration: none;
		transition: padding var(--base) var(--ease);
	}
	.toc a:hover {
		padding-left: 6px;
	}
	.th {
		width: 56px;
		height: 56px;
		overflow: hidden;
		border-radius: 2px;
		background: var(--wash);
	}
	.th img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform var(--slow) var(--ease);
	}
	.toc a:hover .th img {
		transform: scale(1.06);
	}
	.tt {
		font: 300 21px/1.15 var(--serif-q);
		font-variation-settings: 'opsz' 30;
		min-width: 0;
	}
	.tt small {
		display: block;
		font: 400 12.5px/1.3 var(--sans);
		color: var(--grey);
		margin-top: 3px;
	}
	.n {
		font: 500 11px var(--sans);
		letter-spacing: 0.08em;
		color: var(--grey);
		margin-right: 10px;
		vertical-align: 3px;
	}
	.st {
		font-size: 12px;
		color: var(--grey);
		white-space: nowrap;
	}
	.now .st {
		color: var(--ink);
	}
	.now .st::before {
		content: '';
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ink);
		margin-right: 7px;
		vertical-align: 1px;
	}
	.todo .tt {
		color: var(--soft);
	}
	.restart {
		margin-top: 18px;
	}
	@media (max-width: 860px) {
		.toc a {
			grid-template-columns: 48px minmax(0, 1fr) auto;
			gap: 12px;
		}
		.th {
			width: 48px;
			height: 48px;
		}
		.tt {
			font-size: 19px;
		}
	}
</style>
