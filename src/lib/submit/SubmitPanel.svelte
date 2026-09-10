<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { answers } from '$lib/state/answers.svelte';
	import { getFileBlob, plans } from '$lib/state/plans.svelte';
	import { planSteps, runSubmission, type StepProgress, type StepState } from './submit';

	let { readback }: { readback: string } = $props();

	const CONSENT_TEXT =
		'Sunt de acord ca Urban Moon să prelucreze răspunsurile și planurile trimise pentru pregătirea proiectului meu.';

	let consent = $state(false);
	let sending = $state(false);
	let error = $state('');
	let steps = $state<StepProgress[]>([]);

	function stateLabel(s: StepState): string {
		if (s === 'done') return 'trimis';
		if (s === 'uploading') return 'se trimite';
		if (s === 'failed') return 'a eșuat';
		return 'în așteptare';
	}

	/** Dev hook for the e2e tests: ?scenario=fail makes the mock return 500. */
	function scenarioFromUrl(): string | undefined {
		if (typeof location === 'undefined') return undefined;
		return new URLSearchParams(location.search).get('scenario') === 'fail' ? 'fail' : undefined;
	}

	async function send(): Promise<void> {
		if (!consent || sending) return;
		sending = true;
		error = '';
		steps = planSteps(plans).map((label, index, all) => ({
			index,
			total: all.length,
			label,
			state: 'pending' as StepState
		}));

		const result = await runSubmission({
			answers,
			plans,
			readback,
			getBlob: getFileBlob,
			scenario: scenarioFromUrl(),
			onProgress: (p) => {
				const next = [...steps];
				next[p.index] = p;
				steps = next;
			}
		});

		sending = false;
		if (result.ok) {
			/* Let the last row paint as "trimis" before the page changes under it. */
			await tick();
			await goto('/multumim');
			return;
		}
		error = result.error ?? 'Nu am putut trimite răspunsurile. Încearcă din nou.';
	}
</script>

<div class="done-box" data-testid="submit-panel">
	<h3>Trimite răspunsurile</h3>
	<p>Le citim înainte de întâlnire, ca să venim cu propuneri, nu cu întrebări.</p>

	<label class="consent">
		<input type="checkbox" bind:checked={consent} disabled={sending} data-testid="submit-consent" />
		<span>{CONSENT_TEXT}</span>
	</label>

	{#if steps.length > 0}
		<div class="means" data-testid="submit-progress">
			<h4>Ce trimitem</h4>
			<ul>
				{#each steps as step (step.index)}
					<li class="step {step.state}" data-state={step.state}>
						{step.label} <small>— {stateLabel(step.state)}</small>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if error}
		<p class="err" data-testid="submit-error" role="alert">{error}</p>
	{/if}

	<div class="actions">
		<button
			class="btn"
			type="button"
			onclick={send}
			disabled={!consent || sending}
			data-testid="submit-button"
		>
			{#if sending}
				Se trimite…
			{:else if error}
				Încearcă din nou
			{:else}
				Trimite răspunsurile
			{/if}
		</button>
	</div>
</div>

<style>
	.consent {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: 20px;
		font-size: 0.92rem;
		line-height: 1.45;
		color: var(--ink);
		cursor: pointer;
		max-width: 56ch;
	}
	.consent input {
		margin-top: 3px;
		width: 18px;
		height: 18px;
		flex: 0 0 auto;
		accent-color: var(--ink);
	}
	.step small {
		color: var(--ash);
	}
	.step.done small {
		color: var(--brass-deep);
	}
	.step.failed small {
		color: var(--ink);
		font-weight: 600;
	}
	.err {
		margin-top: 16px;
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--ink);
		border-left: 2px solid var(--brass);
		padding-left: 12px;
	}
	.actions {
		margin-top: 22px;
	}
</style>
