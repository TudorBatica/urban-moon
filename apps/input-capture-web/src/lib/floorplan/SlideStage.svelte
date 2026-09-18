<script lang="ts">
	import type { Device } from './device';
	import { glyphSvg } from './glyphs';

	interface Props {
		/** the tool the slide is about */
		slideId: string;
		device: Device;
	}

	let { slideId, device }: Props = $props();
</script>

<div
	class="stage"
	data-testid="slide-stage"
	data-placeholder="true"
	data-device={device}
	aria-hidden="true"
>
	<span class="glyph">{@html glyphSvg(slideId)}</span>
</div>

<style>
	.stage {
		width: 100%;
		flex: none;
		background: var(--paper);
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	/* the proportions of the screen the finished stage plays on: taller than
	   it is wide on a phone, wider than tall on a desktop. On a short screen
	   the box gives way first, so the paragraph and the buttons still fit. */
	.stage[data-device='phone'] {
		height: min(400px, 48vh);
	}
	.stage[data-device='desktop'] {
		height: min(300px, 42vh);
	}
	.glyph {
		display: block;
		width: 48px;
		height: 48px;
		color: var(--ink);
	}
	.glyph :global(svg) {
		width: 100%;
		height: 100%;
		stroke: currentColor;
		stroke-width: 1.5;
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.glyph :global(svg path) {
		vector-effect: non-scaling-stroke;
	}
</style>
