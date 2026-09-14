<script lang="ts">
	import type { PlanFileMeta } from '$lib/types';

	interface Props {
		file: PlanFileMeta;
		getBlob: (id: string) => Promise<Blob | undefined>;
		onremove: (id: string) => void;
	}

	let { file, getBlob, onremove }: Props = $props();

	let url = $state<string | null>(null);

	/* HEIC does not decode in browsers: it shows its extension instead. */
	$effect(() => {
		const { id, name } = file;
		if (/\.(heic|heif)$/i.test(name)) return;
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
</script>

<div class="thumb" data-testid="photo" data-name={file.name}>
	{#if url}<img src={url} alt={file.name} />{:else}{file.name.split('.').pop()}{/if}
	<button type="button" class="x" aria-label="Șterge {file.name}" onclick={() => onremove(file.id)}>×</button>
</div>
