<script lang="ts">
	interface Action {
		label: string;
		testid?: string;
		onclick: () => void;
	}

	interface Props {
		title: string;
		/** the details, one short line each */
		lines?: string[];
		/** the safe choice, in outline */
		back?: Action;
		/** the way on, filled ink */
		go?: Action;
		/** over a light scrim, for a question that must be answered before going on */
		scrim?: boolean;
		testid?: string;
	}

	let { title, lines = [], back, go, scrim = false, testid }: Props = $props();
</script>

{#if scrim}
	<div class="scrim"></div>
{/if}
<div class="plate" class:over={scrim} data-testid={testid} role="status">
	<p class="t">{title}</p>
	{#each lines as line (line)}
		<p class="d">{line}</p>
	{/each}
	{#if back || go}
		<div class="na">
			{#if back}
				<button type="button" class="nb" data-testid={back.testid} onclick={back.onclick}>
					{back.label}
				</button>
			{/if}
			{#if go}
				<button type="button" class="nb fill" data-testid={go.testid} onclick={go.onclick}>
					{go.label}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		background: rgba(20, 20, 20, 0.18);
		z-index: 30;
	}
	.plate {
		background: var(--white);
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		padding: 16px 18px;
		z-index: 31;
	}
	.plate.over {
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: 14px;
	}
	.t {
		margin: 0 0 6px;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
	}
	.d {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--body);
	}
	.d + .d {
		margin-top: 4px;
	}
	.na {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		margin-top: 14px;
	}
	.nb {
		height: 44px;
		padding: 0 16px;
		border-radius: var(--r);
		border: 1px solid var(--line-strong);
		background: var(--paper);
		font-size: 13.5px;
		color: var(--ink);
		white-space: nowrap;
		transition: transform var(--fast) var(--ease);
	}
	.nb:active {
		transform: scale(0.97);
	}
	.nb.fill {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
	}
	@media (min-width: 861px) {
		.plate.over {
			left: 50%;
			right: auto;
			width: 440px;
			transform: translateX(-50%);
		}
	}
</style>
