<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function when(at: string): string {
		if (!at) return '';
		const d = new Date(at);
		return Number.isNaN(d.getTime()) ? at : d.toLocaleString('ro-RO');
	}
</script>

<svelte:head><title>Inbox mock · Urban Moon</title></svelte:head>

<h1 class="q-title">Inbox mock</h1>
<p class="q-sub">
	Ce a primit WireMock de la aplicație, cel mai nou primul. Sursa: {data.adminBase}.
</p>

{#if data.problem}
	<p class="q-note" data-testid="inbox-problem">{data.problem}</p>
{:else if data.entries.length === 0}
	<p class="q-note" data-testid="inbox-empty">Nimic încă. Trimite un formular și reîncarcă.</p>
{/if}

<div class="list" data-testid="inbox-list">
	{#each data.entries as entry (entry.id)}
		<section class="entry" data-kind={entry.kind}>
			<div class="head">
				<span class="kind">{entry.kind === 'submission' ? 'Trimitere formular' : 'Încărcare fișier'}</span>
				<span class="at">{when(entry.at)}</span>
			</div>
			<p class="line"><code>{entry.method} {entry.url}</code> · {entry.status} · {entry.size} octeți</p>

			{#if entry.kind === 'submission'}
				{#if entry.note}<p class="line note">{entry.note}</p>{/if}
				{#if entry.fields.length > 0}
					<dl>
						{#each entry.fields as f, i (i)}
							<dt>{f.name}</dt>
							<dd>{f.value}</dd>
						{/each}
					</dl>
				{:else}
					<p class="line note">Fără câmpuri.</p>
				{/if}
			{:else}
				<div class="means">
					<ul>
						<li>fileName: {entry.fileName || '—'}</li>
						<li>folderPath: {entry.folderPath || '—'}</li>
					</ul>
				</div>
			{/if}
		</section>
	{/each}
</div>

<style>
	.list {
		margin-top: 24px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding-bottom: 40px;
	}
	.entry {
		background: var(--white);
		border: 1px solid var(--stone-soft);
		padding: 16px 18px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 8px;
	}
	.kind {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--brass-deep);
	}
	.at {
		font-size: 0.76rem;
		color: var(--ash);
	}
	.line {
		margin: 0 0 6px;
		font-size: 0.8rem;
		color: var(--smoke);
		overflow-wrap: anywhere;
	}
	.line.note {
		color: var(--ash);
	}
	code {
		font-size: 0.78rem;
	}
	dl {
		display: grid;
		grid-template-columns: minmax(140px, 1fr) 3fr;
		gap: 4px 16px;
		font-size: 0.8rem;
		margin: 10px 0 0;
	}
	dt {
		color: var(--ash);
		overflow-wrap: anywhere;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.means ul {
		font-size: 0.8rem;
	}
</style>
