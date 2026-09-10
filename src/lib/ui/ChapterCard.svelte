<script lang="ts">
	import { ico } from '$lib/questions/icons';

	interface Props {
		lead?: string;
		title: string;
		blurb?: string;
		icon?: string;
	}

	let { lead, title, blurb, icon }: Props = $props();
</script>

<section class="chapter">
	<div>
		{#if lead}<div class="lead">{lead}</div>{/if}
		<h2>{title}</h2>
		{#if blurb}<p>{blurb}</p>{/if}
	</div>
	{#if icon}<div class="art">{@html ico(icon)}</div>{/if}
</section>
