<script lang="ts">
	import { ico } from '$lib/questions/icons';

	interface PillOption {
		value: string;
		label: string;
		icon?: string;
	}

	interface Props {
		options: PillOption[];
		value?: string | string[] | null;
		multi?: boolean;
		onselect?: (value: string) => void;
	}

	let { options, value = null, multi = false, onselect }: Props = $props();

	const isOn = (v: string) =>
		multi ? Array.isArray(value) && value.includes(v) : value === v;
</script>

<div class="pills">
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="pill"
			class:on={isOn(opt.value)}
			aria-pressed={isOn(opt.value)}
			onclick={() => onselect?.(opt.value)}
		>
			{#if opt.icon}<span class="ico">{@html ico(opt.icon)}</span>{/if}
			<span>{opt.label}</span>
		</button>
	{/each}
</div>
