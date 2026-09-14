<script lang="ts">
	interface Props {
		list: { name: string; reason: string }[];
		ondismiss: () => void;
	}

	let { list, ondismiss }: Props = $props();
</script>

{#if list.length > 0}
	<div class="rejects" data-testid="rejections" role="alert">
		<ul>
			{#each list as r, i (`${r.name}-${i}`)}
				<li data-testid="rejection"><strong>{r.name}</strong> — {r.reason}</li>
			{/each}
		</ul>
		<button type="button" class="lnk" data-testid="rejections-dismiss" onclick={ondismiss}>
			Am înțeles
		</button>
	</div>
{/if}
