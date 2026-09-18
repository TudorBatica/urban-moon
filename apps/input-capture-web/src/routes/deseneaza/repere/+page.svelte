<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { LANDMARK_KINDS } from '@urban-moon/domain-data';
	import { roomCount } from '$lib/state/answers.svelte';
	import { plans } from '$lib/state/plans.svelte';
	import { lineIcon } from '$lib/ui/lineIcons';
	import Frame from '$lib/ui/Frame.svelte';
	import GoBar from '$lib/ui/GoBar.svelte';

	/** Where the landmarks lead next; nothing here has to be answered to get there. */
	const AFTER = '/planuri';

	onMount(() => {
		if (roomCount() === 0) {
			void goto('/?s=c_rooms');
			return;
		}
		if (!plans.drawing) void goto('/deseneaza');
	});

	/* How many of each kind are on the plan: the saved drawing is the only truth. */
	const counts = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const m of plans.drawing?.room?.landmarks ?? []) out[m.kind] = (out[m.kind] ?? 0) + 1;
		return out;
	});
</script>

<svelte:head><title>Ce mai e prin cameră — Urban Moon</title></svelte:head>

<Frame mode="noart" counter="Plan">
	<h1 class="q sm">Ce mai e prin cameră?</h1>
	<p class="sub">Alege pe rând și arată pe plan unde se află. Sari peste ce nu ai.</p>

	<div class="cards" role="group" aria-label="Ce mai e prin cameră">
		{#each LANDMARK_KINDS as k (k.kind)}
			{@const count = counts[k.kind] ?? 0}
			<button
				type="button"
				class="card"
				class:on={count > 0}
				data-testid="landmark-card-{k.kind}"
				data-count={count}
				aria-pressed={count > 0}
				onclick={() => void goto(`/deseneaza/repere/${k.kind}`)}
			>
				{#if count > 1}<span class="n">{count}</span>{/if}
				{@html lineIcon(k.kind)}
				<span class="l">{k.label}</span>
			</button>
		{/each}
	</div>

	{#snippet bottom()}
		<GoBar
			label="Continuă"
			onback={() => void goto('/deseneaza/tavan')}
			onnext={() => void goto(AFTER)}
		/>
	{/snippet}
</Frame>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-top: 22px;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		aspect-ratio: 1 / 1.05;
		padding: 8px;
		background: var(--white);
		border: 1px solid var(--hair);
		border-radius: var(--r);
		color: var(--ink);
		text-decoration: none;
		transition:
			border-color var(--fast) var(--ease),
			box-shadow var(--base) var(--ease);
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	/* The drawing is ink on paper like every other object card: a landmark's
	   colour is met on the plan, never here. */
	.card :global(svg) {
		width: 52%;
		height: auto;
	}
	.card .l {
		font-size: 12.5px;
		line-height: 1.2;
		text-align: center;
	}
	.card.on {
		border-color: var(--ink);
		box-shadow: 0 2px 0 rgba(20, 20, 20, 0.06);
	}
	.card.on .l {
		font-weight: 500;
	}
	.card.on::after {
		content: '';
		position: absolute;
		right: 7px;
		top: 7px;
		width: 17px;
		height: 17px;
		border-radius: 3px;
		background: var(--ink)
			url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M4.5 8.5l2.5 2.5 4.5-5' fill='none' stroke='white' stroke-width='1.8'/></svg>")
			center/12px no-repeat;
	}
	.card .n {
		position: absolute;
		left: 7px;
		top: 7px;
		font-size: 11px;
		color: var(--grey);
		font-variant-numeric: tabular-nums;
	}
	@media (min-width: 861px) {
		.cards {
			grid-template-columns: repeat(4, 1fr);
			gap: 12px;
		}
		.card :global(svg) {
			width: 46%;
		}
		.card .l {
			font-size: 14px;
		}
	}
</style>
