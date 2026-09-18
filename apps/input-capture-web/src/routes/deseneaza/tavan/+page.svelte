<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { roomToSvg, svgToPngDataUrl } from '$lib/floorplan/export';
	import { saveCeilingHeight } from '$lib/floorplan/drawing';
	import { roomCount } from '$lib/state/answers.svelte';
	import { plans, setDrawing } from '$lib/state/plans.svelte';
	import Frame from '$lib/ui/Frame.svelte';
	import GoBar from '$lib/ui/GoBar.svelte';
	import Note from '$lib/ui/Note.svelte';

	/** Where the height leads next: what else the room has. */
	const AFTER = '/deseneaza/repere';

	let height = $state(String(plans.drawing?.room?.ceilingHeightCm ?? ''));
	let saving = $state(false);
	let failed = $state(false);
	let field = $state<HTMLInputElement | undefined>(undefined);

	const value = $derived(Number(height.replace(',', '.')));
	const ready = $derived(height.trim() !== '' && Number.isFinite(value) && value > 0);

	onMount(() => {
		if (roomCount() === 0) {
			void goto('/?s=c_rooms');
			return;
		}
		if (!plans.drawing) {
			void goto('/deseneaza');
			return;
		}
		/* The one screen whose keyboard may open by itself: it asks for a number
		   and nothing else. */
		field?.focus();
	});

	async function save(): Promise<void> {
		const drawing = plans.drawing;
		if (!drawing || !ready || saving) return;
		saving = true;
		failed = false;
		try {
			await saveCeilingHeight(drawing, Math.round(value), {
				toSvg: (r) => roomToSvg(r, { widthPx: 1200 }),
				toPng: (svg) => svgToPngDataUrl(svg, 2),
				save: setDrawing,
				now: () => Date.now()
			});
			await goto(AFTER);
		} catch {
			failed = true;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Înălțimea tavanului — Urban Moon</title></svelte:head>

<Frame mode="noart" counter="Plan">
	<h1 class="q">Cât de înalt e tavanul?</h1>
	<p class="sub">Măsoară de la podea până la tavan, în cameră.</p>

	<span class="fl" id="ceiling-label">Înălțime</span>
	<div class="line">
		<input
			class="val"
			bind:this={field}
			data-testid="ceiling-input"
			type="text"
			inputmode="numeric"
			aria-labelledby="ceiling-label"
			placeholder="—"
			value={height}
			oninput={(e) => (height = e.currentTarget.value)}
		/>
		<span class="u">cm</span>
	</div>
	<p class="tiny">De obicei între 250 și 300 cm.</p>

	{#if failed}
		<div class="fail">
			<Note
				testid="note-save-failed"
				title="Planul nu s-a salvat."
				lines={['Verifică legătura la internet și încearcă din nou.']}
				go={{ label: 'Încearcă din nou', testid: 'btn-retry-save', onclick: () => void save() }}
			/>
		</div>
	{/if}

	{#snippet bottom()}
		<GoBar
			label="Continuă"
			disabled={!ready || saving}
			onback={() => void goto('/deseneaza')}
			onnext={() => void save()}
		/>
	{/snippet}
</Frame>

<style>
	.fl {
		display: block;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: 8px;
		border-bottom: 1px solid var(--ink);
		padding-bottom: 8px;
		max-width: 220px;
	}
	.val {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0;
		font: 400 34px/1 var(--sans);
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.val:focus {
		outline: 0;
	}
	.val::placeholder {
		color: var(--place);
	}
	.u {
		font-size: 15px;
		color: var(--grey);
	}
	.tiny {
		font-size: 12.5px;
		color: var(--grey);
		margin: 10px 0 0;
	}
	.fail {
		margin-top: 22px;
	}
</style>
