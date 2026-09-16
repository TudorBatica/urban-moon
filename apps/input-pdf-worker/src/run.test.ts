import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BucketError } from '@urban-moon/bucket';
import { memoryBucket, type MemoryBucket } from '@urban-moon/bucket/memory';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Deliver } from './deliver';
import type { Logger, Severity } from './log';
import { runOnce, type RunOptions } from './run';

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.resolve('@urban-moon/domain-data/fixtures/submissions/full/manifest.json'))),
	'..'
);

const ID = 'sub-0000-aaaa';
const out = (id: string, name: string) => `submissions/${id}/output/${name}`;

/** A fixture submission committed into the bucket: its manifest, its uploads and the pending marker. */
async function commit(mem: MemoryBucket, id: string, fixture = 'minimal') {
	const dir = join(FIXTURES, fixture);
	for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const path = join(entry.parentPath, entry.name);
		const rel = relative(dir, path);
		if (rel === 'manifest.json' || rel.startsWith('uploads/'))
			await mem.bucket.put(`submissions/${id}/${rel}`, new Uint8Array(await readFile(path)), '');
	}
	await mem.bucket.put(`pending/${id}`, '', 'application/octet-stream');
}

function logs() {
	const lines: { severity: Severity; event: string; fields: Record<string, unknown> }[] = [];
	const log: Logger = (severity, event, fields = {}) => void lines.push({ severity, event, fields });
	return { log, lines, events: () => lines.map((l) => l.event), find: (event: string) => lines.find((l) => l.event === event) };
}

const run = (mem: MemoryBucket, l: ReturnType<typeof logs>, over: Partial<RunOptions> = {}) =>
	runOnce({ bucket: mem.bucket, log: l.log, version: 'test', retry: { sleep: async () => {} }, ...over });

const readJson = (mem: MemoryBucket, object: string) => JSON.parse(mem.text(object) ?? 'null');

