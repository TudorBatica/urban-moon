<script lang="ts">
	import type { Drawing } from '$lib/types';
	import { pico } from './icons';

	interface Props {
		drawing: Drawing;
		onedit: () => void;
		ondelete: () => void;
	}

	let { drawing, onedit, ondelete }: Props = $props();
</script>

<div class="tile dcard" data-testid="drawing-card">
	<div class="thumb">
		{#if drawing.pngDataUrl}
			<img src={drawing.pngDataUrl} alt="Planul desenat de tine" />
		{:else}
			<span class="ico">{@html pico('pencil')}</span>
		{/if}
	</div>
	<div class="meta">
		<span class="lbl">Planul desenat de tine</span>
		<span class="hint2">
			{drawing.room?.closed ? 'Camera e închisă.' : 'Camera nu e închisă încă.'}
		</span>
	</div>
	<div class="acts">
		<button type="button" class="chipbtn" data-testid="drawing-edit" onclick={onedit}>
			Modifică
		</button>
		<button type="button" class="chipbtn" data-testid="drawing-delete" onclick={ondelete}>
			Șterge
		</button>
	</div>
</div>

<style>
	.dcard {
		gap: 10px;
		min-height: 148px;
	}
	.thumb {
		height: 84px;
		border-radius: 12px;
		background: var(--brass-tint);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		color: var(--brass-deep);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
	.thumb .ico {
		width: 48px;
		height: 48px;
	}
	.thumb .ico :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.lbl {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--ink);
	}
	.hint2 {
		font-size: 0.84rem;
		color: var(--smoke);
	}
	.acts {
		display: flex;
		gap: 8px;
		margin-top: auto;
	}
	.acts .chipbtn {
		min-height: 40px;
	}
</style>
