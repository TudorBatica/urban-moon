import { memoryBucket } from '@urban-moon/bucket/memory';
import { describe, expect, it } from 'vitest';
import { reprocess } from './reprocess';

const ID = 'sub-0000-aaaa';

async function committed() {
	const mem = memoryBucket();
	await mem.bucket.put(`submissions/${ID}/manifest.json`, '{}', 'application/json');
	return mem;
}

describe('reprocess', () => {
	it('moves failed/<id> back to pending/', async () => {
		const mem = await committed();
		await mem.bucket.put(`failed/${ID}`, '{"stage":"build"}', 'application/json');

		expect(await reprocess(mem.bucket, ID)).toEqual({ hadFailed: true, wasPending: false, clearedOutput: 0, done: false });
		expect(mem.text(`pending/${ID}`)).toBe('');
		expect(mem.objects.has(`failed/${ID}`)).toBe(false);
	});

	it('keeps output/ without --force, and says the run will skip a done submission', async () => {
		const mem = await committed();
		await mem.bucket.put(`submissions/${ID}/output/done.json`, '{}', 'application/json');

		expect(await reprocess(mem.bucket, ID)).toMatchObject({ clearedOutput: 0, done: true });
		expect(mem.objects.has(`submissions/${ID}/output/done.json`)).toBe(true);
	});

	it('deletes output/ with --force, and nothing else', async () => {
		const mem = await committed();
		await mem.bucket.put(`submissions/${ID}/uploads/a.pdf`, '%PDF', 'application/pdf');
		await mem.bucket.put(`submissions/${ID}/output/raspunsuri.pdf`, '%PDF', 'application/pdf');
		await mem.bucket.put(`submissions/${ID}/output/done.json`, '{}', 'application/json');

		expect(await reprocess(mem.bucket, ID, { force: true })).toMatchObject({ clearedOutput: 2, done: false });
		expect([...mem.objects.keys()].sort()).toEqual([
			`pending/${ID}`,
			`submissions/${ID}/manifest.json`,
			`submissions/${ID}/uploads/a.pdf`
		]);
	});

	it('refuses an id with nothing committed, and a malformed id', async () => {
		const mem = memoryBucket();
		await expect(reprocess(mem.bucket, ID)).rejects.toThrow(/manifest\.json does not exist/);
		await expect(reprocess(mem.bucket, '../x')).rejects.toThrow(/not a submission id/);
		expect(mem.objects.size).toBe(0);
	});
});
