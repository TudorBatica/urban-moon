import { z } from 'zod';
import { ManifestSchema } from './manifest';

/** The manifest as JSON Schema (draft 2020-12), pretty-printed with tabs. */
export function manifestJsonSchema(): string {
	const schema = z.toJSONSchema(ManifestSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
	return JSON.stringify(
		{ $id: 'https://urban-moon.invalid/schemas/manifest.schema.json', title: 'manifest.json', ...schema },
		null,
		'\t'
	);
}
