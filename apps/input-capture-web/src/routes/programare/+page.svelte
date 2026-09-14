<script lang="ts">
	import { goto } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import { answers } from '$lib/state/answers.svelte';
	import { IMG } from '$lib/ui/images';
	import Frame from '$lib/ui/Frame.svelte';

	/* The booking step: Calendly inline, with the name and email already filled in.
	   Booking a slot moves on to the thanks; with no link configured there is nothing to book. */

	const base = env.PUBLIC_CALENDLY_URL ?? '';

	const src = $derived.by((): string => {
		if (!base) return '';
		const id = (answers.c_identity ?? {}) as { name?: string; email?: string };
		const u = new URL(base);
		if (id.name?.trim()) u.searchParams.set('name', id.name.trim());
		if (id.email?.trim()) u.searchParams.set('email', id.email.trim());
		u.searchParams.set('hide_gdpr_banner', '1');
		/* These two make Calendly post its events (calendly.event_scheduled) to this page. */
		u.searchParams.set('embed_domain', location.host);
		u.searchParams.set('embed_type', 'Inline');
		return u.toString();
	});

	$effect(() => {
		if (!base) void goto('/multumim', { replaceState: true });
	});

	$effect(() => {
		const onMessage = (e: MessageEvent) => {
			if (!/^https:\/\/([a-z0-9-]+\.)*calendly\.com$/.test(e.origin)) return;
			if ((e.data as { event?: string } | null)?.event === 'calendly.event_scheduled')
				void goto('/multumim');
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});
</script>

<svelte:head><title>Programează întâlnirea · Urban Moon</title></svelte:head>

<Frame img={IMG.booking} mode="dense" counter="Programare">
	<h1 class="q sm">Alege ziua și ora la care vrei să ne vedem.</h1>
	<p class="sub">
		Întâlnirea durează 30 de minute pentru o cameră (dacă ai mai multe camere va dura mai mult).
	</p>
	{#if src}
		<iframe class="cal" title="Programează întâlnirea" {src} data-testid="calendly"></iframe>
	{/if}
</Frame>

<style>
	.cal {
		display: block;
		width: 100%;
		height: min(720px, 78vh);
		min-height: 560px;
		border: 1px solid var(--hair);
		border-radius: var(--r);
		background: var(--white);
	}
</style>
