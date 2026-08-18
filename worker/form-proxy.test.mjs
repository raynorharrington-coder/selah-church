import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

try {
  let forwarded;
  console.error = () => {};
  globalThis.fetch = async (url, options) => {
    forwarded = { url, options };
    return new Response(JSON.stringify({ ok: true, result: 'success' }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  const success = await worker.fetch(
    new Request('https://selah.example/api/forms', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: '{"formType":"contact"}',
    }),
    {},
    {},
  );
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { ok: true, result: 'success' });
  assert.equal(forwarded.options.method, 'POST');
  assert.equal(forwarded.options.body, '{"formType":"contact"}');
  assert.equal(forwarded.options.redirect, 'follow');

  const wrongMethod = await worker.fetch(new Request('https://selah.example/api/forms'), {}, {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');

  const tooLarge = await worker.fetch(
    new Request('https://selah.example/api/forms', {
      method: 'POST',
      body: 'x'.repeat(12 * 1024 + 1),
    }),
    {},
    {},
  );
  assert.equal(tooLarge.status, 413);

  globalThis.fetch = async () => {
    throw new Error('simulated upstream outage');
  };
  const unavailable = await worker.fetch(
    new Request('https://selah.example/api/forms', {
      method: 'POST',
      body: '{"formType":"contact"}',
    }),
    {},
    {},
  );
  assert.equal(unavailable.status, 502);
  assert.equal((await unavailable.json()).ok, false);

  console.log('form proxy tests passed');
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
}
