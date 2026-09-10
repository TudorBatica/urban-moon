<script lang="ts">
	import { goto } from '$app/navigation';
	import SubmitPanel from '$lib/submit/SubmitPanel.svelte';
	import { answers } from '$lib/state/answers.svelte';
	import { buildReadback, quoteText, readbackText } from '$lib/questions/readback';
	import { roomOf } from '$lib/questions/rooms';
	import { ico } from '$lib/questions/icons';
	import { lbl, visibleScreens } from '$lib/questions/screens';
	import { lastVisible } from '$lib/flow/engine';

	const readback = $derived(buildReadback(answers));
	const back = $derived(lastVisible(answers));

	interface RawRow {
		title: string;
		text: string;
	}

	/* The prototype's "Toate răspunsurile, pe scurt" list. */
	const raw = $derived.by((): RawRow[] => {
		const rows: RawRow[] = [];
		for (const s of visibleScreens(answers)) {
			if (s.kind === 'card' || s.kind === 'route') continue;
			const v = answers[s.id];
			if (v === undefined) continue;
			let text = '';
			if (typeof v === 'string') text = lbl(s.id, v, undefined, answers);
			else if (Array.isArray(v)) text = v.map((x) => lbl(s.id, String(x), undefined, answers)).join(', ');
			else if (v && typeof v === 'object')
				text = Object.entries(v as Record<string, unknown>)
					.filter(([, x]) => x !== undefined && x !== '' && !(Array.isArray(x) && !x.length))
					.map(([k, x]) =>
						Array.isArray(x)
							? x.map((y) => lbl(s.id, String(y), k, answers)).join(', ')
							: lbl(s.id, String(x), k, answers)
					)
					.join(' · ');
			if (!text) continue;
			rows.push({ title: s.title ?? s.id, text });
		}
		return rows;
	});
</script>

<h1 class="q-title">Ce am înțeles</h1>
<p class="sum-intro">
	Înainte de orice desen, iată cum am înțeles cum trăiți. Dacă ceva nu e așa, apasă Înapoi și
	schimbă.
</p>

<div class="portrait">
	{#each readback.household as line (line)}<p>{line}</p>{/each}
</div>

{#each readback.rooms as r (r.roomId)}
	{@const room = roomOf(r.roomId)}
	<div class="block">
		<div class="block-head">
			<span class="ico">{@html ico(room?.icon ?? '')}</span>
			<h3>{room?.label ?? r.roomId}</h3>
		</div>
		<div class="portrait">
			{#each r.portrait as line (line)}<p>{line}</p>{/each}
		</div>
		{#each r.quotes as [label, text] (label)}
			<div class="field-label">{label}</div>
			<p class="quote">„{quoteText(text)}”</p>
		{/each}
		{#if r.means.length}
			<div class="means">
				<h4>Ce înseamnă asta pentru plan</h4>
				<ul>
					{#each r.means as m (m)}<li>{m}</li>{/each}
				</ul>
			</div>
		{/if}
	</div>
{/each}

<details class="raw">
	<summary>Toate răspunsurile, pe scurt</summary>
	<dl>
		{#each raw as row (row.title)}
			<dt>{row.title}</dt>
			<dd>{row.text}</dd>
		{/each}
	</dl>
</details>

<SubmitPanel readback={readbackText(answers)} />

<footer class="nav">
	<button
		type="button"
		class="btn ghost"
		class:hidden={!back}
		onclick={() => back && goto(`/?s=${back.id}`)}
	>
		Înapoi
	</button>
</footer>
