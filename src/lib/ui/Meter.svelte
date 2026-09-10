<script lang="ts">
	interface Chapter {
		id: string;
		state?: 'todo' | 'done' | 'now';
	}

	interface Props {
		/** 0..1, within the current chapter */
		progress?: number;
		label?: string;
		/** one segment per chapter: done ones are full, the current one shows `progress` */
		chapters?: Chapter[];
	}

	let { progress = 0, label = '', chapters = [] }: Props = $props();

	const fill = (c: Chapter): number =>
		c.state === 'done' ? 1 : c.state === 'now' ? progress : 0;
</script>

<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)} aria-label={label || 'Progres'}>
	{#each chapters as c (c.id)}
		<div class="seg"><div class="seg-bar" style:width="{Math.round(fill(c) * 100)}%"></div></div>
	{/each}
</div>
<div class="meter-label">{label}</div>
