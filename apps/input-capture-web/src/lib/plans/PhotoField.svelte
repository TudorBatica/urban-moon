<script lang="ts">
	import {
		MAX_PHOTOS,
		PHOTO_ACCEPT,
		addPhotos,
		getPhotoBlob,
		photos,
		photosOf,
		removePhoto
	} from '$lib/state/photos.svelte';
	import type { PhotoMeta, RoomId } from '$lib/types';
	import Dropzone from './Dropzone.svelte';
	import Rejections from './Rejections.svelte';
	import Thumb from './Thumb.svelte';

	interface Props {
		group: PhotoMeta['group'];
		roomId: RoomId | null;
	}

	let { group, roomId }: Props = $props();

	const mine = $derived(photosOf(photos.list, group, roomId));
	let rejected = $state<{ name: string; reason: string }[]>([]);

	async function onfiles(files: File[]): Promise<void> {
		rejected = (await addPhotos(files, group, roomId)).rejected;
	}
</script>

<div data-testid="photos-{group}">
	<Dropzone
		slim
		label="Încarcă pozele"
		hint="JPG, PNG · până la 10 MB · {mine.length} din {MAX_PHOTOS}"
		accept={PHOTO_ACCEPT}
		disabled={mine.length >= MAX_PHOTOS}
		{onfiles}
	/>
	<Rejections list={rejected} ondismiss={() => (rejected = [])} />
	{#if mine.length > 0}
		<div class="thumbs">
			{#each mine as f (f.id)}
				<Thumb file={f} getBlob={getPhotoBlob} onremove={(id) => void removePhoto(id)} />
			{/each}
		</div>
	{/if}
</div>
