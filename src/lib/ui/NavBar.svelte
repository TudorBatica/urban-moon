<script lang="ts">
	import { ARROW } from '$lib/questions/icons';

	interface Props {
		backLabel?: string;
		nextLabel?: string;
		backHidden?: boolean;
		nextDisabled?: boolean;
		onback?: () => void;
		onnext?: () => void;
	}

	let {
		backLabel = 'Înapoi',
		nextLabel = 'Continuă',
		backHidden = false,
		nextDisabled = false,
		onback,
		onnext
	}: Props = $props();
</script>

<footer class="nav">
	<button type="button" class="btn ghost" class:hidden={backHidden} onclick={() => onback?.()}>
		{backLabel}
	</button>
	<button type="button" class="btn" disabled={nextDisabled} onclick={() => onnext?.()}>
		<span>{nextLabel}</span>
		<span class="arrow">{@html ARROW}</span>
	</button>
</footer>
