#!/usr/bin/env node
/* Look into the local bucket (the emulator from compose.yaml).

   npm run bucket:ls                  every submission, with its file count and whether it is committed
   npm run bucket:files -- <id>       every object under submissions/<id>/, with size, type and date
   npm run bucket:pull -- <id>        download one into out/bucket/<id>/, the layout the PDF worker reads:
                                      npm run pdf:build -w @urban-moon/input-pdf-worker -- --dir out/bucket/<id>
*/
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const host = (process.env.STORAGE_EMULATOR_HOST || 'http://localhost:4443').replace(/\/+$/, '');
const base = /^https?:\/\//.test(host) ? host : `http://${host}`;
const bucket = process.env.GCS_BUCKET || 'um-submissions';
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');

async function list(prefix) {
	const items = [];
	let pageToken = '';
	do {
		const url = `${base}/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}${pageToken ? `&pageToken=${pageToken}` : ''}`;
		const res = await fetch(url).catch((err) => {
			throw new Error(`cannot reach the emulator at ${base} (npm run deps:up?): ${err.message}`);
		});
		if (!res.ok) throw new Error(`list ${res.status}: ${await res.text()}`);
		const body = await res.json();
		items.push(...(body.items ?? []));
		pageToken = body.nextPageToken ?? '';
	} while (pageToken);
	return items;
}

async function ls() {
	const marked = async (prefix) => new Set((await list(prefix)).map((o) => o.name.slice(prefix.length)));
	const [pending, failed] = await Promise.all([marked('pending/'), marked('failed/')]);
	const bySubmission = new Map();
	for (const o of await list('submissions/')) {
		const [, id, ...rest] = o.name.split('/');
		const path = rest.join('/');
		const s = bySubmission.get(id) ?? { files: 0, bytes: 0, committed: false, done: false, updated: '' };
		if (path === 'manifest.json') s.committed = true;
		else if (path === 'output/done.json') s.done = true;
		else if (path.startsWith('uploads/')) {
			s.files++;
			s.bytes += Number(o.size);
		}
		if (o.updated > s.updated) s.updated = o.updated;
		bySubmission.set(id, s);
	}
	if (!bySubmission.size) return console.log(`bucket ${bucket} has no submissions yet`);
	/* failed/ and done win; pending means committed and waiting; committed alone means no marker */
	const state = (id, s) =>
		failed.has(id) ? 'failed' : s.done ? 'done' : pending.has(id) ? 'pending' : s.committed ? 'committed' : 'uploading';
	const rows = [...bySubmission].sort((a, b) => a[1].updated.localeCompare(b[1].updated));
	for (const [id, s] of rows)
		console.log(
			`${state(id, s).padEnd(9)}  ${id}  ${s.files} files · ${(s.bytes / 1024).toFixed(0)} KB · ${s.updated}`
		);
}

async function files(id) {
	if (!id) throw new Error('usage: npm run bucket:files -- <submissionId>');
	const prefix = `submissions/${id}/`;
	const objects = await list(prefix);
	if (!objects.length) throw new Error(`no objects under ${prefix}`);
	const rows = objects.map((o) => [o.name.slice(prefix.length), `${o.size} B`, o.contentType || '-', o.updated]);
	const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
	console.log(`${bucket}/${prefix}`);
	for (const r of rows) console.log('  ' + r.map((c, i) => (i === 1 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  '));
	console.log(`  ${objects.length} objects`);
}

async function pull(id) {
	if (!id) throw new Error('usage: npm run bucket:pull -- <submissionId>');
	const prefix = `submissions/${id}/`;
	const objects = await list(prefix);
	if (!objects.length) throw new Error(`no objects under ${prefix}`);
	const out = join(root, 'out', 'bucket', id);
	for (const o of objects) {
		const res = await fetch(`${base}/storage/v1/b/${bucket}/o/${encodeURIComponent(o.name)}?alt=media`);
		if (!res.ok) throw new Error(`download ${o.name}: ${res.status}`);
		const file = join(out, o.name.slice(prefix.length));
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, Buffer.from(await res.arrayBuffer()));
		console.log(`  ${o.name.slice(prefix.length)}  ${o.size} B`);
	}
	console.log(`→ ${out}`);
	if (!objects.some((o) => o.name === `${prefix}manifest.json`)) console.log('  (not committed: no manifest.json)');
}

const [cmd, arg] = process.argv.slice(2);
try {
	if (cmd === 'ls') await ls();
	else if (cmd === 'files') await files(arg);
	else if (cmd === 'pull') await pull(arg);
	else throw new Error('usage: bucket.mjs ls | files <submissionId> | pull <submissionId>');
} catch (err) {
	console.error(err.message);
	process.exit(1);
}
