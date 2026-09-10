<script lang="ts">
	import type { CardScreen } from '$lib/questions/screens';
	import { roomOf } from '$lib/questions/rooms';
	import { answers } from '$lib/state/answers.svelte';
	import { chapterQuestionCount } from '$lib/flow/engine';
	import ChapterCard from '$lib/ui/ChapterCard.svelte';

	interface Props {
		screen: CardScreen;
	}

	let { screen }: Props = $props();

	const room = $derived(roomOf(screen.room ?? ''));
	const n = $derived(chapterQuestionCount(screen.chapter, answers));
</script>

{#if room}
	<ChapterCard
		lead={`${n} întrebări · ${screen.minutes ?? ''}`}
		title={`Întrebări despre ${room.about}`}
		blurb={screen.blurb}
		icon={room.icon}
	/>
{/if}
