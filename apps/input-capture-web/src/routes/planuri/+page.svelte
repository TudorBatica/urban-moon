<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { answers, pickedRooms, setAnswer } from '$lib/state/answers.svelte';
	import {
		addFiles,
		isPlansComplete,
		maxFiles,
		plans,
		removeFile,
		setDrawing
	} from '$lib/state/plans.svelte';
	import { roomOf } from '@urban-moon/domain-data';
	import { PLAN_MEASURED_KEY, PLAN_MODIFY_KEY } from '@urban-moon/domain-data';
	import { IMG } from '$lib/ui/images';
	import { BASE, SLOW, ease, ms } from '$lib/ui/motion';
	import Frame from '$lib/ui/Frame.svelte';
	import GoBar from '$lib/ui/GoBar.svelte';
	import Dropzone from '$lib/plans/Dropzone.svelte';
	import FileTile from '$lib/plans/FileTile.svelte';
	import DrawingCard from '$lib/plans/DrawingCard.svelte';
	import PhotoField from '$lib/plans/PhotoField.svelte';
	import Rejections from '$lib/plans/Rejections.svelte';

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

	/* Nothing can be drawn or uploaded before the space is measured. The tick draws first;
	   a moment later the disclaimer folds away and the actions wake up. */
	const measured = $derived(answers[PLAN_MEASURED_KEY] === true);
	let ticking = $state(false);

	function tick(): void {
		if (measured || ticking) return;
		ticking = true;
		setTimeout(() => setAnswer(PLAN_MEASURED_KEY, true), ms(BASE + 120));
	}

	let rejected = $state<{ name: string; reason: string }[]>([]);

	async function onfiles(files: File[]): Promise<void> {
		if (!measured) return;
		const res = await addFiles(files, count);
		rejected = res.rejected;
	}

	function onremove(id: string): void {
		void removeFile(id);
	}

	function deleteDrawing(): void {
		if (!confirm('Ștergi planul desenat?')) return;
		setDrawing(null);
	}
</script>

<svelte:head><title>{title} · Urban Moon</title></svelte:head>

<Frame img={IMG.kitchenBW} mode="dense" counter="Planuri">
	<h1 class="q">{title}</h1>

	{#if !measured}
		<div class="gate" out:slide={{ duration: ms(SLOW), easing: ease }}>
			<div class="note">
				<p><strong>Înainte de plan, măsoară spațiul.</strong></p>
				<p>
					Dacă dimensiunile nu sunt cele reale, planul nu poate fi executat. Nu lucrăm pe cadastru:
					de multe ori nu are toate cotele.
				</p>
			</div>
			<button
				type="button"
				class="opt measure"
				class:on={ticking}
				role="checkbox"
				aria-checked={ticking}
				data-testid="measured"
				onclick={tick}
			>
				<span class="k" aria-hidden="true"
					><svg viewBox="0 0 24 24"><path pathLength="1" d="M7 12.5l3.5 3.5L17 9" /></svg></span
				>
				<span class="t">Am măsurat spațiul<small>Lungimi, înălțime, uși și ferestre, cu ruleta.</small></span>
			</button>
		</div>
	{:else}
		<p class="sub done" in:fade={{ duration: ms(BASE), delay: ms(SLOW), easing: ease }}>
			Măsurat de tine. Mergem mai departe.
		</p>
	{/if}

	<fieldset class="work" class:locked={!measured} disabled={!measured} inert={!measured}>
		<legend class="sr">Planul și pozele spațiului</legend>
		<Dropzone
			label={single ? 'Încarcă schița' : 'Încarcă schițele'}
			hint="PDF, JPG, PNG · PDF până la 25 MB, poze până la 10 MB · {plans.files.length} din {max} fișiere"
			disabled={full || !measured}
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
						class="drop"
						data-testid="tile-draw"
						disabled={!measured}
						onclick={() => goto('/deseneaza')}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 7l3 3" /></svg>
						<span class="big"><u>Desenează planul</u><br />după dimensiunile reale</span>
						<span class="sm">Câteva minute, direct aici</span>
					</button>
				{/if}
			{/if}
		</Dropzone>

		<Rejections list={rejected} ondismiss={() => (rejected = [])} />

		{#if plans.files.length > 0}
			<div class="files" data-testid="counter">
				{#each plans.files as file (file.id)}
					<FileTile {file} {onremove} />
				{/each}
			</div>
		{/if}

		<h2 class="q2">Ai imagini cu spațiul tău?</h2>
		<PhotoField group="spatiu" roomId={null} />
	</fieldset>

	{#snippet bottom()}
		<GoBar
			onback={() => goto(`/?s=${PLAN_MODIFY_KEY}`)}
			disabled={!measured || !isPlansComplete(plans)}
			onnext={() => goto('/?s=c_stage')}
		/>
	{/snippet}
</Frame>

<style>
	.gate .note {
		margin-top: 0;
	}
	.measure {
		margin-bottom: 18px;
		padding: 16px 18px;
		border-color: var(--line-strong);
	}
	.measure .t {
		font-size: 16.5px;
	}
	.done {
		margin: -6px 0 22px;
	}
	.work {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
		transition: opacity var(--slow) var(--ease);
	}
	.work.locked {
		opacity: 0.4;
	}
</style>
