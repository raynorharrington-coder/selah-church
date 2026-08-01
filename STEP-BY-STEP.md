# Step-by-step: sermon auto-sync + staff dashboard

This is the build/setup guide for two things added to the site:

1. **Sermons auto-sync** — `sermons.html` and the homepage's featured-message
   panel now pull real videos from YouTube automatically, once a day. No one
   has to type in sermon titles by hand again.
2. **Staff dashboard** (`/admin`) — a lightweight, free CMS (Decap CMS) so
   Luke's team can add/edit Events themselves, without a developer, without
   touching code. Built to extend to other content later (team bios, the
   doctrinal statement, etc.) the same way.

All the code for both is already written and committed. What's left is
account-level setup only you or Luke can do — creating API keys, an OAuth
app, and a KV namespace, then deploying. Budget about 45–60 minutes total,
most of it waiting on things to save in various dashboards.

---

## Part 1 — Sermons auto-sync

### 1a. Get a YouTube Data API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   sign in with whichever Google account should own this (Selah's own
   account is best, so it's not tied to a personal one).
2. Create a new project (top-left project picker → "New Project"). Name it
   something like `selah-church-site`.
3. In the search bar, search **"YouTube Data API v3"** → open it → click
   **Enable**.
4. Go to **APIs & Services → Credentials** → **Create Credentials → API
   key**. Copy the key it gives you somewhere safe for a minute.
5. Click **Restrict Key** on the new key:
   - Under **API restrictions**, choose "Restrict key" and select only
     **YouTube Data API v3**.
   - You can leave "Application restrictions" as None, since this key is
     only ever called from inside our own Cloudflare Worker (server-side),
     never from a visitor's browser.
6. Save. This key is free — YouTube's free quota (10,000 units/day) is far
   more than a once-a-day sync of a handful of playlists will ever use.

### 1b. Find your series playlist IDs

