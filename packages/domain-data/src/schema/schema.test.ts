import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { S } from '../catalog/screens';
import { sniffContentType } from '../limits';
import { AnswersSchema, StrictAnswersSchema, answerKeys, screenAnswerSchema } from './answers';
import { manifestJsonSchema } from './json-schema';
import { parseManifest, type Manifest } from './manifest';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const submissionDir = (name: string) => join(PKG, 'fixtures/submissions', name);
const loadManifest = (name: string): Manifest =>
	JSON.parse(readFileSync(join(submissionDir(name), 'manifest.json'), 'utf8'));

const clone = <T>(v: T): T => structuredClone(v);
const issuesOf = (json: unknown): string[] => {
	const res = parseManifest(json);
	if (res.ok) return [];
	return res.unsupported ? ['unsupported'] : res.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('answers schema, derived from the catalog', () => {
	it('has exactly one key per question and follow-up the catalog can ask', () => {
		const expected = answerKeys().map((k) => k.key).sort();
		expect(Object.keys(AnswersSchema.shape).sort()).toEqual(expected);
		for (const s of S)
			if (s.kind !== 'card' && s.kind !== 'route') expect(expected).toContain(s.id);
	});

	it('has no answer schema for chapter openers and routes', () => {
		for (const s of S)
			if (s.kind === 'card' || s.kind === 'route') expect(screenAnswerSchema(s)).toBeNull();
	});

	it('accepts only the values a question offers', () => {
		expect(AnswersSchema.safeParse({ k1: 'gatim' }).success).toBe(true);
		expect(AnswersSchema.safeParse({ k1: 'uneori' }).success).toBe(false);
		expect(AnswersSchema.safeParse({ c_rooms: ['bucatarie', 'pivnita'] }).success).toBe(false);
		expect(AnswersSchema.safeParse({ k10_seats: 4 }).success).toBe(true);
		expect(AnswersSchema.safeParse({ k10_seats: 'patru' }).success).toBe(false);
	});

	it('strips answers to questions that no longer exist; the strict schema refuses them', () => {
		const old = { k1: 'gatim', x1_copil: { text: 'pat suprapus' } };
		expect(AnswersSchema.parse(old)).toEqual({ k1: 'gatim' });
		expect(StrictAnswersSchema.safeParse(old).success).toBe(false);
	});
});

describe.each(['minimal', 'full'])('fixture submission "%s"', (name) => {
	const manifest = loadManifest(name);

	it('is a valid manifest with no unknown answer keys', () => {
		expect(issuesOf(manifest)).toEqual([]);
		expect(StrictAnswersSchema.safeParse(manifest.answers).success).toBe(true);
	});

	it('has every declared file on disk, with the declared size and the real type', () => {
		for (const f of manifest.files) {
			const path = join(submissionDir(name), f.object);
			expect(existsSync(path), f.object).toBe(true);
			expect(statSync(path).size, f.object).toBe(f.size);
			expect(sniffContentType(readFileSync(path).subarray(0, 16)), f.object).toBe(f.contentType);
		}
		if (manifest.drawing) expect(existsSync(join(submissionDir(name), manifest.drawing.pngObject))).toBe(true);
	});
});

describe('the full fixture covers the catalog', () => {
	it('answers every question and follow-up the catalog can ask', () => {
		const answered = Object.keys(loadManifest('full').answers);
		const missing = answerKeys()
			.map((k) => k.key)
			.filter((k) => !answered.includes(k));
		/* A new question in the catalog lands here: add an answer for it to fixtures/submissions/full. */
		expect(missing).toEqual([]);
	});

	it('has a drawing, both photo groups, a PDF plan, an image plan and a PNG', () => {
		const m = loadManifest('full');
		expect(m.drawing).not.toBeNull();
		expect(new Set(m.files.map((f) => f.group))).toEqual(new Set([null, 'spatiu', 'mobilier']));
		expect(m.files.some((f) => f.kind === 'plan' && f.contentType === 'application/pdf')).toBe(true);
		expect(m.files.some((f) => f.kind === 'plan' && f.contentType === 'image/jpeg')).toBe(true);
		expect(m.files.some((f) => f.contentType === 'image/png')).toBe(true);
	});
});

describe('manifest rules', () => {
	const base = loadManifest('minimal');

	it('reports an unknown schema version apart from an invalid manifest', () => {
		expect(issuesOf({ ...clone(base), schemaVersion: 2 })).toEqual(['unsupported']);
		expect(issuesOf({ ...clone(base), client: { name: '', email: 'x' } }).length).toBeGreaterThan(0);
	});

	it('needs a group on photos, and a room on furniture photos', () => {
		const m = clone(base);
		m.files[1].group = null;
		expect(issuesOf(m)).toContain('files.1.group: a photo needs a group');
		const n = clone(base);
		n.files[1].group = 'mobilier';
		expect(issuesOf(n)).toContain('files.1.roomId: furniture photos need a room');
	});

	it('ties the object path to the file id and the sniffed type', () => {
		const m = clone(base);
		m.files[0].object = 'uploads/../../etc/passwd';
		expect(issuesOf(m).some((i) => i.startsWith('files.0.object'))).toBe(true);
		const n = clone(base);
		n.files[0].contentType = 'image/png';
		expect(issuesOf(n)).toContain(
			'files.0.object: object must be uploads/<fileId>.<extension of the sniffed type>'
		);
	});

	it('enforces the size limits', () => {
		const m = clone(base);
		m.files[1].size = 11 * 1024 * 1024;
		expect(issuesOf(m)).toContain('files.1.size: file over the size limit');
	});

	it('keeps rooms in step with the answers and with the files', () => {
		const m = clone(base);
		m.rooms = ['living'];
		expect(issuesOf(m)).toContain('rooms: rooms must match answers.c_rooms');
		const n = clone(base);
		n.files[0].roomId = 'baie';
		expect(issuesOf(n)).toContain('files.0.roomId: file of a room that was not picked');
	});

	it('requires a plan file or a drawing', () => {
		const m = clone(base);
		m.files = m.files.filter((f) => f.kind !== 'plan');
		expect(issuesOf(m)).toContain('files: a plan file or a drawing is required');
	});
});

describe('JSON Schema export', () => {
	it('matches the committed json-schema/manifest.schema.json (regenerate with npm run schema)', () => {
		const committed = readFileSync(join(PKG, 'json-schema/manifest.schema.json'), 'utf8');
		expect(committed).toBe(manifestJsonSchema() + '\n');
	});
});
