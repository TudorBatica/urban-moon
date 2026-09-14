<script lang="ts">
	import type { Snippet } from 'svelte';
	import { crossfade } from './motion';
	import { unsplash, type ArtMode } from './images';
	import Roll from './Roll.svelte';

	interface Props {
		img?: string | null;
		/** a different photograph for phones */
		imgMobile?: string | null;
		mode?: ArtMode;
		/** the question counter, "4 / 16" */
		count?: { i: number; n: number } | null;
		/** shown in the counter's place when there is no count */
		counter?: string;
		bottom?: Snippet;
		children: Snippet;
	}

	let { img = null, imgMobile = null, mode = 'art', count = null, counter = '', bottom, children }: Props =
		$props();

	const shown = $derived(img && mode !== 'noart' ? img : null);
</script>

<div class="frame is-{shown ? mode : 'noart'}">
	{#if shown}
		<div class="art" aria-hidden="true">
			{#key `${shown}|${imgMobile ?? ''}`}
				<picture in:crossfade out:crossfade>
					{#if imgMobile}
						<source media="(max-width: 860px)" srcset={unsplash(imgMobile, 900)} />
					{/if}
					<img src={unsplash(shown, mode === 'opener' ? 1600 : 1200)} alt="" />
				</picture>
			{/key}
		</div>
	{/if}
	<div class="side">
		<header class="top">
			<a class="wm" href="/cuprins" aria-label="Urban Moon — cuprins">Urban Moon</a>
			<span class="ct">
				{#if count}<Roll value={count.i} />&nbsp;/ {count.n}{:else}{counter}{/if}
			</span>
		</header>
		<main class="mid">
			<div class="mid-in">{@render children()}</div>
		</main>
		{#if bottom}
			<footer class="bot">{@render bottom()}</footer>
		{/if}
	</div>
</div>
