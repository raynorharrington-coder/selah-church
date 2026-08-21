/**
 * Selah Church Worker
 *
 * Three jobs:
 *  1. Serve the static site (everything not matched below falls through to
 *     the ASSETS binding, i.e. the existing HTML/CSS/JS files).
 *  2. Once a day (see wrangler.jsonc "triggers.crons"), pull the latest
 *     videos from each sermon-series YouTube playlist and cache the result
 *     in KV, so sermons.html never has to call YouTube's API itself.
 *  3. Receive the contact and prayer forms, validate Turnstile, and deliver
 *     the notification through Resend from Selah's verified domain.
 *
 * Nothing here needs Luke's involvement day to day — this file only needs
 * to be touched again if a new sermon series starts (add its playlist to
 * SERIES_PLAYLISTS below), a secret rotates, or a form destination changes.
 */

// Fill in every active/past series here, mapping to its real YouTube
// playlist. Find a playlist ID from its URL: youtube.com/playlist?list=THIS_PART
// See STEP-BY-STEP.md "Finding your series playlist IDs" for the full walkthrough.
const SERIES_PLAYLISTS = {
  'just-jesus': { label: 'Just Jesus', playlistId: 'PLt96azQnTvhPF-AZniCPNKNOQCmqiU9DX' },
  'design': { label: 'Design: A Life of Order', playlistId: 'PLt96azQnTvhNP3ttRC1deYuMKIa26r2aE' },
  'blueprints': { label: 'The Blueprints', playlistId: 'PLt96azQnTvhNy60w-KaFymL7hMpOu9G_n' },
  'acts': { label: 'Acts', playlistId: 'PLt96azQnTvhNDWypyOF_JctaEywikXjis' },
  'galatians': { label: 'Galatians', playlistId: 'PLt96azQnTvhOZObk6O4lmtTOon38wI-lA' },
  // slug kept as 'corinthians' (not '1-corinthians') to match the existing
  // data-series="corinthians" filter tab already in sermons.html
  'corinthians': { label: '1 Corinthians', playlistId: 'PLt96azQnTvhM5jHVu-53egOj0SMZJ2Kem' },
};

const KV_KEY = 'sermons-data';

// YouTube caps playlistItems at 50 per request, so this is a page size, not a
// ceiling — fetchPlaylistVideos follows nextPageToken up to MAX_PER_SERIES.
// It used to be a hard 25 with no paging, which silently truncated Acts: the
// API returns playlist items in playlist position order (oldest first), so
// the videos being dropped were the *newest* ones in the series.
const PAGE_SIZE = 50;
const MAX_PER_SERIES = 200;

// Anything a playlist doesn't cover. Messages only make it into the site if
// someone remembers to add them to a series playlist on YouTube, and in
// practice that gets missed — as of 2026-08-07 three July messages were live
// on the channel but in no playlist, so the site never showed them. This
// sweeps the channel's own uploads as a backstop.
const CHANNEL_HANDLE = '@SelahChurchfxbg';
const UNLISTED_SERIES = { slug: 'recent', label: 'Recent Messages' };
const UPLOADS_SCAN_LIMIT = 50;

// The uploads feed is everything the channel posts, not just Sunday messages:
// Shorts, baby dedications, baptism testimonies, announcements. Duration
// separates them cleanly and without guessing at titles — sampled 2026-08-07,
// messages ran 26–83 minutes and everything else came in under 4m30.
const MIN_MESSAGE_SECONDS = 15 * 60;

// Form delivery is intentionally same-origin: the browser sends to this
// Worker, which validates Turnstile and sends through Resend. The secrets
// never reach the browser or this public repository.
const FORM_MAX_BODY_BYTES = 24 * 1024;
const TURNSTILE_ACTION = 'selah-form';
const TURNSTILE_HOSTNAMES = new Set([
  'selahchurchfxbg.com',
  'www.selahchurchfxbg.com',
  'selah-church.thyratechllc.workers.dev',
]);
const FORM_FROM = 'Selah Church Website <website@selahchurchfxbg.com>';
const FORM_NOTIFY_EMAIL = 'info@selahchurchfxbg.com';
const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Cadre Small Groups now has one clear destination. Keep links shared
    // before the navigation change from landing on superseded group details.
    if (url.pathname === '/small-groups' || url.pathname === '/small-groups.html') {
      return Response.redirect(new URL('/cadre.html', url.origin), 301);
    }

    if (url.pathname === '/api/sermons') {
      return handleSermonsApi(request, env);
    }

    if (url.pathname === '/api/forms') {
      return handleFormsApi(request, env);
    }

    // Lets `?resync=1` (with the same secret the cron uses) trigger an
    // on-demand refresh without waiting for the next scheduled run —
    // handy right after publishing a new message.
    if (url.pathname === '/api/sermons/resync' && request.method === 'POST') {
      return handleManualResync(request, env, ctx);
    }

    // GitHub OAuth dance for Decap CMS (/admin) — see STEP-BY-STEP.md
    // "Setting up the staff dashboard". Decap's `github` backend expects
    // exactly these two routes and the exact postMessage contract below;
    // this is not Selah-specific, it's the documented integration shape.
    if (url.pathname === '/oauth/authorize') {
      return handleOAuthAuthorize(request, env);
    }
    if (url.pathname === '/oauth/callback') {
      return handleOAuthCallback(request, env);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncSermons(env));
  },
};

