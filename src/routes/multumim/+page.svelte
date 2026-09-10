<script lang="ts">
	import { goto } from '$app/navigation';
	import { resetAnswers } from '$lib/state/answers.svelte';
	import { clearCursor } from '$lib/state/cursor.svelte';
	import { resetPlans } from '$lib/state/plans.svelte';
	import { clearSubmissionState } from '$lib/submit/submit';

	async function startOver(): Promise<void> {
		resetAnswers();
		await resetPlans();
		/* The resume cursor and the attempt series belong to the finished project:
		   left behind, the next one resumes on an old screen and reuses its
		   submission id and its already-uploaded file urls. */
		clearCursor();
		clearSubmissionState();
		await goto('/');
	}
</script>

<svelte:head><title>Mulțumim · Urban Moon</title></svelte:head>

<div class="done-box" data-testid="thanks">
	<h3>Mulțumim.</h3>
	<p>
		Răspunsurile și planurile tale au ajuns la noi. Te contactăm pe emailul lăsat pentru pasul
		următor.
	</p>
	<div class="actions">
		<button class="btn ghost" type="button" onclick={startOver} data-testid="restart">
			Începe din nou
		</button>
	</div>
</div>

<style>
	.actions {
		margin-top: 18px;
	}
</style>
