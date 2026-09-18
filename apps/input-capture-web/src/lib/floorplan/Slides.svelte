<script lang="ts">
	import { onMount, tick } from 'svelte';
	import SlideStage from './SlideStage.svelte';
	import type { Device } from './device';
	import { BACK_LABEL, LAST_LABEL, SKIP_LABEL, slideView, type SlideDef } from './tutorialSlides';

	interface Props {
		slides: SlideDef[];
		device: Device;
		/** what the button on the last slide says: it names what happens next */
		lastLabel?: string;
		/** what stands where the position does, when a name says more than "1 / 1" */
		position?: string;
		/** the colour of the mark a landmark slide is about */
		markColour?: string;
		/** skipped, closed with Escape, or walked to the end — all one way out */
		onclose: () => void;
	}

	let {
		slides,
		device,
		lastLabel = LAST_LABEL,
		position,
		markColour,
		onclose
	}: Props = $props();

	let step = $state(0);
	let anchor = $state<HTMLDivElement | null>(null);
	let sheet = $state<HTMLDivElement | null>(null);
	let nextButton = $state<HTMLButtonElement | null>(null);
	/* On a phone the sheet runs from the top of whatever it covers to the
	   bottom of the screen; the element it is mounted in says where that is. */
	let sheetTop = $state(0);

	const view = $derived(slideView(slides, step, device, lastLabel));

	function measure(): void {
		if (anchor) sheetTop = Math.max(0, anchor.getBoundingClientRect().top);
	}

	function focusables(): HTMLElement[] {
		if (!sheet) return [];
		return Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled])'));
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		if (e.key !== 'Tab') return;
		const stops = focusables();
		if (stops.length === 0) return;
		const active = document.activeElement as HTMLElement | null;
		const inside = !!active && !!sheet && sheet.contains(active);
		const first = stops[0];
		const last = stops[stops.length - 1];
		if (e.shiftKey ? !inside || active === first : !inside || active === last) {
			e.preventDefault();
			(e.shiftKey ? last : first).focus();
		}
	}

	function back(): void {
		if (step > 0) step -= 1;
	}

	function next(): void {
		if (step >= slides.length - 1) {
			onclose();
			return;
		}
		step += 1;
	}

	onMount(() => {
		const returnTo = document.activeElement as HTMLElement | null;
		measure();
		void tick().then(() => nextButton?.focus());
		window.addEventListener('resize', measure);
		window.addEventListener('keydown', onKeydown, true);
		return () => {
			window.removeEventListener('resize', measure);
			window.removeEventListener('keydown', onKeydown, true);
			returnTo?.focus?.();
		};
	});
</script>

<div class="anchor" bind:this={anchor}>
	<div class="scrim"></div>
	<div
		class="sheet"
		data-testid="slides"
		data-device={device}
		style="--slides-top:{sheetTop}px"
		role="dialog"
		aria-modal="true"
		aria-labelledby="slides-title"
		bind:this={sheet}
	>
		<div class="ot">
			<span class="ct" data-testid="slides-position">{position ?? view.position}</span>
			<button type="button" class="lnk" data-testid="slides-skip" onclick={onclose}>
				{SKIP_LABEL}
			</button>
		</div>

		<SlideStage slideId={view.slide.id} {device} {markColour} />

		<h2 class="q2" id="slides-title">{view.slide.title}</h2>
		<p class="para">{view.paragraph}</p>

		<div class="ob">
			<span class="backslot">
				{#if view.showBack}
					<button type="button" class="lnk" data-testid="slides-back" onclick={back}>
						{BACK_LABEL}
					</button>
				{/if}
			</span>
			<span class="bars">
				{#each slides as s, i (s.id)}
					<i class:on={i === view.index}></i>
				{/each}
			</span>
			<button
				type="button"
				class="next"
				data-testid="slides-next"
				bind:this={nextButton}
				onclick={next}
			>
				{view.nextLabel}
			</button>
		</div>
	</div>
</div>

<style>
	.anchor {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(20, 20, 20, 0.18);
		pointer-events: auto;
		z-index: 40;
	}
	.sheet {
		position: fixed;
		background: var(--white);
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		z-index: 41;
	}
	.sheet[data-device='phone'] {
		left: 0;
		right: 0;
		bottom: 0;
		top: var(--slides-top);
		border-top: 1px solid var(--line-strong);
		padding: 14px 16px calc(16px + env(safe-area-inset-bottom));
	}
	.sheet[data-device='desktop'] {
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(640px, calc(100% - 48px));
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		padding: 18px 24px 20px;
	}
	.ot {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 10px;
		flex: none;
	}
	.ot .lnk {
		font-size: 13.5px;
		padding: 0;
	}
	.q2 {
		font-size: 24px;
		line-height: 1.15;
		margin: 14px 0 6px;
		flex: none;
	}
	.para {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--body);
		flex: none;
	}
	.sheet[data-device='phone'] .para {
		min-height: 76px;
	}
	.ob {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 12px;
		flex: none;
	}
	.ob .backslot {
		display: inline-flex;
		min-width: 52px;
	}
	.ob .lnk {
		padding: 0;
	}
	.bars {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.bars i {
		display: block;
		width: 12px;
		height: 2px;
		background: var(--line-strong);
		transition: width var(--fast) var(--ease);
	}
	.bars i.on {
		width: 24px;
		background: var(--ink);
	}
	.next {
		height: 44px;
		padding: 0 16px;
		border-radius: var(--r);
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--paper);
		font-size: 13.5px;
		white-space: nowrap;
		transition: transform var(--fast) var(--ease);
	}
	.next:active {
		transform: scale(0.97);
	}
</style>