async function handleSermonsApi(request, env) {
  const cached = await env.SERMONS_KV.get(KV_KEY, 'json');
  const body = cached || { series: [], latest: null, updatedAt: null };
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      // Browser + Cloudflare edge cache for an hour; the underlying KV
      // value itself only changes once a day via the cron.
      'cache-control': 'public, max-age=3600',
    },
  });
}

/** Receives, validates, and delivers the site's two small form payloads. */
async function handleFormsApi(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }

  if (!env.TURNSTILE_SECRET || !env.RESEND_API_KEY) {
    console.error('Form service is not configured: missing required secret');
    return formJson({ ok: false, result: 'error', message: 'The form service is unavailable right now. Please try again shortly.' }, 503);
  }

  const body = await readLimitedRequestBody(request, FORM_MAX_BODY_BYTES);
  if (body === null) {
    return formJson({ ok: false, result: 'error', message: 'This submission is too large. Please shorten it and try again.' }, 413);
  }

  let submitted;
  try {
    submitted = JSON.parse(body);
  } catch {
    return formJson({ ok: false, result: 'error', code: 'invalid_submission', message: 'The form could not be read. Please try again.' }, 400);
  }

  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
    return formJson({ ok: false, result: 'error', code: 'invalid_submission', message: 'The form could not be read. Please try again.' }, 400);
  }

  const turnstile = await verifyTurnstile(request, env.TURNSTILE_SECRET, submitted['cf-turnstile-response']);
  if (!turnstile.ok) {
    console.warn(`Turnstile rejected a form submission: ${turnstile.reason}`);
    return formJson({ ok: false, result: 'error', code: 'verification_failed', message: 'Verification failed. Please reload the page and try again.' }, 400);
  }

  // A filled honeypot gets an indistinguishable success response. Validate
  // Turnstile first so this endpoint cannot be used as a free success oracle.
  if (oneLine(submitted._gotcha, 240)) {
    return formJson({ ok: true, result: 'success' }, 200);
  }

  const form = parseFormSubmission(submitted);
  if (!form.ok) {
    return formJson({ ok: false, result: 'error', code: 'invalid_submission', message: form.message }, 400);
  }

  try {
    await sendFormEmail(env.RESEND_API_KEY, form);
    return formJson({ ok: true, result: 'success' }, 200);
  } catch (err) {
    // Do not log form contents, visitor addresses, or the Resend response.
    // That data may be especially sensitive for a prayer request.
    console.error(`Form email delivery failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return formJson({ ok: false, result: 'error', message: 'The form service is unavailable right now. Please try again shortly.' }, 502);
  }
}

/** Read at most the form envelope's small, intentional size. */
async function readLimitedRequestBody(request, maximumBytes) {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function formJson(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json;charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function verifyTurnstile(request, secret, rawToken) {
  const token = tokenValue(rawToken);
  if (!token || token.length > 2048) return { ok: false, reason: 'missing-or-invalid-token' };

  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) body.set('remoteip', ip);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    if (!response.ok) return { ok: false, reason: `siteverify-http-${response.status}` };

    const result = await response.json();
    if (result?.success !== true) return { ok: false, reason: 'siteverify-rejected' };
    if (result.action !== TURNSTILE_ACTION) return { ok: false, reason: 'action-mismatch' };
    if (!TURNSTILE_HOSTNAMES.has(result.hostname)) return { ok: false, reason: 'hostname-mismatch' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'siteverify-unavailable' };
  }
}

function parseFormSubmission(data) {
  const formType = oneLine(data.formType, 20);
  const name = oneLine(data.name, 240);
  const email = oneLine(data.email, 320);

  if (formType === 'contact') {
    const message = multiLine(data.message, 5000);
    if (!name || !email || !message || !isEmail(email)) {
      return { ok: false, message: 'Please complete the required fields and use a valid email address.' };
    }
    return {
      ok: true,
      subject: `New Visit/Contact Message — ${name}`,
      replyTo: email,
      text: ['Name: ' + name, 'Email: ' + email, '', 'Message:', message, '', '---', 'Submitted through the contact form on selahchurchfxbg.com.'].join('\n'),
    };
  }

  if (formType === 'prayer') {
    const request = multiLine(data.request, 5000);
    if (!name || !request || (email && !isEmail(email))) {
      return { ok: false, message: 'Please complete the required fields and use a valid email address.' };
    }
    const confidential = data.confidential === true || data.confidential === 'true' || data.confidential === 'on';
    return {
      ok: true,
      subject: `New Prayer Request — ${name}`,
      replyTo: email || null,
      text: [
        'Name: ' + name,
        'Email: ' + (email || '(not provided)'),
        'Confidential: ' + (confidential ? 'Yes — the sender asked for this to be kept confidential' : 'No'),
        '',
        'Request:',
        request,
        '',
        '---',
        'Submitted through the prayer form on selahchurchfxbg.com.',
      ].join('\n'),
    };
  }

  return { ok: false, message: 'This form type is not recognized.' };
}

async function sendFormEmail(apiKey, form) {
  const email = {
    from: FORM_FROM,
    to: [FORM_NOTIFY_EMAIL],
    subject: form.subject,
    text: form.text,
  };
  if (form.replyTo) email.reply_to = form.replyTo;

  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(email),
  });
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
}

function tokenValue(value) {
  return typeof value === 'string' ? value.replace(/[\r\n\t]+/g, '').trim() : '';
}

function oneLine(value, maximumLength) {
  return value === null || value === undefined
    ? ''
    : String(value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, maximumLength);
}

function multiLine(value, maximumLength) {
  return value === null || value === undefined
    ? ''
    : String(value).replace(/\r\n/g, '\n').trim().slice(0, maximumLength);
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleManualResync(request, env, ctx) {
  const provided = request.headers.get('x-resync-secret');
  if (!env.RESYNC_SECRET || provided !== env.RESYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await syncSermons(env);
  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json' },
  });
}

async function syncSermons(env) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY is not set — skipping sync');
    return { ok: false, error: 'missing YOUTUBE_API_KEY' };
  }

  const series = [];
  for (const [slug, config] of Object.entries(SERIES_PLAYLISTS)) {
    if (!config.playlistId || config.playlistId === 'REPLACE_ME') continue;
    try {
      const videos = await fetchPlaylistVideos(config.playlistId, apiKey);
      series.push({ slug, label: config.label, videos });
    } catch (err) {
      console.error(`Failed to sync series "${slug}"`, err);
      // One bad playlist (e.g. a typo'd ID) shouldn't take down every
      // other series — skip it and keep going.
    }
  }

  try {
    const extras = await fetchUnlistedMessages(series, apiKey);
    if (extras.length) series.push({ ...UNLISTED_SERIES, videos: extras });
  } catch (err) {
    // The playlists are the primary source — if the uploads sweep fails, ship
    // what the playlists gave us rather than losing the whole sync.
    console.error('Failed to sweep channel uploads', err);
  }

  const allVideos = series
    .flatMap((s) => s.videos.map((v) => ({ ...v, seriesSlug: s.slug, seriesLabel: s.label })))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const payload = {
    series,
    latest: allVideos[0] || null,
    updatedAt: new Date().toISOString(),
  };

  await env.SERMONS_KV.put(KV_KEY, JSON.stringify(payload));
  return {
    ok: true,
    seriesSynced: series.length,
    videosSynced: allVideos.length,
    updatedAt: payload.updatedAt,
  };
}

/* Everything on the channel that no series playlist claimed. Returns [] on a
   clean run where the playlists already cover every recent message. */
async function fetchUnlistedMessages(series, apiKey) {
  const uploadsPlaylistId = await resolveUploadsPlaylistId(apiKey);
  if (!uploadsPlaylistId) return [];

  const known = new Set(series.flatMap((s) => s.videos.map((v) => v.videoId)));
  const candidates = (await fetchPlaylistVideos(uploadsPlaylistId, apiKey, UPLOADS_SCAN_LIMIT))
    .filter((v) => !known.has(v.videoId));
  if (!candidates.length) return [];

  const durations = await fetchDurations(candidates.map((v) => v.videoId), apiKey);
  return candidates.filter((v) => (durations.get(v.videoId) || 0) >= MIN_MESSAGE_SECONDS);
}

/* The uploads playlist id is derived from the channel, not hard-coded, so
   this keeps working if the handle is ever pointed at a different channel. */
async function resolveUploadsPlaylistId(apiKey) {
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/channels');
  endpoint.searchParams.set('part', 'contentDetails');
  endpoint.searchParams.set('forHandle', CHANNEL_HANDLE);
  endpoint.searchParams.set('key', apiKey);

  const res = await fetch(endpoint.toString());
  if (!res.ok) throw new Error(`YouTube API ${res.status} resolving ${CHANNEL_HANDLE}: ${await res.text()}`);
  const data = await res.json();
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
}

/* videos.list takes up to 50 ids at a time. */
async function fetchDurations(videoIds, apiKey) {
  const durations = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
    endpoint.searchParams.set('part', 'contentDetails');
    endpoint.searchParams.set('id', videoIds.slice(i, i + 50).join(','));
    endpoint.searchParams.set('key', apiKey);

    const res = await fetch(endpoint.toString());
    if (!res.ok) throw new Error(`YouTube API ${res.status} fetching durations: ${await res.text()}`);
    const data = await res.json();
    for (const item of data.items || []) {
      durations.set(item.id, parseIsoDuration(item.contentDetails?.duration));
    }
  }
  return durations;
}

/* YouTube reports duration as an ISO 8601 period, e.g. PT43M3S. Videos are
   never long enough for the date half of the format to appear. */
function parseIsoDuration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function randomState() {
  return crypto.randomUUID();
}

async function handleOAuthAuthorize(request, env) {
  if (!env.GITHUB_OAUTH_CLIENT_ID) {
    return new Response('OAuth is not configured (missing GITHUB_OAUTH_CLIENT_ID)', { status: 500 });
  }
  const url = new URL(request.url);
  const state = randomState();
  const redirectUri = `${url.origin}/oauth/callback`;

  const githubAuthorize = new URL('https://github.com/login/oauth/authorize');
  githubAuthorize.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  githubAuthorize.searchParams.set('redirect_uri', redirectUri);
  githubAuthorize.searchParams.set('scope', 'repo,user');
  githubAuthorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: githubAuthorize.toString(),
      // Short-lived, http-only — just here so /callback can confirm the
      // request round-tripped through GitHub and wasn't forged.
      'Set-Cookie': `decap_oauth_state=${state}; Path=/oauth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

async function handleOAuthCallback(request, env) {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) {
    return new Response('OAuth is not configured (missing GITHUB_OAUTH_CLIENT_ID/SECRET)', { status: 500 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = (request.headers.get('cookie') || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('decap_oauth_state='))
    ?.split('=')[1];

  if (!code || !state || state !== cookieState) {
    return new Response('OAuth state mismatch — please try logging in again.', { status: 400 });
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/oauth/callback`,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return new Response(`GitHub did not return an access token: ${JSON.stringify(tokenData)}`, { status: 400 });
  }

  // Decap's github backend expects the opener window to receive exactly
  // this postMessage shape. `payloadJsLiteral` is the JSON payload
  // re-stringified so it drops into the generated <script> as a safely
  // escaped JS string literal (handles quotes/backslashes in the token).
  const payload = JSON.stringify({ token: tokenData.access_token, provider: 'github' });
  const payloadJsLiteral = JSON.stringify(payload);
  const html = `<!DOCTYPE html><html><body>
<script>
(function() {
  function receiveMessage(message) {
    window.opener.postMessage(
      'authorization:github:success:' + ${payloadJsLiteral},
      message.origin
    );
    window.removeEventListener('message', receiveMessage, false);
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>
</body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'Set-Cookie': 'decap_oauth_state=; Path=/oauth; Max-Age=0',
    },
  });
}

async function fetchPlaylistVideos(playlistId, apiKey, max = MAX_PER_SERIES) {
  const items = [];
  let pageToken = '';

  do {
    const endpoint = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    endpoint.searchParams.set('part', 'snippet,contentDetails');
    endpoint.searchParams.set('maxResults', String(Math.min(PAGE_SIZE, max - items.length)));
    endpoint.searchParams.set('playlistId', playlistId);
    endpoint.searchParams.set('key', apiKey);
    if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

    const res = await fetch(endpoint.toString());
    if (!res.ok) {
      throw new Error(`YouTube API ${res.status} for playlist ${playlistId}: ${await res.text()}`);
    }
    const data = await res.json();
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken && items.length < max);

  return items
    .filter((item) => {
      const title = item.snippet?.title || '';
      // Deleted/private videos still show up as playlist items with these
      // placeholder titles — drop them rather than showing broken cards.
      return title !== 'Private video' && title !== 'Deleted video';
    })
    .map((item) => ({
      title: item.snippet.title,
      videoId: item.contentDetails.videoId,
      // Prefer the sharpest source YouTube actually generated for this video.
      // maxres (1280x720) isn't guaranteed on every upload, so this falls
      // through standard/high before landing on the old medium/default pair
      // — those two were the only options tried before, capping every
      // thumbnail at 320x180 even when a 720p version existed.
      thumbnail:
        item.snippet.thumbnails?.maxres?.url ||
        item.snippet.thumbnails?.standard?.url ||
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        null,
      publishedAt: item.contentDetails.videoPublishedAt || item.snippet.publishedAt,
    }))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}
