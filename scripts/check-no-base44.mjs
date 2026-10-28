// Fails (exit 1) if the web app still references the Base44 SDK or src/api/base44Client.js exists.
// Run: node scripts/check-no-base44.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const hits = [];

function scan(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) scan(join(path, name));
  } else if (/\.(jsx?|mjs|tsx?|json|html)$/.test(path)) {
    readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('@base44') || line.includes('base44Client')) hits.push(`${path.replace(root, '')}:${i + 1}: ${line.trim()}`);
    });
  }
}

scan(join(root, 'src'));
for (const f of ['package.json', 'package-lock.json', 'index.html']) if (existsSync(join(root, f))) scan(join(root, f));
if (existsSync(join(root, 'src/api/base44Client.js'))) hits.push('src/api/base44Client.js still exists');

if (hits.length) {
  console.error(`Base44 references found:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('No Base44 SDK references in the web app.');
