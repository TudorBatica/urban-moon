<script lang="ts">
	import { getFileBlob } from '$lib/state/plans.svelte';
	import { roomOf } from '$lib/questions/rooms';
	import { ico } from '$lib/questions/icons';
	import type { PlanFileMeta, RoomId } from '$lib/types';
	import { iconForFile, pico } from './icons';

	interface Props {
		file: PlanFileMeta;
		rooms: RoomId[];
		showTags?: boolean;
		onremove: (id: string) => void;
		ontag: (id: string, roomId: RoomId | null) => void;
	}

	let { file, rooms, showTags = false, onremove, ontag }: Props = $props();

	/** Browsers cannot decode HEIC/HEIF, so those get an icon like PDF and DWG do. */
	function thumbable(name: string, type: string): boolean {
		const n = name.toLowerCase();
		if (/heic|heif/.test(type) || n.endsWith('.heic') || n.endsWith('.heif')) return false;
		if (type.startsWith('image/')) return true;
		return /\.(jpe?g|png|webp)$/.test(n);
	}

	let url = $state<string | null>(null);

	$effect(() => {
		const { id, name, type } = file;
		if (!thumbable(name, type)) return;
		let gone = false;
		let made: string | null = null;
		void getFileBlob(id).then((blob) => {
			if (gone || !blob) return;
			made = URL.createObjectURL(blob);
			url = made;
		});
		return () => {
			gone = true;
			url = null;
			if (made) URL.revokeObjectURL(made);
		};
	});

	/** Romanian decimal comma: "2,4 MB". */
	function fmtSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		const kb = bytes / 1024;
		if (kb < 1024) return `${Math.round(kb)} KB`;
		return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
	}
</script>

<div class="tile ftile" data-testid="file-tile" data-name={file.name}>
	<div class="thumb">
		{#if url}
			<img src={url} alt="" />
		{:else}
			<span class="ico">{@html pico(iconForFile(file.name, file.type))}</span>
		{/if}
	</div>

	<div class="meta">
		<span class="fname" title={file.name}>{file.name}</span>
		<span class="fsize" data-testid="file-size">{fmtSize(file.size)}</span>
	</div>

	<button
		type="button"
		class="rm"
		data-testid="remove"
		aria-label="Șterge {file.name}"
		onclick={() => onremove(file.id)}>×</button
	>

	{#if showTags}
		<div class="pills tags">
			{#each rooms as id (id)}
				{@const room = roomOf(id)}
				<button
					type="button"
					class="pill tag"
					class:on={file.roomId === id}
					data-testid="tag-{id}"
					aria-pressed={file.roomId === id}
					onclick={() => ontag(file.id, file.roomId === id ? null : id)}
				>
					<span class="ico">{@html ico(room?.icon ?? 'other')}</span>
					{room?.label ?? id}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.ftile {
		gap: 10px;
		padding-right: 46px;
	}
	.thumb {
		height: 92px;
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
		object-fit: cover;
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
		min-width: 0;
	}
	.fname {
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fsize {
		font-size: 0.8rem;
		color: var(--smoke);
	}
	.rm {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--smoke);
		font-size: 1.3rem;
		line-height: 1;
	}
	.rm:hover {
		color: var(--ink);
	}
	.tags {
		gap: 6px;
	}
	.tag {
		padding: 6px 12px 6px 8px;
		min-height: 36px;
		font-size: 0.78rem;
		gap: 6px;
	}
	.tag .ico {
		width: 18px;
		height: 18px;
	}
</style>
