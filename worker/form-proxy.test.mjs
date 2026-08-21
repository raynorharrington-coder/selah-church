import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

try {
  let resendRequest;
  console.error = () => {};
  console.warn = () => {};
  globalThis.fetch = async (url, options) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return new Response(JSON.stringify({
        success: true,
        action: 'selah-form',
        hostname: 'selahchurchfxbg.com',
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (url === 'https://api.resend.com/emails') {
      resendRequest = { url, options };
      return new Response(JSON.stringify({ id: 'email_123' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const env = { TURNSTILE_SECRET: 'turnstile-secret', RESEND_API_KEY: 're_test' };

  const success = await worker.fetch(
    new Request('https://selah.example/api/forms', {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=utf-8', 'cf-connecting-ip': '203.0.113.1' },
      body: JSON.stringify({
        formType: 'contact',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        message: 'I would like to visit.',
        'cf-turnstile-response': 'turnstile-token',
      }),
    }),
    env,
    {},
  );
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { ok: true, result: 'success' });
  assert.equal(resendRequest.options.method, 'POST');
  assert.equal(resendRequest.options.headers.authorization, 'Bearer re_test');
  assert.deepEqual(JSON.parse(resendRequest.options.body), {
    from: 'Selah Church Website <website@selahchurchfxbg.com>',
    to: ['info@selahchurchfxbg.com'],
    subject: 'New Visit/Contact Message — Ada Lovelace',
    text: 'Name: Ada Lovelace\nEmail: ada@example.com\n\nMessage:\nI would like to visit.\n\n---\nSubmitted through the contact form on selahchurchfxbg.com.',
    reply_to: 'ada@example.com',
  });

  const wrongMethod = await worker.fetch(new Request('https://selah.example/api/forms'), {}, {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');

  const wwwRedirect = await worker.fetch(
    new Request('https://www.selahchurchfxbg.com/contact.html?ref=legacy'),
    {},
    {},
  );
  assert.equal(wwwRedirect.status, 301);
  assert.equal(wwwRedirect.headers.get('location'), 'https://selahchurchfxbg.com/contact.html?ref=legacy');

  const workersDevRedirect = await worker.fetch(
    new Request('https://selah-church.thyratechllc.workers.dev/api/sermons'),
    {},
    {},
  );
  assert.equal(workersDevRedirect.status, 301);
  assert.equal(workersDevRedirect.headers.get('location'), 'https://selahchurchfxbg.com/api/sermons');

  const missingSecrets = await worker.fetch(
    new Request('https://selah.example/api/forms', { method: 'POST', body: '{}' }),
    {},
    {},
  );
  assert.equal(missingSecrets.status, 503);

  const tooLarge = await worker.fetch(
    new Request('https://selah.example/api/forms', {
      method: 'POST',
      body: 'x'.repeat(24 * 1024 + 1),
    }),
    env,
    {},
  );
  assert.equal(tooLarge.status, 413);

  globalThis.fetch = async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return new Response(JSON.stringify({ success: false }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const rejected = await worker.fetch(
    new Request('https://selah.example/api/forms', {
      method: 'POST',
      body: JSON.stringify({ formType: 'contact', 'cf-turnstile-response': 'turnstile-token' }),
    }),
    env,
    {},
  );
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).code, 'verification_failed');

  globalThis.fetch = async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      return new Response(JSON.stringify({
        success: true,
        action: 'selah-form',
        hostname: 'selahchurchfxbg.com',
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (url === 'https://api.resend.com/emails') return new Response('unavailable', { status: 503 });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const unavailable = await worker.fetch(
    new Request('https://selah.example/api/forms', {
      method: 'POST',
      body: JSON.stringify({
        formType: 'prayer',
        name: 'Ada Lovelace',
        request: 'Please pray for us.',
        'cf-turnstile-response': 'turnstile-token',
      }),
    }),
    env,
    {},
  );
  assert.equal(unavailable.status, 502);
  assert.equal((await unavailable.json()).ok, false);

  console.log('form handler tests passed');
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}
