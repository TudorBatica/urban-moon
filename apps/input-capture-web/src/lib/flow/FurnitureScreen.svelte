<script lang="ts">
	import { tick } from 'svelte';
	import type { FurnitureItem, FurnitureScreen } from '@urban-moon/domain-data';
	import { answers, setAnswer } from '$lib/state/answers.svelte';
	import PhotoField from '$lib/plans/PhotoField.svelte';
	import Field from '$lib/ui/Field.svelte';
	import ScreenTitle from './ScreenTitle.svelte';

	interface Props {
		screen: FurnitureScreen;
	}

	let { screen }: Props = $props();

	const blank = (): FurnitureItem => ({ name: '', length: '', width: '' });

	/* Always at least one row to write in; an untouched row is not an answer. */
	const items = $derived.by((): FurnitureItem[] => {
		const v = (answers[screen.id] as { items?: FurnitureItem[] } | undefined)?.items;
		return v?.length ? v : [blank()];
	});

	let names: (HTMLInputElement | undefined)[] = $state([]);

	function write(next: FurnitureItem[]) {
		const touched = next.some((x) => x.name || x.length || x.width);
		setAnswer(screen.id, touched || next.length > 1 ? { items: next } : undefined);
	}

	function update(i: number, key: keyof FurnitureItem, value: string) {
		write(items.map((x, j) => (j === i ? { ...x, [key]: value } : x)));
	}

	async function add() {
		const next = [...items, blank()];
		setAnswer(screen.id, { items: next });
		await tick();
		names[next.length - 1]?.focus();
	}

	function remove(i: number) {
		const next = items.filter((_, j) => j !== i);
		write(next.length ? next : [blank()]);
	}
</script>

<ScreenTitle title={screen.title} subtitle={screen.subtitle} />

<div class="items">
	{#each items as item, i (i)}
		<div class="item">
			<Field
				label="Obiect"
				placeholder={screen.example}
				value={item.name}
				bind:ref={names[i]}
				oninput={(v) => update(i, 'name', v)}
			/>
			<div class="dims">
				<span class="field-l">Lungime × lățime</span>
				<div class="dims-row">
					<input
						class="in num"
						type="text"
						inputmode="decimal"
						aria-label="Lungime, în cm"
						placeholder={String(screen.exampleSize[0])}
						value={item.length}
						oninput={(e) => update(i, 'length', e.currentTarget.value)}
					/>
					<span class="x">×</span>
					<input
						class="in num"
						type="text"
						inputmode="decimal"
						aria-label="Lățime, în cm"
						placeholder={String(screen.exampleSize[1])}
						value={item.width}
						oninput={(e) => update(i, 'width', e.currentTarget.value)}
					/>
					<span class="unit">cm</span>
				</div>
			</div>
			<button
				type="button"
				class="rm"
				class:hidden={items.length === 1 && !item.name && !item.length && !item.width}
				aria-label="Șterge obiectul"
				onclick={() => remove(i)}>×</button
			>
		</div>
	{/each}
</div>

<button type="button" class="add" onclick={add}>+ Adaugă obiect</button>

<p class="fl">Ai imagini cu obiectele pe care vrei să le păstrezi? · opțional</p>
<PhotoField group="mobilier" roomId={screen.room} />

<style>
	.items {
		border-top: 1px solid var(--hair);
	}
	.item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 36px;
		gap: 18px;
		align-items: end;
		padding: 14px 0 12px;
		border-bottom: 1px solid var(--hair);
	}
	.item :global(.field) {
		margin: 0;
	}
	.dims-row {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	.num {
		width: 4.4rem;
		text-align: center;
	}
	.x,
	.unit {
		color: var(--grey);
		font-size: 14px;
		padding-bottom: 12px;
	}
	.rm {
		width: 36px;
		height: 36px;
		background: none;
		border: 0;
		color: var(--grey);
		font-size: 20px;
		line-height: 1;
	}
	.rm:hover {
		color: var(--ink);
	}
	.add {
		margin-top: 12px;
		background: none;
		border: 0;
		padding: 6px 0;
		font-size: 14px;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 4px;
		text-decoration-thickness: 1px;
	}
	@media (max-width: 860px) {
		.item {
			grid-template-columns: minmax(0, 1fr) 36px;
			gap: 12px;
		}
		.dims {
			grid-row: 2;
			grid-column: 1 / -1;
		}
	}
</style>
