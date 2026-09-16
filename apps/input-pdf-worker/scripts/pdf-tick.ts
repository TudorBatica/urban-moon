/* Call the worker's POST /run once, as Cloud Scheduler does every minute.
   npm run pdf:tick          (WORKER_URL defaults to http://localhost:3001) */

export {};

const url = `${(process.env.WORKER_URL ?? 'http://localhost:3001').replace(/\/+$/, '')}/run`;

try {
	const res = await fetch(url, { method: 'POST' });
	console.log(`${res.status} ${await res.text()}`);
	if (!res.ok) process.exitCode = 1;
} catch (err) {
	console.error(`cannot reach the worker at ${url} (npm run worker:dev?): ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
}
