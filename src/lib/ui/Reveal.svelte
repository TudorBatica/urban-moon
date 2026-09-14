<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		/** answered: the drawn edge settles into a plain ink outline */
		done?: boolean;
		children: Snippet;
	}

	let { open, done = false, children }: Props = $props();
</script>

<!-- Opens by height, the content rises, then an ink line draws round the edge and breathes
     until the question is answered. -->
<div class="reveal" class:open inert={!open}>
	<div>
		<div class="rcard" class:await={!done} class:done>
			<svg class="edge" preserveAspectRatio="none" aria-hidden="true">
				<rect class="base" x=".5" y=".5" width="99.6%" height="99%" pathLength="1" />
				<rect class="draw" x=".5" y=".5" width="99.6%" height="99%" pathLength="1" />
			</svg>
			{@render children()}
		</div>
	</div>
</div>
