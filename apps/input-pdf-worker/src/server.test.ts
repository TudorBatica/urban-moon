import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from './log';
import type { RunSummary } from './run';
import { createWorkerServer, type WorkerServer } from './server';

const summary: RunSummary = { processed: 1, failed: 0, skipped: 0, left: 0, durationMs: 5 };

let open: WorkerServer | null = null;

async function start(run: () => Promise<RunSummary>) {
	const events: string[] = [];
	const log: Logger = (_severity, event) => void events.push(event);
	const worker = createWorkerServer({ run, log });
	open = worker;
	await new Promise<void>((resolve) => worker.server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${(worker.server.address() as AddressInfo).port}`;
	return { worker, base, events };
}

afterEach(async () => {
	if (!open) return;
	open.server.closeAllConnections();
	await new Promise((resolve) => open!.server.close(resolve));
	open = null;
});

describe('worker server', () => {
	it('answers the health check', async () => {
		const { base } = await start(async () => summary);
		for (const path of ['/health', '/healthz']) {
			const res = await fetch(`${base}${path}`);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ ok: true });
		}
	});

	it('runs once on POST /run and answers the summary', async () => {
		const run = vi.fn(async () => summary);
		const { base } = await start(run);
		const res = await fetch(`${base}/run`, { method: 'POST' });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(summary);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('refuses a second run while one is in progress', async () => {
		let finish!: (s: RunSummary) => void;
		const run = vi.fn(() => new Promise<RunSummary>((resolve) => (finish = resolve)));
		const { worker, base } = await start(run);

		const first = fetch(`${base}/run`, { method: 'POST' });
		await vi.waitFor(() => expect(worker.busy()).toBe(true));
		const second = await fetch(`${base}/run`, { method: 'POST' });
		expect(second.status).toBe(429);

		finish(summary);
		expect((await first).status).toBe(200);
		expect(worker.busy()).toBe(false);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('answers 500 and logs run_failed when the run throws', async () => {
		const { base, events, worker } = await start(async () => {
			throw new Error('bucket unreachable');
		});
		const res = await fetch(`${base}/run`, { method: 'POST' });
		expect(res.status).toBe(500);
		expect(events).toEqual(['run_failed']);
		expect(worker.busy()).toBe(false);
	});

	it('only accepts POST on /run, and nothing else', async () => {
		const { base } = await start(async () => summary);
		expect((await fetch(`${base}/run`)).status).toBe(405);
		expect((await fetch(`${base}/nope`)).status).toBe(404);
	});
});
