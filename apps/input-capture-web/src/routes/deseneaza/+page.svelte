<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import FloorplanEditor from '$lib/floorplan/FloorplanEditor.svelte';
	import Slides from '$lib/floorplan/Slides.svelte';
	import { DRAWING_SLIDES } from '$lib/floorplan/tutorialSlides';
	import { initialDevice, watchDevice, type Device } from '$lib/floorplan/device';
	import { hasSeen, localSeenStorage, markSeen } from '$lib/floorplan/seen';
	import { roomToSvg, svgToPngDataUrl } from '$lib/floorplan/export';
	import { saveEditedDrawing } from '$lib/floorplan/drawing';
	import { roomCount } from '$lib/state/answers.svelte';
	import { plans, setDrawing } from '$lib/state/plans.svelte';
	import GoBar from '$lib/ui/GoBar.svelte';
	import Note from '$lib/ui/Note.svelte';

	const SAVE_LABEL = 'Gata, salvează planul';

	let editor = $state<ReturnType<typeof FloorplanEditor> | null>(null);
	let empty = $state(true);
	let ask = $state<'done' | 'discard' | 'save-failed' | null>(null);
	let saving = $state(false);
	let slidesOpen = $state(false);
	let device = $state<Device>('desktop');

	/** The model as it was when the editor opened — "changed?" compares against it. */
	let baseline: string | null = null;

	const initialModel = plans.drawing?.model;

	onMount(() => {
		if (roomCount() === 0) {
			void goto('/?s=c_rooms');
			return;
		}
		device = initialDevice(window);
		const stopWatching = watchDevice(window, (d) => (device = d));
		/* The only help there is, shown by itself once per browser — over an
		   empty canvas and a restored drawing alike, since it changes neither. */
		slidesOpen = !hasSeen(localSeenStorage(), 'slides');
		/* After the flush: the editor's own onMount has run and any saved model
		   has been restored, so this is the state "Înapoi" compares against. */
		void tick().then(() => {
			baseline = JSON.stringify(editor?.getModel() ?? null);
			empty = editor?.isEmpty() ?? true;
		});
		return stopWatching;
	});

	/* The editor's keys stand down while a note or the slides are open. */
	$effect(() => {
		editor?.setKeysEnabled(ask === null && !slidesOpen);
	});

	function closeSlides(): void {
		slidesOpen = false;
		markSeen(localSeenStorage(), 'slides');
	}

	function onchange(): void {
		empty = editor?.isEmpty() ?? true;
	}

	function changed(): boolean {
		return baseline !== null && JSON.stringify(editor?.getModel() ?? null) !== baseline;
	}

	async function save(): Promise<void> {
		const room = editor?.room();
		if (!room || saving) return;
		saving = true;
		ask = null;
		editor?.setHintState('saving');
		try {
			await saveEditedDrawing(
				{ model: editor?.getModel(), room, previous: plans.drawing },
				{
					toSvg: (r) => roomToSvg(r, { widthPx: 1200 }),
					toPng: (svg) => svgToPngDataUrl(svg, 2),
					save: setDrawing,
					now: () => Date.now()
				}
			);
			await goto('/deseneaza/tavan');
		} catch {
			ask = 'save-failed';
		} finally {
			saving = false;
			editor?.setHintState(null);
		}
	}

	function back(): void {
		if (changed()) {
			ask = 'discard';
			return;
		}
		void goto('/planuri');
	}
</script>

<svelte:head><title>Desenează planul — Urban Moon</title></svelte:head>

<div class="screen">
	<header class="top">
		<a class="wm" href="/cuprins" aria-label="Urban Moon — cuprins">Urban Moon</a>
		<span class="ct">Plan</span>
	</header>

	<div class="canvas">
		<FloorplanEditor
			bind:this={editor}
			{initialModel}
			{onchange}
			onhelp={() => (slidesOpen = true)}
		/>

		{#if slidesOpen}
			<Slides slides={DRAWING_SLIDES} {device} onclose={closeSlides} />
		{/if}

		{#if ask === 'done'}
			<Note
				testid="note-done"
				scrim
				title="Gata cu planul?"
				lines={['Urmează înălțimea tavanului. Te poți întoarce oricând la plan.']}
				back={{ label: 'Mai am de lucru', testid: 'btn-keep-drawing', onclick: () => (ask = null) }}
				go={{ label: 'Continuă', testid: 'btn-continue', onclick: () => void save() }}
			/>
		{/if}
	</div>

	<div class="below">
		{#if ask === 'discard'}
			<Note
				testid="note-discard"
				title="Renunți la modificări?"
				back={{ label: 'Rămân aici', testid: 'btn-stay', onclick: () => (ask = null) }}
				go={{ label: 'Renunț', testid: 'btn-discard', onclick: () => void goto('/planuri') }}
			/>
		{/if}
		{#if ask === 'save-failed'}
			<Note
				testid="note-save-failed"
				title="Planul nu s-a salvat."
				lines={['Verifică legătura la internet și încearcă din nou.']}
				go={{ label: 'Încearcă din nou', testid: 'btn-retry-save', onclick: () => void save() }}
			/>
		{/if}

		<footer class="bot">
			<GoBar
				label={SAVE_LABEL}
				disabled={empty || saving}
				pressed={saving}
				onback={back}
				onnext={() => (ask = 'done')}
			/>
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
	.top {
		flex: none;
		padding: 18px 22px 12px;
	}
	.canvas {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
	}
	.below {
		flex: none;
		padding: 0 22px env(safe-area-inset-bottom);
	}
	.bot {
		position: static;
		background: var(--paper);
		padding: 12px 0 18px;
	}
	@media (min-width: 861px) {
		.top {
			padding: 20px 32px 14px;
		}
		.below {
			padding: 0 32px env(safe-area-inset-bottom);
		}
		.bot {
			padding: 12px 0 20px;
		}
	}
</style>
