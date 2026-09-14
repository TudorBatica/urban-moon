<script lang="ts">
	import type { Drawing } from '$lib/types';

	interface Props {
		drawing: Drawing;
		onedit: () => void;
		ondelete: () => void;
	}

	let { drawing, onedit, ondelete }: Props = $props();
</script>

<div class="drop dcard" data-testid="drawing-card">
	{#if drawing.pngDataUrl}
		<img src={drawing.pngDataUrl} alt="Planul desenat de tine" />
	{/if}
	<span class="big">Planul desenat de tine</span>
	<span class="sm">{drawing.room?.closed ? 'Camera e închisă.' : 'Camera nu e închisă încă.'}</span>
	<span class="acts2">
		<button type="button" class="lnk" data-testid="drawing-edit" onclick={onedit}>Modifică</button>
		<button type="button" class="lnk" data-testid="drawing-delete" onclick={ondelete}>Șterge</button>
	</span>
</div>

<style>
	.dcard {
		cursor: default;
		border-color: var(--ink);
		gap: 2px;
	}
	.dcard img {
		width: 100%;
		max-height: 110px;
		object-fit: contain;
		margin-bottom: 8px;
	}
	.acts2 {
		display: flex;
		gap: 18px;
		margin-top: 6px;
	}
	.acts2 .lnk {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 4px;
	}
</style>
