<script lang="ts">
	import { goto } from '$app/navigation';
	import { pickedRooms } from '$lib/state/answers.svelte';
	import {
		addFiles,
		isPlansComplete,
		maxFiles,
		plans,
		removeFile,
		setDrawing,
		setFileRoom
	} from '$lib/state/plans.svelte';
	import { roomOf } from '$lib/questions/rooms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Dropzone from '$lib/plans/Dropzone.svelte';
	import FileTile from '$lib/plans/FileTile.svelte';
	import DrawingCard from '$lib/plans/DrawingCard.svelte';
	import { pico } from '$lib/plans/icons';
	import type { RoomId } from '$lib/types';

	const rooms = $derived(pickedRooms());
	const count = $derived(rooms.length);
	const single = $derived(count === 1);
	const max = $derived(maxFiles(count));
	const full = $derived(plans.files.length >= max);

	/* The step only makes sense after the room pick. */
	$effect(() => {
		if (count === 0) void goto('/?s=c_rooms');
	});

	const title = $derived(
		single ? `Planul pentru ${(roomOf(rooms[0])?.label ?? 'cameră').toLowerCase()}` : 'Planurile camerelor'
	);

	const sub = $derived(
		`Un PDF de la dezvoltator, o poză a planului tipărit, un DWG — orice ai. Poți încărca până la ${max} fișiere` +
			(single ? ' sau desenezi tu planul, direct aici.' : ', câte două pentru fiecare cameră.')
	);

	let rejected = $state<{ name: string; reason: string }[]>([]);

	async function onfiles(files: File[]): Promise<void> {
		const res = await addFiles(files, count);
		rejected = res.rejected;
	}

	function ontag(id: string, roomId: RoomId | null): void {
		setFileRoom(id, roomId);
	}

	function onremove(id: string): void {
		void removeFile(id);
	}

	function deleteDrawing(): void {
		if (!confirm('Ștergi planul desenat?')) return;
		setDrawing(null);
	}
</script>

<h1 class="q-title">{title}</h1>
<p class="q-sub">{sub}</p>

<Dropzone
	label={single ? 'Încarcă planul' : 'Încarcă planurile'}
	hint="PDF, poză, DWG sau DXF. Până la 25 MB fișierul."
	disabled={full}
	{onfiles}
>
	{#if single}
		{#if plans.drawing}
			<DrawingCard
				drawing={plans.drawing}
				onedit={() => goto('/deseneaza')}
				ondelete={deleteDrawing}
			/>
		{:else}
			<button
				type="button"
				class="tile draw-tile"
				data-testid="tile-draw"
				onclick={() => goto('/deseneaza')}
			>
				<span class="ico">{@html pico('pencil')}</span>
				<span class="lbl">Desenează planul</span>
				<span class="hint">Nu ai niciun plan? Îl desenezi tu, în câteva minute.</span>
			</button>
		{/if}
	{/if}
</Dropzone>

<p class="q-note" data-testid="counter">{plans.files.length} din {max} fișiere</p>

{#if rejected.length > 0}
	<div class="rejects" data-testid="rejections">
		<ul>
			{#each rejected as r, i (`${r.name}-${i}`)}
				<li data-testid="rejection"><strong>{r.name}</strong> — {r.reason}</li>
			{/each}
		</ul>
		<button
			type="button"
			class="chipbtn"
			data-testid="rejections-dismiss"
			onclick={() => (rejected = [])}
		>
			Am înțeles
		</button>
	</div>
{/if}

{#if plans.files.length > 0}
	<div class="field">
		<div class="field-label">
			Fișierele tale
			{#if !single}<small>Poți spune ce cameră arată fiecare.</small>{/if}
		</div>
		<div class="tiles wide">
			{#each plans.files as file (file.id)}
				<FileTile {file} {rooms} showTags={!single} {onremove} {ontag} />
			{/each}
		</div>
	</div>
{/if}

<NavBar
	backLabel="Înapoi"
	nextLabel="Continuă"
	nextDisabled={!isPlansComplete(plans)}
	onback={() => goto('/?s=c_rooms')}
	onnext={() => goto('/?s=c_stage')}
/>

<style>
	.draw-tile {
		min-height: 148px;
	}
	.draw-tile .ico {
		width: 56px;
		height: 56px;
	}
	.draw-tile .ico :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.rejects {
		margin-top: 14px;
		padding: 16px 18px;
		background: var(--brass-tint);
		border-radius: var(--r-card);
	}
	.rejects ul {
		margin: 0 0 10px;
		padding-left: 18px;
		font-size: 0.88rem;
		color: var(--smoke);
	}
	.rejects li {
		margin: 3px 0;
	}
	.rejects strong {
		color: var(--ink);
		font-weight: 600;
	}
</style>
