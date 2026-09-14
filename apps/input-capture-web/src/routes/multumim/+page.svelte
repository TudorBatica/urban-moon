<script lang="ts">
	import { goto } from '$app/navigation';
	import { resetAnswers } from '$lib/state/answers.svelte';
	import { clearCursor } from '$lib/state/cursor.svelte';
	import { resetPlans } from '$lib/state/plans.svelte';
	import { resetPhotos } from '$lib/state/photos.svelte';
	import { clearSubmissionState } from '$lib/submit/submit';
	import { IMG } from '$lib/ui/images';
	import Frame from '$lib/ui/Frame.svelte';

	async function startOver(): Promise<void> {
		resetAnswers();
		await resetPlans();
		await resetPhotos();
		/* The resume cursor and the attempt series belong to the finished project:
		   left behind, the next one resumes on an old screen and reuses its
		   submission id and its already-uploaded file urls. */
		clearCursor();
		clearSubmissionState();
		await goto('/');
	}
</script>

<svelte:head><title>Mulțumim · Urban Moon</title></svelte:head>

<Frame img={IMG.booking} counter="Gata">
	<div data-testid="thanks">
		<p class="eyebrow">Mulțumim</p>
		<h1 class="q">Ai încărcat cu succes planul și preferințele tale.</h1>
		<p class="sub">Dacă lipsește ceva vei fi contactat pe mail.</p>
		<button class="lnk" type="button" onclick={startOver} data-testid="restart">Începe din nou</button>
	</div>
</Frame>
