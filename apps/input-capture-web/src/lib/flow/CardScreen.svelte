<script lang="ts">
	import type { CardScreen } from '@urban-moon/domain-data';
	import { roomOf } from '@urban-moon/domain-data';
	import { answers } from '$lib/state/answers.svelte';
	import { chapterQuestionCount } from '$lib/flow/engine';

	interface Props {
		screen: CardScreen;
	}

	let { screen }: Props = $props();

	const room = $derived(roomOf(screen.room ?? ''));
	const n = $derived(chapterQuestionCount(screen.chapter, answers));

	/** "bucătăria" → "Bucătăria"; the other room keeps its own name */
	const title = $derived(
		!room ? '' : room.id === 'alta' ? room.label : room.the.charAt(0).toUpperCase() + room.the.slice(1)
	);
</script>

{#if room}
	<p class="eyebrow">{n} întrebări · {screen.minutes ?? ''}</p>
	<h1 class="q xl">{title}</h1>
	{#if screen.blurb}<p class="sub">{screen.blurb}</p>{/if}
{/if}
