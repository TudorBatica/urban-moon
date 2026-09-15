<script lang="ts">
	import { getFileBlob } from '$lib/state/plans.svelte';
	import type { PlanFileMeta } from '$lib/types';

	interface Props {
		file: PlanFileMeta;
		/** where the thumbnail's blob comes from; the plans store by default */
		getBlob?: (id: string) => Promise<Blob | undefined>;
		onremove: (id: string) => void;
	}

	let { file, getBlob = getFileBlob, onremove }: Props = $props();

	/** Browsers cannot decode HEIC/HEIF, so those show their extension like PDF and DWG do. */
	function thumbable(name: string, type: string): boolean {
		const n = name.toLowerCase();
		if (/heic|heif/.test(type) || n.endsWith('.heic') || n.endsWith('.heif')) return false;
		if (type.startsWith('image/')) return true;
		return /\.(jpe?g|png|webp)$/.test(n);
	}

	const ext = $derived((file.name.split('.').pop() ?? '').slice(0, 4));

	let url = $state<string | null>(null);

	$effect(() => {
		const { id, name, type } = file;
		if (!thumbable(name, type)) return;
		let gone = false;
		let made: string | null = null;
		void getBlob(id).then((blob) => {
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

<div class="file" data-testid="file-tile" data-name={file.name}>
	<span class="ic" aria-hidden="true">
		{#if url}<img src={url} alt="" />{:else}{ext}{/if}
	</span>
	<div class="fm">
		<span class="fname" title={file.name}>{file.name}</span>
		<small data-testid="file-size">{fmtSize(file.size)}</small>
	</div>
	<button
		type="button"
		class="x"
		data-testid="remove"
		aria-label="Șterge {file.name}"
		onclick={() => onremove(file.id)}>×</button
	>
</div>
