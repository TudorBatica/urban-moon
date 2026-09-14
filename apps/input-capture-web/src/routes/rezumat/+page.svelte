<script lang="ts">
	import { goto } from '$app/navigation';
	import SubmitPanel from '$lib/submit/SubmitPanel.svelte';
	import { answers } from '$lib/state/answers.svelte';
	import { plans } from '$lib/state/plans.svelte';
	import { photos } from '$lib/state/photos.svelte';
	import { answerSections, readbackText } from '$lib/questions/readback';
	import { lastVisible } from '$lib/flow/engine';
	import Frame from '$lib/ui/Frame.svelte';
	import GoBar from '$lib/ui/GoBar.svelte';

	const up = $derived({ plans, photos: photos.list });
	const sections = $derived(answerSections(answers, up));
	const back = $derived(lastVisible(answers));
</script>

<svelte:head><title>Ce am înțeles · Urban Moon</title></svelte:head>

<Frame mode="noart" counter="Trimitere">
	<h1 class="q">Ce am înțeles</h1>
	<p class="sub">Iată toate răspunsurile tale. Dacă ceva nu e așa, apasă Modifică lângă întrebare și schimbă.</p>

	{#each sections as sec, s (sec.id)}
		<section class="sec">
			<h2><span>{String(s + 1).padStart(2, '0')}</span>{sec.label}</h2>
			<dl>
				{#each sec.rows as row, i (`${row.href}-${i}`)}
					<div class="row">
						<dt>{row.question}</dt>
						<dd>
							{#if row.answer.length}
								{#each row.answer as l, j (j)}<p>{l}</p>{/each}
							{:else}
								<p class="none">Fără răspuns</p>
							{/if}
						</dd>
						<a class="edit" href={row.href}>Modifică</a>
					</div>
				{/each}
			</dl>
		</section>
	{/each}

	<SubmitPanel readback={readbackText(answers, up)} />

	{#snippet bottom()}
		<GoBar nextHidden backHidden={!back} onback={() => back && goto(`/?s=${back.id}`)} />
	{/snippet}
</Frame>

<style>
	.sec {
		margin-top: 34px;
	}
	.sec h2 {
		font: 400 22px/1.1 var(--serif-q);
		font-variation-settings: 'opsz' 30;
		margin: 0 0 10px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--ink);
	}
	.sec h2 span {
		font: 500 11px var(--sans);
		letter-spacing: 0.08em;
		color: var(--grey);
		margin-right: 12px;
		vertical-align: 4px;
	}
	dl {
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 3px 16px;
		padding: 12px 0;
		border-bottom: 1px solid var(--hair);
	}
	dt {
		font-size: 13px;
		color: var(--grey);
	}
	dd {
		grid-column: 1;
		margin: 0;
	}
	dd p {
		margin: 2px 0 0;
		font-size: 15.5px;
		color: var(--ink);
	}
	dd .none {
		color: var(--place);
	}
	.edit {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		font-size: 13px;
		color: var(--grey);
		text-decoration: none;
		transition: color var(--fast) var(--ease);
	}
	.edit:hover {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 4px;
	}
</style>
