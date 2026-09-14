<script lang="ts">
	interface Props {
		title?: string;
		subtitle?: string;
		eyebrow?: string;
		/** the "Opțional" tag under the question */
		optional?: boolean;
		/** a smaller question; long ones get it on their own */
		small?: boolean;
	}

	let { title, subtitle, eyebrow, optional = false, small }: Props = $props();

	const sm = $derived(small ?? (title?.length ?? 0) > 58);

	/* "să-l", "s-o": a hyphenated word never breaks at its hyphen. */
	const words = $derived((title ?? '').split(' '));
</script>

{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
{#if title}
	<h1 class="q" class:sm style:margin-bottom={optional ? '12px' : null}>
		{#each words as w, i (i)}{#if i > 0}{' '}{/if}{#if w.includes('-')}<span class="nw">{w}</span>{:else}{w}{/if}{/each}
	</h1>
{/if}
{#if optional}<div class="tag">Opțional</div>{/if}
{#if subtitle}<p class="sub">{subtitle}</p>{/if}

<style>
	.nw {
		white-space: nowrap;
	}
</style>
