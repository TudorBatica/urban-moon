<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import FloorplanEditor from '$lib/floorplan/FloorplanEditor.svelte';
	import { roomToSvg, svgToPngDataUrl } from '$lib/floorplan/export';
	import { pickedRooms, roomCount } from '$lib/state/answers.svelte';
	import { plans, setDrawing } from '$lib/state/plans.svelte';
	import { roomOf } from '$lib/questions/rooms';
	import type { RoomSnapshot } from '$lib/types';

	let editor = $state<ReturnType<typeof FloorplanEditor> | null>(null);
	let wallCount = $state(0);
	let unclosed = $state<string[] | null>(null);
	let askDiscard = $state(false);
	let saving = $state(false);

	/** The model as it was when the editor opened — "changed?" compares against it. */
	let baseline: string | null = null;

	const initialModel = plans.drawing?.model;
	const roomLabel = $derived(roomOf(pickedRooms()[0] ?? '')?.the ?? 'cameră');

	onMount(() => {
		if (roomCount() === 0) {
			void goto('/?s=c_rooms');
			return;
		}
		/* After the flush: the editor's own onMount has run and any saved model
		   has been restored, so this is the state "Înapoi" compares against. */
		void tick().then(() => {
			baseline = JSON.stringify(editor?.getModel() ?? null);
		});
	});

	function onchange(r: RoomSnapshot): void {
		wallCount = r.walls.length;
		if (unclosed && r.closed) unclosed = null;
	}

	/* The engine speaks Romanian itself (the RO table in engine.js), so its
	   "still missing" lines are shown exactly as they arrive. */

	async function save(): Promise<void> {
		const room = editor?.room();
		if (!room || saving) return;
		saving = true;
		try {
			const svg = roomToSvg(room, { widthPx: 1200 });
			const pngDataUrl = await svgToPngDataUrl(svg, 2);
			setDrawing({
				model: editor?.getModel(),
				room,
				svg,
				pngDataUrl,
				updatedAt: Date.now()
			});
			await goto('/planuri');
		} finally {
			saving = false;
		}
	}

	async function done(): Promise<void> {
		const room = editor?.room();
		if (!room) return;
		if (!room.closed) {
			unclosed = room.unanswered;
			return;
		}
		await save();
	}

	function back(): void {
		const now = JSON.stringify(editor?.getModel() ?? null);
		if (baseline !== null && now !== baseline) {
			askDiscard = true;
			return;
		}
		void goto('/planuri');
	}
</script>

<svelte:head><title>Desenează planul — Urban Moon</title></svelte:head>

<div class="screen">
	<header class="strip">
		<span class="wordmark">URBAN MOON</span>
		<h1>Desenează planul<span class="sep">·</span><em>{roomLabel}</em></h1>
	</header>

	<div class="editor-wrap">
		<FloorplanEditor bind:this={editor} {initialModel} {onchange} />
	</div>

	<div class="bottom">
		{#if unclosed}
			<div class="note" data-testid="note-unclosed" role="status">
				<p class="note-title">Conturul nu e închis încă.</p>
				{#if unclosed.length}
					<ul>
						{#each unclosed as item (item)}
							<li>{item}</li>
						{/each}
					</ul>
				{/if}
				<div class="note-actions">
					<button
						type="button"
						class="btn ghost"
						data-testid="btn-keep-drawing"
						onclick={() => (unclosed = null)}>Continuă desenul</button
					>
					<button type="button" class="btn" data-testid="btn-save-anyway" onclick={save}
						>Salvează oricum</button
					>
				</div>
			</div>
		{/if}

		{#if askDiscard}
			<div class="note" data-testid="note-discard" role="status">
				<p class="note-title">Renunți la modificări?</p>
				<div class="note-actions">
					<button type="button" class="btn ghost" onclick={() => (askDiscard = false)}
						>Rămân aici</button
					>
					<button
						type="button"
						class="btn"
						data-testid="btn-discard"
						onclick={() => goto('/planuri')}>Renunț</button
					>
				</div>
			</div>
		{/if}

		<footer class="nav">
			<button type="button" class="btn ghost" data-testid="btn-back" onclick={back}>Înapoi</button>
			<button
				type="button"
				class="btn"
				data-testid="btn-done"
				disabled={wallCount === 0 || saving}
				onclick={done}>Gata</button
			>
		</footer>
	</div>
</div>

<style>
	.screen {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--paper);
		overflow: hidden;
	}

	.strip {
		flex: 0 0 auto;
		display: flex;
		align-items: baseline;
		gap: 14px;
		flex-wrap: wrap;
		padding: 10px clamp(14px, 4vw, 28px);
		border-bottom: 1px solid var(--stone-soft);
	}
	.wordmark {
		font-family: var(--serif);
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		color: var(--ash);
	}
	.strip h1 {
		margin: 0;
		font-family: var(--serif);
		font-weight: 400;
		font-size: clamp(1rem, 2.6vw, 1.22rem);
		line-height: 1.2;
	}
	.strip h1 em {
		font-style: italic;
		color: var(--brass-deep);
	}
	.sep {
		color: var(--stone);
		margin: 0 0.4em;
	}

	.editor-wrap {
		flex: 1 1 auto;
		min-height: 0;
		position: relative;
	}

	.bottom {
		flex: 0 0 auto;
		padding: 0 clamp(14px, 4vw, 28px) env(safe-area-inset-bottom);
		border-top: 1px solid var(--stone-soft);
		background: var(--paper);
	}
	.bottom .nav {
		position: static;
		background: none;
		padding: 10px 0 14px;
	}

	.note {
		border: 1px solid var(--stone);
		background: var(--white);
		padding: 12px 14px;
		margin-top: 12px;
	}
	.note-title {
		margin: 0;
		font-weight: 600;
		font-size: 0.88rem;
	}
	.note ul {
		margin: 8px 0 0;
		padding-left: 18px;
		color: var(--smoke);
		font-size: 0.82rem;
	}
	.note-actions {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 10px;
	}
	.note-actions .btn {
		padding: 10px 22px;
	}
</style>
