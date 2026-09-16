import { createServer, type Server } from 'node:http';
import type { Logger } from './log';
import type { RunSummary } from './run';

/* The worker's HTTP face (docs/arhitecture.md):
   POST /run     work through pending/ once and answer the summary. Cloud Scheduler calls it every
                 minute. A call while a run is in progress gets 429: Cloud Run's max-instances=1 and
                 concurrency=1 do the same in the cloud, this flag does it locally.
   GET /health   200 {ok: true}. Also /healthz, but not on Cloud Run: Google's frontend answers
                 that path on run.app with its own 404 before it reaches the container. */

export interface WorkerServer {
	server: Server;
	/** starts a run unless one is in progress; null when one is */
	trigger(): Promise<RunSummary> | null;
	busy(): boolean;
}

export function createWorkerServer({ run, log }: { run: () => Promise<RunSummary>; log: Logger }): WorkerServer {
	let running: Promise<RunSummary> | null = null;

	function trigger(): Promise<RunSummary> | null {
		if (running) return null;
		running = run()
			.catch((err: unknown) => {
				log('ERROR', 'run_failed', {
					message: err instanceof Error ? err.message : String(err),
					stack: err instanceof Error ? err.stack : undefined
				});
				throw err;
			})
			.finally(() => {
				running = null;
			});
		return running;
	}

	const server = createServer((req, res) => {
		const send = (status: number, body: unknown) => {
			res.writeHead(status, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(body));
		};
		const path = (req.url ?? '/').split('?')[0];

		if ((path === '/health' || path === '/healthz') && req.method === 'GET') return send(200, { ok: true });
		if (path !== '/run') return send(404, { error: 'not found' });
		if (req.method !== 'POST') return send(405, { error: 'POST /run' });

		const pending = trigger();
		if (!pending) return send(429, { error: 'a run is in progress' });
		pending.then(
			(summary) => send(200, summary),
			() => send(500, { error: 'the run failed; see the run_failed log' })
		);
	});

	return { server, trigger, busy: () => running !== null };
}
