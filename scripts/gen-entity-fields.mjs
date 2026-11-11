// Writes src/api/entity-fields.json (typed, writable fields per entity) from api/openapi.json.
// The client moves any other field into the row's `extra` object.
//   node scripts/gen-entity-fields.mjs          regenerate
//   node scripts/gen-entity-fields.mjs --check  exit 1 if the committed file is out of date
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ENTITIES } from '../src/api/client.js';

const specUrl = new URL('../api/openapi.json', import.meta.url);
const outUrl = new URL('../src/api/entity-fields.json', import.meta.url);

export function entityFields(spec) {
  const schemas = (spec.components && spec.components.schemas) || {};
  const out = {};
  for (const name of ENTITIES) {
    const create = schemas[`${name}Create`];
    if (!create) throw new Error(`api/openapi.json has no ${name}Create schema`);
    out[name] = Object.keys(create.properties || {}).sort();
  }
  return out;
}

const text = JSON.stringify(entityFields(JSON.parse(readFileSync(specUrl, 'utf8'))), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const current = existsSync(outUrl) ? readFileSync(outUrl, 'utf8') : '';
  if (current !== text) {
    console.error('src/api/entity-fields.json is out of date: run node scripts/gen-entity-fields.mjs');
    process.exit(1);
  }
  console.log('entity-fields.json is up to date.');
} else {
  writeFileSync(outUrl, text);
  console.log('Wrote src/api/entity-fields.json');
}
