<script lang="ts">
	interface Chapter {
		id: string;
		label: string;
		state?: 'todo' | 'done' | 'now';
	}

	interface Props {
		chapters?: Chapter[];
	}

	let { chapters = [] }: Props = $props();
</script>

<!-- The step number and the done check are CSS pseudo-elements, so the label is the chip's only text. -->
<nav class="rail" aria-label="Capitole">
	{#each chapters as c (c.id)}
		<span
			class="chip"
			class:done={c.state === 'done'}
			class:now={c.state === 'now'}
			aria-current={c.state === 'now' ? 'step' : undefined}>{c.label}</span
		>
	{/each}
</nav>
