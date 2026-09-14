<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import { answers } from '$lib/state/answers.svelte';
	import { getFileBlob, plans } from '$lib/state/plans.svelte';
	import { getPhotoBlob, photos } from '$lib/state/photos.svelte';
	import { planSteps, runSubmission, type StepProgress, type StepState } from './submit';

	const CONSENT_TEXT =
		'Sunt de acord ca Urban Moon să prelucreze răspunsurile și planurile trimise pentru pregătirea proiectului meu.';

	let consent = $state(false);
	let sending = $state(false);
	let error = $state('');
	let steps = $state<StepProgress[]>([]);

	function stateLabel(s: StepProgress): string {
		if (s.state === 'done') return 'trimis';
		if (s.state === 'uploading') return s.percent > 0 && s.percent < 100 ? `${s.percent}%` : 'se trimite';
		if (s.state === 'failed') return 'a eșuat';
		return 'în așteptare';
	}

	async function send(): Promise<void> {
		if (!consent || sending) return;
		sending = true;
		error = '';
		steps = planSteps(plans, photos.list).map((label, index, all) => ({
			index,
			total: all.length,
			label,
			state: 'pending' as StepState,
			percent: 0
		}));

		const result = await runSubmission({
			answers,
			plans,
			getBlob: getFileBlob,
			photos: photos.list,
			getPhotoBlob,
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
			/* With a Calendly link configured, the meeting is booked before the thanks. */
			await goto(env.PUBLIC_CALENDLY_URL ? '/programare' : '/multumim');
			return;
		}
		error = result.error ?? 'Nu am putut trimite răspunsurile. Încearcă din nou.';
	}
</script>

<section class="submit" data-testid="submit-panel">
	<h2 class="q2">Trimite răspunsurile</h2>
	<p class="sub">Le citim înainte de întâlnire, ca să venim cu propuneri, nu cu întrebări.</p>

	<button
		type="button"
		class="check"
		class:on={consent}
		role="checkbox"
		aria-checked={consent}
		disabled={sending}
		data-testid="submit-consent"
		onclick={() => (consent = !consent)}
	>
		<span class="k" aria-hidden="true"
			><svg viewBox="0 0 24 24"><path pathLength="1" d="M7 12.5l3.5 3.5L17 9" /></svg></span
		>
		<span>{CONSENT_TEXT}</span>
	</button>

	{#if steps.length > 0}
		<ul class="steps" data-testid="submit-progress" aria-label="Ce trimitem">
			{#each steps as step (step.index)}
				<li class={step.state} data-state={step.state}>
					<span>{step.label}</span><small>{stateLabel(step)}</small>
				</li>
			{/each}
		</ul>
	{/if}

	{#if error}
		<p class="err" data-testid="submit-error" role="alert">{error}</p>
	{/if}

	<div class="actions">
		<button
			class="go"
			type="button"
			onclick={send}
			disabled={!consent || sending}
			aria-label={sending ? 'Se trimite…' : error ? 'Încearcă din nou' : 'Trimite răspunsurile'}
			title={sending ? 'Se trimite…' : error ? 'Încearcă din nou' : 'Trimite răspunsurile'}
			data-testid="submit-button"
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
		</button>
	</div>
</section>

<style>
	.submit {
		margin-top: 44px;
		padding-top: 6px;
		border-top: 1px solid var(--ink);
	}
	.steps {
		list-style: none;
		margin: 20px 0 0;
		padding: 0;
		font-size: 13.5px;
		border-top: 1px solid var(--hair);
	}
	.steps li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 7px 0;
		border-bottom: 1px solid var(--hair);
		color: var(--soft);
	}
	.steps span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.steps small {
		color: var(--grey);
		flex: none;
		font-variant-numeric: tabular-nums;
	}
	.steps .done small {
		color: var(--ink);
	}
	.steps .failed small {
		color: var(--ink);
		font-weight: 600;
	}
	.err {
		margin: 16px 0 0;
		font-size: 14px;
		color: var(--ink);
		border-left: 1px solid var(--ink);
		padding-left: 12px;
	}
	.actions {
		margin-top: 24px;
	}
</style>
