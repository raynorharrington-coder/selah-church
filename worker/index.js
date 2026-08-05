/**
 * Selah Church Worker
 *
 * Two jobs:
 *  1. Serve the static site (everything not matched below falls through to
 *     the ASSETS binding, i.e. the existing HTML/CSS/JS files).
 *  2. Once a day (see wrangler.jsonc "triggers.crons"), pull the latest
 *     videos from each sermon-series YouTube playlist and cache the result
 *     in KV, so sermons.html never has to call YouTube's API itself.
 *
 * Nothing here needs Luke's involvement day to day — this file only needs
 * to be touched again if a new sermon series starts (add its playlist to
 * SERIES_PLAYLISTS below) or the YouTube API key rotates.
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
const MAX_PER_SERIES = 25;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/sermons') {
      return handleSermonsApi(request, env);
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

  const allVideos = series
    .flatMap((s) => s.videos.map((v) => ({ ...v, seriesSlug: s.slug, seriesLabel: s.label })))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const payload = {
    series,
    latest: allVideos[0] || null,
    updatedAt: new Date().toISOString(),
  };

  await env.SERMONS_KV.put(KV_KEY, JSON.stringify(payload));
  return { ok: true, seriesSynced: series.length, updatedAt: payload.updatedAt };
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

async function fetchPlaylistVideos(playlistId, apiKey) {
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  endpoint.searchParams.set('part', 'snippet,contentDetails');
  endpoint.searchParams.set('maxResults', String(MAX_PER_SERIES));
  endpoint.searchParams.set('playlistId', playlistId);
  endpoint.searchParams.set('key', apiKey);

  const res = await fetch(endpoint.toString());
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status} for playlist ${playlistId}: ${await res.text()}`);
  }
  const data = await res.json();

  return (data.items || [])
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
