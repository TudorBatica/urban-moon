<script lang="ts">
	import { untrack } from 'svelte';
	import { SLOW } from './motion';

	interface Props {
		backLabel?: string;
		backHidden?: boolean;
		onback?: () => void;
		/** what the arrow does, for screen readers and the tooltip; the button shows only the arrow */
		label?: string;
		disabled?: boolean;
		/** no forward button at all */
		nextHidden?: boolean;
		/** held down while something the client asked for is under way */
		pressed?: boolean;
		/** the arrow bounces once, a second after the screen arrives (chapter openers) */
		bounce?: boolean;
		/** changes when the screen changes, so the bounce plays again on the next opener */
		bounceKey?: string;
		onnext?: () => void;
	}

	let {
		backLabel = 'Înapoi',
		backHidden = false,
		onback,
		label = 'Continuă',
		disabled = false,
		nextHidden = false,
		pressed = false,
		bounce = false,
		bounceKey = '',
		onnext
	}: Props = $props();

	/* The arrow is the second confirmation: grey while something waits, and a small
	   recoil the moment it becomes available. */
	let pop = $state(false);
	let wasDisabled = untrack(() => disabled);
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (wasDisabled && !disabled) {
			pop = true;
			clearTimeout(timer);
			timer = setTimeout(() => (pop = false), SLOW);
		}
		wasDisabled = disabled;
	});
</script>

<button
	type="button"
	class="lnk"
	class:hidden={backHidden}
	data-testid="btn-back"
	onclick={() => onback?.()}
>
	{backLabel}
</button>
{#if !nextHidden}
	<!-- The bounce lives on this wrapper, a second after the screen arrives: it only moves the
	     wrapper, so where animations are unsupported or reduced the button simply stays put. -->
	{#key bounceKey}
		<span class="go-b" class:bounce={bounce && !disabled}>
			<button
				type="button"
				class="go"
				class:pop
				class:press={pressed}
				{disabled}
				aria-label={label}
				title={label}
				data-testid="next"
				onclick={() => onnext?.()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
			</button>
		</span>
	{/key}
{/if}
