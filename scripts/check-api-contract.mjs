// Fails (exit 1) if a method+path or entity used by src/api/client.js is missing from api/openapi.json.
// Run: node scripts/check-api-contract.mjs
import { readFileSync } from 'node:fs';
import { ENTITIES } from '../src/api/client.js';

const spec = JSON.parse(readFileSync(new URL('../api/openapi.json', import.meta.url), 'utf8'));
const norm = (p) => p.replace(/\{[^}]+\}/g, '{}');
const have = new Set();
for (const [path, ops] of Object.entries(spec.paths || {})) {
  for (const method of Object.keys(ops)) have.add(`${method.toUpperCase()} ${norm(path)}`);
}

// The built API expands auth actions and entities into concrete paths.
const used = [
  ...['apple', 'google', 'refresh', 'logout'].map((a) => `POST /api/v1/auth/${a}`),
  'GET /api/v1/me', 'DELETE /api/v1/me', 'POST /api/v1/uploads', 'POST /api/v1/ai/{}',
  ...ENTITIES.flatMap((e) => [
    `GET /api/v1/entities/${e}`, `POST /api/v1/entities/${e}`,
    `PATCH /api/v1/entities/${e}/{}`, `DELETE /api/v1/entities/${e}/{}`,
  ]),
];
const integ = [...have].some((h) => h.startsWith('POST /api/v1/integrations/'));
if (!integ) used.push('POST /api/v1/integrations/{}/{}');
const problems = used.filter((u) => !have.has(u)).map((u) => `missing route: ${u}`);
const text = JSON.stringify(spec);
for (const e of ENTITIES) if (!text.includes(e)) problems.push(`missing entity: ${e}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`API contract OK: ${used.length} routes, ${ENTITIES.length} entities.`);