describe('runOnce', () => {
	it('does nothing, and logs nothing, when nothing is pending', async () => {
		const mem = memoryBucket();
		const l = logs();
		expect(await run(mem, l)).toMatchObject({ processed: 0, failed: 0, skipped: 0, left: 0 });
		expect(mem.objects.size).toBe(0);
		expect(l.lines).toEqual([]);
	});

	it('builds a pending submission, stores the PDF and its reports, then removes the marker', async () => {
		const mem = memoryBucket();
		const l = logs();
		await commit(mem, ID, 'full');

		expect(await run(mem, l)).toMatchObject({ processed: 1, failed: 0, skipped: 0, left: 0 });

		const pdf = mem.objects.get(out(ID, 'raspunsuri.pdf'))!;
		expect(pdf.contentType).toBe('application/pdf');
		const build = readJson(mem, out(ID, 'build.json'));
		expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(build.pages);
		expect(build).toMatchObject({ version: 'test', bytes: pdf.bytes.length, warnings: [] });
		expect(build.sections.length).toBeGreaterThan(0);
		expect(readJson(mem, out(ID, 'delivery.json'))).toEqual({ hubspot: null });
		expect(readJson(mem, out(ID, 'done.json'))).toMatchObject({ version: 'test', pages: build.pages, bytes: pdf.bytes.length });
		expect(mem.objects.has(`pending/${ID}`)).toBe(false);
		expect(l.events()).toEqual(['job_started', 'pdf_generated', 'delivery_skipped', 'submission_delivered', 'run_summary']);
		expect(l.find('submission_delivered')).toMatchObject({ severity: 'NOTICE', fields: { submissionId: ID } });
	});

	it('skips a submission that is already done, and removes its marker', async () => {
		const mem = memoryBucket();
		const l = logs();
		await commit(mem, ID);
		await mem.bucket.put(out(ID, 'done.json'), '{}', 'application/json');

		expect(await run(mem, l)).toMatchObject({ processed: 0, skipped: 1 });
		expect(mem.objects.has(`pending/${ID}`)).toBe(false);
		expect(mem.objects.has(out(ID, 'raspunsuri.pdf'))).toBe(false);
		expect(l.events()).toEqual(['job_skipped_done', 'run_summary']);
	});

	it('moves an invalid manifest to failed/ with the reason', async () => {
		const mem = memoryBucket();
		const l = logs();
		await commit(mem, ID);
		await mem.bucket.put(`submissions/${ID}/manifest.json`, JSON.stringify({ schemaVersion: 1, client: {} }), 'application/json');

		expect(await run(mem, l)).toMatchObject({ processed: 0, failed: 1 });
		expect(readJson(mem, `failed/${ID}`)).toMatchObject({ stage: 'build', code: 'manifest_invalid', version: 'test' });
		expect(mem.objects.has(`pending/${ID}`)).toBe(false);
		expect(mem.objects.has(out(ID, 'done.json'))).toBe(false);
		expect(l.find('pdf_failed')).toMatchObject({ severity: 'ERROR', fields: { submissionId: ID, code: 'manifest_invalid' } });
	});

	it('fails with object_unreadable when a declared upload is missing', async () => {
		const mem = memoryBucket();
		await commit(mem, ID);
		await mem.bucket.delete(`submissions/${ID}/uploads/photo-spatiu-1.jpg`);

		expect(await run(mem, logs())).toMatchObject({ failed: 1 });
		expect(readJson(mem, `failed/${ID}`)).toMatchObject({ stage: 'build', code: 'object_unreadable' });
	});

	it('retries a transient bucket error and carries on', async () => {
		const mem = memoryBucket();
		await commit(mem, ID);
		let reads = 0;
		mem.fault = (op, object) =>
			op === 'read' && object.endsWith('manifest.json') && reads++ < 2 ? new BucketError('read', 503, 'unavailable') : undefined;

		expect(await run(mem, logs())).toMatchObject({ processed: 1, failed: 0 });
		expect(reads).toBe(3);
	});

	it('keeps the PDF but not done.json when delivery fails', async () => {
		const mem = memoryBucket();
		const l = logs();
		await commit(mem, ID);
		const deliver: Deliver = async () => {
			throw new Error('HubSpot is down');
		};

		expect(await run(mem, l, { deliver })).toMatchObject({ failed: 1 });
		expect(readJson(mem, `failed/${ID}`)).toMatchObject({ stage: 'deliver', code: 'unexpected', message: 'HubSpot is down' });
		expect(mem.objects.has(out(ID, 'raspunsuri.pdf'))).toBe(true);
		expect(mem.objects.has(out(ID, 'done.json'))).toBe(false);
		expect(l.find('delivery_failed')?.severity).toBe('ERROR');
	});

	it('removes failed/<id> when a re-run succeeds', async () => {
		const mem = memoryBucket();
		await commit(mem, ID);
		await mem.bucket.put(`failed/${ID}`, '{"stage":"build"}', 'application/json');

		expect(await run(mem, logs())).toMatchObject({ processed: 1 });
		expect(mem.objects.has(`failed/${ID}`)).toBe(false);
	});

	it('builds at most `concurrency` submissions at once, oldest marker first', async () => {
		let clock = Date.parse('2026-09-15T10:00:00Z');
		const mem = memoryBucket({ now: () => new Date(clock) });
		const ids = ['sub-0003-cccc', 'sub-0001-aaaa', 'sub-0002-bbbb'];
		for (const id of ids) {
			await commit(mem, id);
			clock += 1000;
		}
		let active = 0;
		let peak = 0;
		const started: string[] = [];
		const l = logs();
		const log: Logger = (severity, event, fields = {}) => {
			if (event === 'job_started') {
				started.push(String(fields.submissionId));
				peak = Math.max(peak, ++active);
			}
			if (event === 'submission_delivered') active--;
			l.log(severity, event, fields);
		};

		expect(await run(mem, l, { log, concurrency: 2, now: () => clock })).toMatchObject({ processed: 3, left: 0 });
		expect(peak).toBe(2);
		expect(started.slice(0, 2).sort()).toEqual(ids.slice(0, 2).sort());
		expect(started[2]).toBe(ids[2]);
	});

	it('starts nothing new once the time budget is spent; the rest stays pending', async () => {
		let clock = Date.parse('2026-09-15T10:00:00Z');
		const mem = memoryBucket({ now: () => new Date(clock) });
		await commit(mem, 'sub-0001-aaaa');
		clock += 1000;
		await commit(mem, 'sub-0002-bbbb');
		const deliver: Deliver = async () => {
			clock += 25 * 60_000;
			return { hubspot: null };
		};

		expect(await run(mem, logs(), { deliver, concurrency: 1, now: () => clock })).toMatchObject({ processed: 1, left: 1 });
		expect(mem.objects.has('pending/sub-0001-aaaa')).toBe(false);
		expect(mem.objects.has('pending/sub-0002-bbbb')).toBe(true);
	});

	it('logs submission_waiting for a marker older than 15 minutes', async () => {
		let clock = Date.parse('2026-09-15T10:00:00Z');
		const mem = memoryBucket({ now: () => new Date(clock) });
		const l = logs();
		await commit(mem, ID);
		clock += 16 * 60_000;

		await run(mem, l, { now: () => clock });
		expect(l.find('submission_waiting')).toMatchObject({ severity: 'ERROR', fields: { submissionId: ID, ageMin: 16 } });
	});

	it('ignores an object in pending/ that is not a submission id', async () => {
		const mem = memoryBucket();
		const l = logs();
		await mem.bucket.put('pending/../../etc', '', 'application/octet-stream');

		expect(await run(mem, l)).toMatchObject({ processed: 0, failed: 0, skipped: 0, left: 0 });
		expect(l.events()).toEqual(['marker_ignored']);
	});

	it('fails the whole run when pending/ cannot be listed', async () => {
		const mem = memoryBucket();
		mem.fault = (op) => (op === 'list' ? new BucketError('list', 403, 'forbidden') : undefined);
		await expect(run(mem, logs())).rejects.toMatchObject({ status: 403 });
	});
});
