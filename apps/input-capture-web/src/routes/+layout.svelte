<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Every page draws its own frame (photograph, counter, bottom bar); the floorplan editor
     is full screen. -->
{@render children()}
