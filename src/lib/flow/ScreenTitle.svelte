<script lang="ts">
	interface Props {
		title?: string;
		subtitle?: string;
	}

	let { title, subtitle }: Props = $props();
</script>

{#if title}<h1 class="q-title">{title}</h1>{/if}
{#if subtitle}<p class="q-sub">{subtitle}</p>{/if}
