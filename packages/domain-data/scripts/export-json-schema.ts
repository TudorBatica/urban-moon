/* Writes json-schema/manifest.schema.json from the zod manifest schema, for documentation and for
   anything that is not TypeScript. The cross-field checks (superRefine) are not representable in
   JSON Schema; the zod schema stays the authority. Run: npm run schema -w @urban-moon/domain-data */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestJsonSchema } from '../src/schema/json-schema';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../json-schema/manifest.schema.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, manifestJsonSchema() + '\n');
console.log(`wrote ${out}`);