Selah's YouTube channel already organizes sermons into playlists per
series (that's how selahchurchfxbg.com/sermons works today). We're reusing
that same organization.

1. Go to the channel's playlists tab.
2. Open each series playlist. The URL looks like:
   `https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
3. Everything after `list=` is the playlist ID. Copy it.
4. Open `worker/index.js` in the repo and find `SERIES_PLAYLISTS` near the
   top. Replace each `REPLACE_ME` with the real playlist ID for that
   series:

   ```js
   const SERIES_PLAYLISTS = {
     'just-jesus': { label: 'Just Jesus', playlistId: 'PLxxxxxxxxxxxxxxxx' },
     'design': { label: 'Design: A Life of Order', playlistId: 'PLxxxxxxxxxxxxxxxx' },
     // ...one per series
   };
   ```

   If a series doesn't have a playlist yet, leave it as `REPLACE_ME` — the
   sync code skips anything not filled in, it won't error.
5. Starting a brand new series later? Add a new line here with its
   playlist ID and a URL-safe slug (lowercase, hyphens). That's the only
   code change ever needed for a new series — no dashboard step for this
   part, since it's still coming from YouTube automatically.

### 1c. Create the Cloudflare KV namespace

This is where the daily-synced sermon data gets cached so real visitors
never wait on a YouTube API call.

1. Make sure `wrangler` is installed and you're logged in:
   ```bash
   npx wrangler login
   ```
2. Create the namespace:
   ```bash
   npx wrangler kv namespace create SERMONS_KV
   ```
3. It prints an `id`. Open `wrangler.jsonc`, find the `kv_namespaces`
   block, and replace `REPLACE_ME_WITH_KV_NAMESPACE_ID` with that id.

### 1d. Set the API key as a Worker secret

Never put the raw API key in `wrangler.jsonc` or any committed file —
secrets go in as, well, a secret:

```bash
npx wrangler secret put YOUTUBE_API_KEY
```
(Paste the key from step 1a when prompted.)

Optional but recommended — a secret that lets you manually trigger a
resync without waiting for the daily cron (useful right after publishing
a new message):
```bash
npx wrangler secret put RESYNC_SECRET
```
(Make up any random string for this one — it's just a shared password
between you and the `/api/sermons/resync` endpoint.)

### 1e. Deploy

```bash
npx wrangler deploy
```

That's it for sermons. The cron trigger (`worker/index.js` runs once a day
at 10:00 UTC / ~6am Eastern — adjust the `crons` line in `wrangler.jsonc`
if you want a different time) will do the first sync automatically. To
force an immediate first sync instead of waiting:

```bash
curl -X POST https://selah-church.thyratechllc.workers.dev/api/sermons/resync \
  -H "x-resync-secret: <the RESYNC_SECRET you set>"
```

Then check `https://selah-church.thyratechllc.workers.dev/api/sermons` in a
browser — you should see real JSON with your series and videos, not an
empty `{"series":[],"latest":null}`.

---

## Part 2 — Staff dashboard (Decap CMS)

### 2a. Create a GitHub OAuth App

This lets the dashboard log Luke in with his GitHub account and commit his
edits to the repo on his behalf — no Git knowledge needed on his end, the
dashboard's UI hides all of that.

1. In GitHub: **Settings → Developer settings → OAuth Apps → New OAuth
   App**. (This can be on your own GitHub account, since it owns the repo;
   Luke doesn't need his own GitHub account unless you want him logging in
   with his own identity instead of a shared one — either works.)
2. Fill in:
   - **Application name**: `Selah Church Dashboard`
   - **Homepage URL**: `https://selah-church.thyratechllc.workers.dev`
   - **Authorization callback URL**:
     `https://selah-church.thyratechllc.workers.dev/oauth/callback`
3. Register, then **Generate a new client secret**. Copy both the
   **Client ID** and the **Client Secret** — the secret is only shown once.

### 2b. Set the OAuth credentials as Worker secrets

```bash
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
```

### 2c. Confirm the repo path in the dashboard config

Open `admin/config.yml` and confirm the `backend.repo` line matches the
real GitHub repo (`raynorharrington-coder/selah-church` as of this
writing) and `branch` matches whichever branch is actually deployed
(`main`).

### 2d. Deploy (if you haven't already redeployed since Part 1)

```bash
npx wrangler deploy
```

### 2e. Grant repo access

Whoever logs into `/admin` needs push access to the GitHub repo, since
every save in the dashboard is a real commit. Add Luke (or whoever will
use it day to day) as a collaborator on the repo, or use a dedicated
shared account — your call.

### 2f. Try it

1. Go to `https://selah-church.thyratechllc.workers.dev/admin`.
2. Click **Login with GitHub**, approve the app.
3. You should land on the "Events" collection with the 3 seeded
   placeholder events already there. Edit one, click **Publish** — check
   that the change shows up on `events.html` after a refresh (it commits
   straight to `main`, so it's live within a few seconds, no build step).

Hand off `USER-GUIDE.md` to Luke once this works — that's the doc written
for him, not for a developer.

---

## Extending the dashboard to other content later

Events uses a **single-file collection** (`content/events.json`, edited as
a list) specifically because this site has no build step — the page just
fetches that one JSON file directly, the same pattern the sermon sync
uses for `/api/sermons`. To add another content type (team bios, the
doctrinal statement, event category tags, etc.) to the dashboard:

1. Add a new `content/<whatever>.json` seed file, same shape as
   `content/events.json` (a top-level object with a `items` list, or
   whatever fields make sense).
2. Add a matching collection block to `admin/config.yml`.
3. Add a small fetch-and-render function to `script.js` (copy
   `initEventsData`/`eventCardHTML` as the template) and give the target
   page's container an `id` to hook into, same as `events.html`'s
   `#eventList`.

No new Worker code, no new OAuth setup — all of that's already shared.

---

## Ongoing maintenance notes

- **Rotating the YouTube API key or GitHub OAuth secret**: just run the
  matching `wrangler secret put` command again with the new value, then
  `wrangler deploy`. Nothing else changes.
- **A series playlist ID changes** (e.g. Selah renames/recreates a
  playlist): update it in `worker/index.js`'s `SERIES_PLAYLISTS`, redeploy.
- **Something looks stale on `sermons.html`**: check
  `/api/sermons/resync` (Part 1e) — if that also comes back empty, the
  API key or a playlist ID is probably wrong; check `wrangler tail` for
  the Worker's error log.
- **Dashboard login fails**: almost always the OAuth callback URL in the
  GitHub OAuth App settings not exactly matching
  `https://selah-church.thyratechllc.workers.dev/oauth/callback`
  (protocol, trailing slash, and domain all have to match exactly).
