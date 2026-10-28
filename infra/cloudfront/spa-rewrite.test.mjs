// Run with: node --test infra/cloudfront/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./spa-rewrite.js', import.meta.url), 'utf8');
const handler = new Function(`${source}; return handler;`)();
const rewrite = (uri) => handler({ request: { uri } }).uri;

test('/.well-known files are never rewritten', () => {
  assert.equal(rewrite('/.well-known/apple-app-site-association'), '/.well-known/apple-app-site-association');
  assert.equal(rewrite('/.well-known/assetlinks.json'), '/.well-known/assetlinks.json');
});

test('SPA routes go to index.html, assets and /app/* do not', () => {
  assert.equal(rewrite('/dexcom/callback'), '/index.html');
  assert.equal(rewrite('/CGMDashboard'), '/index.html');
  assert.equal(rewrite('/assets/index-abc.js'), '/assets/index-abc.js');
  assert.equal(rewrite('/app/apple-callback'), '/app/index.html');
  assert.equal(rewrite('/api/v1/me'), '/api/v1/me');
  assert.equal(rewrite('/sign-in'), '/index.html');
  assert.equal(rewrite('/fitbit/callback'), '/index.html');
});

test('www redirects 301 to the apex, keeping path and query', () => {
  const res = handler({ request: {
    uri: '/Meals', headers: { host: { value: 'www.diabeteasy.com' } }, querystring: { day: { value: '2' } },
  } });
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location.value, 'https://diabeteasy.com/Meals?day=2');
});
