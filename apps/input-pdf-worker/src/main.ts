/* The worker process: the HTTP server, and locally a tick that stands in for Cloud Scheduler. */

import { configFromEnv } from './config';
import { log } from './log';
import { runOnce } from './run';
import { createWorkerServer } from './server';

const config = configFromEnv();
const { server, trigger } = createWorkerServer({
	log,
	run: () =>
		runOnce({ bucket: config.bucket, concurrency: config.concurrency, budgetMs: config.budgetMs, version: config.version })
});

server.listen(config.port, () => {
	log('INFO', 'worker_started', {
		port: config.port,
		bucket: config.bucket.name,
		concurrency: config.concurrency,
		tickSeconds: config.tickSeconds,
		version: config.version
	});
	if (config.tickSeconds) {
		/* A failed run is logged by the server; the next tick tries again. */
		const tick = () => void trigger()?.catch(() => {});
		tick();
		setInterval(tick, config.tickSeconds * 1000);
	}
});

/* Cloud Run sends SIGTERM before stopping an instance. A run cut short leaves its markers in
   pending/, so the next run starts those submissions again. */
process.on('SIGTERM', () => {
	log('INFO', 'worker_stopping');
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(0), 8000).unref();
});
