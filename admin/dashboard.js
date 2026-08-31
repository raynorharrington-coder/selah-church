/* ==========================================================================
   SELAH STAFF DASHBOARD
   ==========================================================================
   Replaces the Decap CMS build that used to live here. Three reasons it went:

   1. It was loaded from unpkg on every visit, which AGENTS.md forbids —
      the whole editing surface for the site depended on a third-party CDN.
   2. Its UI is a self-contained React app that can't be made to look like
      Selah, and this is a tool a handful of church staff use.
   3. It edited content/events.json, which at the time nothing read, so the
      dashboard appeared to work while changing nothing visitors could see.

   The GitHub OAuth handshake is unchanged — worker/index.js still owns
   /oauth/authorize and /oauth/callback, and this file speaks the same
   postMessage protocol its callback page already implements. Nothing about
   auth was re-invented here.

   Reading needs no sign-in: content/events.json is a public file on this very
   site, so the editor loads instantly and only asks for GitHub when someone
   actually wants to publish. Saving commits straight to main through the
   GitHub Contents API, which is what the old CMS did too.
   ========================================================================== */

const REPO = 'raynorharrington-coder/selah-church';
const BRANCH = 'main';
const FILE_PATH = 'content/events.json';
const TOKEN_KEY = 'selah.dashboard.token';
const API = 'https://api.github.com';

const state = {
  items: [],
  loadedRaw: '',
  token: null,
  user: null,
  openId: null,
  saving: false,
};

let nextLocalId = 1;

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => escapeEventText(s);

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/* btoa/atob are byte-oriented. The descriptions are full of em dashes and
   curly apostrophes, so going through TextEncoder/TextDecoder is not optional
   here — the naive version mangles every one of them. */
function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function decodeBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function toast(message, kind) {
  const el = $('dashToast');
  el.textContent = message;
  el.className = `dash-toast${kind ? ` is-${kind}` : ''}`;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 9000 : 4500);
}

/* ---------- shape ---------- */
/* Canonical key order, so a one-word edit produces a one-line diff in git
   rather than a reshuffled file nobody can review. */
function blankEvent() {
  return {
    _id: `new-${nextLocalId++}`,
    title: '',
    cadence: 'monthly',
    weekday: 3,
    weeks: [1],
    date: '',
    startsOn: '',
    time: '',
    location: '',
    description: '',
    linkHref: '',
    linkLabel: '',
    _isNew: true,
  };
}

function serializeEvent(ev) {
  return {
    title: ev.title.trim(),
    cadence: ev.cadence,
    weekday: ev.cadence === 'once' ? 0 : Number(ev.weekday),
    weeks: ev.cadence === 'monthly' ? ev.weeks.slice().sort((a, b) => a - b) : [],
    date: ev.cadence === 'once' ? ev.date : '',
    startsOn: ev.cadence === 'once' ? '' : ev.startsOn,
    time: ev.time.trim(),
    location: ev.location.trim(),
    description: ev.description.trim(),
    linkHref: ev.linkHref.trim(),
    linkLabel: ev.linkLabel.trim(),
  };
}

function currentJson() {
  return `${JSON.stringify({ items: state.items.map(serializeEvent) }, null, 2)}\n`;
}

function isDirty() { return currentJson() !== state.loadedRaw; }

function validate(ev) {
  if (!ev.title.trim()) return 'Give the event a name.';
  if (ev.cadence === 'once' && !ev.date) return 'Pick the date this happens.';
  if (ev.cadence === 'monthly' && !ev.weeks.length) return 'Choose at least one week of the month.';
  if (ev.linkHref.trim() && !ev.linkLabel.trim()) return 'The button needs wording as well as a link.';
  if (ev.linkLabel.trim() && !ev.linkHref.trim()) return 'The button needs a link as well as wording.';
  return '';
}

/* ---------- GitHub ---------- */
function githubHeaders() {
  return {
    Authorization: `token ${state.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/* Speaks the exact protocol worker/index.js's /oauth/callback already
   implements: the popup announces itself, we answer so it learns our origin,
   and it posts the token back to that origin only. */
function signIn() {
  return new Promise((resolve, reject) => {
    const popup = window.open('/oauth/authorize', 'selah-oauth', 'width=680,height=780');
    if (!popup) {
      reject(new Error('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'));
      return;
    }
    const PREFIX = 'authorization:github:success:';
    const timer = setInterval(() => {
      if (popup.closed) { cleanup(); reject(new Error('Sign-in was cancelled.')); }
    }, 500);

    function cleanup() {
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
    }
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (e.data === 'authorizing:github') {
        popup.postMessage('authorizing:github', window.location.origin);
        return;
      }
      if (typeof e.data === 'string' && e.data.startsWith(PREFIX)) {
        cleanup();
        try { popup.close(); } catch (err) { /* already gone */ }
        try {
          const payload = JSON.parse(e.data.slice(PREFIX.length));
          if (!payload.token) throw new Error('no token in payload');
          resolve(payload.token);
        } catch (err) {
          reject(new Error('GitHub sign-in returned something unreadable.'));
        }
      }
    }
    window.addEventListener('message', onMessage);
  });
}

async function ensureToken() {
  if (state.token) return state.token;
  const token = await signIn();
  state.token = token;
  // sessionStorage, not localStorage: the token dies with the tab rather than
  // sitting on a shared church laptop indefinitely.
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch (e) { /* private mode */ }
  await loadUser();
  renderAccount();
  return token;
}

async function loadUser() {
  const res = await fetch(`${API}/user`, { headers: githubHeaders() });
  if (!res.ok) throw new Error('GitHub rejected the sign-in.');
  state.user = await res.json();
}

function signOut() {
  state.token = null;
  state.user = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  renderAccount();
  toast('Signed out.');
}

/* ---------- load ---------- */
async function loadEvents() {
  const res = await fetch('/content/events.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load events (${res.status}).`);
  const raw = await res.text();
  const data = JSON.parse(raw);
  state.items = (data.items || []).map((ev) => ({
    _id: `ev-${nextLocalId++}`,
    title: ev.title || '',
    cadence: ev.cadence || 'monthly',
    weekday: Number(ev.weekday) || 0,
    weeks: Array.isArray(ev.weeks) ? ev.weeks.slice() : [],
    date: ev.date || '',
    startsOn: ev.startsOn || '',
    time: ev.time || '',
    location: ev.location || '',
    description: ev.description || '',
    linkHref: ev.linkHref || '',
    linkLabel: ev.linkLabel || '',
  }));
  // Re-serialize rather than trusting the file's own whitespace, so "dirty"
  // means the content changed, not that the file was formatted differently.
  state.loadedRaw = currentJson();
}

/* ---------- save ---------- */
async function publish() {
  if (state.saving) return;

  for (const ev of state.items) {
    const problem = validate(ev);
    if (problem) {
      state.openId = ev._id;
      renderList();
      toast(`${ev.title || 'Untitled event'}: ${problem}`, 'error');
      return;
    }
  }

  state.saving = true;
  renderSaveBar();
  try {
    await ensureToken();

    // Fetch the live file to get its sha, and to notice if someone else has
    // changed it since this page loaded — blind PUTs silently clobber.
    const head = await fetch(`${API}/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, {
      headers: githubHeaders(),
      cache: 'no-store',
    });
    if (!head.ok) throw new Error(`Could not read the current file from GitHub (${head.status}).`);
    const meta = await head.json();
    const remote = decodeBase64(meta.content);

    if (remote !== state.loadedRaw) {
      const ok = window.confirm(
        'The events file on GitHub has changed since you opened this page — '
        + 'someone else may have edited it.\n\nPublishing now will overwrite their '
        + 'version with yours. Cancel to reload instead.'
      );
      if (!ok) { state.saving = false; renderSaveBar(); return; }
    }

    const body = {
      message: 'Update events via staff dashboard',
      content: encodeBase64(currentJson()),
      sha: meta.sha,
      branch: BRANCH,
    };
    const put = await fetch(`${API}/repos/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!put.ok) {
      const detail = await put.json().catch(() => ({}));
      throw new Error(detail.message || `GitHub refused the change (${put.status}).`);
    }

    state.loadedRaw = currentJson();
    state.items.forEach((ev) => { delete ev._isNew; });
    renderAll();
    toast('Published. The website updates in a minute or two.', 'ok');
  } catch (e) {
    toast(e.message || 'Something went wrong publishing.', 'error');
  } finally {
    state.saving = false;
    renderSaveBar();
  }
}

/* ---------- render ---------- */
function renderAccount() {
  const el = $('dashAccount');
  if (state.user) {
    el.innerHTML = `
      <img src="${esc(state.user.avatar_url)}" alt="" width="26" height="26">
      <span>${esc(state.user.login)}</span>
      <button type="button" class="dash-btn dash-btn--quiet" id="dashSignOut">Sign out</button>`;
    $('dashSignOut').addEventListener('click', signOut);
  } else {
    el.innerHTML = '<span>Not signed in</span>';
  }
}

const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function rowHTML(ev, next) {
  const cadence = describeCadence(ev);
  const open = state.openId === ev._id;
  const month = next ? next.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : cadence.top;
  const day = next ? String(next.getDate()) : cadence.bottom;
  const summary = [cadence.recurrence, ev.time].filter(Boolean).join(' · ') || 'Not scheduled yet';
  return `
    <div class="dash-row${open ? ' is-open' : ''}${ev._isNew ? ' is-new' : ''}" data-id="${ev._id}">
      <button type="button" class="dash-row-head" data-act="toggle" aria-expanded="${open}">
        <span class="dash-chip"><span class="m">${esc(month)}</span><span class="d">${esc(day)}</span></span>
        <span class="dash-row-title">
          <strong>${esc(ev.title || 'Untitled event')}</strong>
          <span>${esc(summary)}</span>
        </span>
        <span class="dash-row-toggle"><span>${open ? 'Close' : 'Edit'}</span>${CHEVRON}</span>
      </button>
      <div class="dash-row-body">${open ? editorHTML(ev, next) : ''}</div>
    </div>`;
}

function weekdayOptions(selected) {
  return WEEKDAY_NAMES
    .map((name, i) => `<option value="${i}"${Number(selected) === i ? ' selected' : ''}>${name}</option>`)
    .join('');
}

function editorHTML(ev, next) {
  const isOnce = ev.cadence === 'once';
  const isMonthly = ev.cadence === 'monthly';
  const preview = eventCardHTML(serializeEvent(ev), next);
  const nextLine = next
    ? `Next: ${next.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
    : (isOnce ? 'This date has passed — it no longer shows on the site.' : 'No upcoming date.');

  return `
    <div class="dash-grid">
      <div class="dash-field dash-field--wide">
        <label class="dash-label" for="t-${ev._id}">Event name</label>
        <input class="dash-input" id="t-${ev._id}" data-f="title" type="text" value="${esc(ev.title)}" placeholder="e.g. Shabbat Dinner">
      </div>

      <div class="dash-field">
        <span class="dash-label">How often</span>
        <div class="dash-seg" role="group" aria-label="How often this happens">
          <button type="button" data-cadence="weekly"  aria-pressed="${ev.cadence === 'weekly'}">Weekly</button>
          <button type="button" data-cadence="monthly" aria-pressed="${isMonthly}">Monthly</button>
          <button type="button" data-cadence="once"    aria-pressed="${isOnce}">One-off</button>
        </div>
      </div>

      ${isOnce ? `
      <div class="dash-field">
        <label class="dash-label" for="d-${ev._id}">Date</label>
        <input class="dash-input" id="d-${ev._id}" data-f="date" type="date" value="${esc(ev.date)}">
        <span class="dash-hint">One-off events disappear from the site by themselves once the date has passed.</span>
      </div>` : `
      <div class="dash-field">
        <label class="dash-label" for="w-${ev._id}">Day of the week</label>
        <select class="dash-select" id="w-${ev._id}" data-f="weekday">${weekdayOptions(ev.weekday)}</select>
      </div>`}

      ${isMonthly ? `
      <div class="dash-field dash-field--wide">
        <span class="dash-label">Which weeks of the month</span>
        <div class="dash-weeks">
          ${[1, 2, 3, 4, 5].map((n) => `
            <label class="dash-week">
              <input type="checkbox" data-week="${n}"${ev.weeks.includes(n) ? ' checked' : ''}>
              <span>${ORDINAL_SHORT[n]}</span>
            </label>`).join('')}
        </div>
        <span class="dash-hint">The wording under the date is written for you from this — pick "1st" and "3rd" and the site says "First &amp; third".</span>
      </div>` : ''}

      ${!isOnce ? `
      <div class="dash-field">
        <label class="dash-label" for="s-${ev._id}">Starts on <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
        <input class="dash-input" id="s-${ev._id}" data-f="startsOn" type="date" value="${esc(ev.startsOn)}">
        <span class="dash-hint">Use this when a rhythm hasn't begun yet, so the site doesn't advertise a date before the first one.</span>
      </div>` : ''}

      <div class="dash-field">
        <label class="dash-label" for="ti-${ev._id}">Time <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
        <input class="dash-input" id="ti-${ev._id}" data-f="time" type="text" value="${esc(ev.time)}" placeholder="6:30 – 8:30 PM">
      </div>

      <div class="dash-field">
        <label class="dash-label" for="lo-${ev._id}">Location <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
        <input class="dash-input" id="lo-${ev._id}" data-f="location" type="text" value="${esc(ev.location)}" placeholder="Selah Church">
      </div>

      <div class="dash-field dash-field--wide">
        <label class="dash-label" for="de-${ev._id}">Description</label>
        <textarea class="dash-textarea" id="de-${ev._id}" data-f="description" placeholder="What is this, and who is it for?">${esc(ev.description)}</textarea>
      </div>

      <div class="dash-field">
        <label class="dash-label" for="lh-${ev._id}">Button link <span style="text-transform:none;letter-spacing:0">(optional)</span></label>
        <input class="dash-input" id="lh-${ev._id}" data-f="linkHref" type="text" value="${esc(ev.linkHref)}" placeholder="cadre.html">
      </div>

      <div class="dash-field">
        <label class="dash-label" for="ll-${ev._id}">Button wording</label>
        <input class="dash-input" id="ll-${ev._id}" data-f="linkLabel" type="text" value="${esc(ev.linkLabel)}" placeholder="Learn more">
      </div>

      <div class="dash-preview">
        <div class="dash-preview-label">On the site <em>exactly how this card will look</em></div>
        <div class="dash-preview-stage"><div class="event-list">${preview}</div></div>
      </div>
    </div>

    <div class="dash-row-foot">
      <span class="dash-next">${esc(nextLine)}</span>
      <button type="button" class="dash-btn dash-btn--danger" data-act="delete">Remove event</button>
    </div>`;
}

function renderList() {
  const main = $('dashMain');
  const cards = upcomingEvents(state.items.map((ev) => ({ ...serializeEvent(ev), _id: ev._id, _isNew: ev._isNew })), todayMidnight());

  // upcomingEvents drops past one-offs, but the editor must still show them —
  // otherwise an event with a mistyped date becomes invisible and unfixable.
  const shown = cards.map((c) => c.ev._id);
  const orphans = state.items.filter((ev) => !shown.includes(ev._id));

  const rows = [
    ...cards.map(({ ev, next }) => rowHTML(state.items.find((e) => e._id === ev._id), next)),
    ...orphans.map((ev) => rowHTML(ev, null)),
  ].join('');

  main.innerHTML = `
    <div class="dash-head">
      <h1>Events</h1>
      <p>Add, edit and remove what appears on the church's events page. The site
         orders them automatically by whichever happens next, so there's nothing
         to drag around — and recurring events work out their own dates every
         month without anyone touching them.</p>
    </div>
    <div class="dash-list">${rows || '<div class="dash-empty">No events yet</div>'}</div>
    <div class="dash-add"><button type="button" class="dash-btn" id="dashAdd">+ Add an event</button></div>`;

  $('dashAdd').addEventListener('click', () => {
    const ev = blankEvent();
    state.items.push(ev);
    state.openId = ev._id;
    renderAll();
    const el = document.querySelector(`[data-id="${ev._id}"] .dash-input`);
    if (el) el.focus();
  });
}

function renderSaveBar() {
  const bar = $('dashSaveBar');
  const dirty = isDirty();
  bar.hidden = !dirty;
  if (!dirty) return;
  $('dashDirtyCount').textContent = state.saving ? 'Publishing…' : 'You have unpublished changes';
  $('dashSave').disabled = state.saving;
  $('dashDiscard').disabled = state.saving;
}

function renderAll() {
  renderList();
  renderSaveBar();
}

/* ---------- events ---------- */
function findEvent(el) {
  const row = el.closest('[data-id]');
  return row ? state.items.find((e) => e._id === row.dataset.id) : null;
}

function wire() {
  const main = $('dashMain');

  main.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-act="toggle"]');
    if (toggle) {
      const ev = findEvent(toggle);
      state.openId = state.openId === ev._id ? null : ev._id;
      renderAll();
      return;
    }
    const del = e.target.closest('[data-act="delete"]');
    if (del) {
      const ev = findEvent(del);
      if (!window.confirm(`Remove "${ev.title || 'this event'}" from the website?`)) return;
      state.items = state.items.filter((x) => x !== ev);
      state.openId = null;
      renderAll();
      toast('Removed. Publish to make it live.');
      return;
    }
    const seg = e.target.closest('[data-cadence]');
    if (seg) {
      const ev = findEvent(seg);
      ev.cadence = seg.dataset.cadence;
      if (ev.cadence === 'monthly' && !ev.weeks.length) ev.weeks = [1];
      renderAll();
    }
  });

  main.addEventListener('change', (e) => {
    const week = e.target.closest('[data-week]');
    if (week) {
      const ev = findEvent(week);
      const n = Number(week.dataset.week);
      ev.weeks = week.checked ? [...ev.weeks, n] : ev.weeks.filter((x) => x !== n);
      renderAll();
    }
  });

  // `input` rather than `change` so the preview tracks typing, but only the
  // preview and the save bar re-render — re-rendering the whole row would
  // yank focus out of the field mid-word.
  main.addEventListener('input', (e) => {
    const field = e.target.closest('[data-f]');
    if (!field) return;
    const ev = findEvent(field);
    if (!ev) return;
    ev[field.dataset.f] = field.value;

    const row = field.closest('[data-id]');
    const stage = row.querySelector('.dash-preview-stage .event-list');
    if (stage) {
      const next = nextOccurrence(eventRule(serializeEvent(ev)), todayMidnight());
      stage.innerHTML = eventCardHTML(serializeEvent(ev), next);
    }
    const head = row.querySelector('.dash-row-title strong');
    if (head) head.textContent = ev.title || 'Untitled event';
    renderSaveBar();
  });

  $('dashSave').addEventListener('click', publish);
  $('dashDiscard').addEventListener('click', async () => {
    if (!window.confirm('Throw away every change you have made since opening this page?')) return;
    await boot(true);
    toast('Changes discarded.');
  });

  window.addEventListener('beforeunload', (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

/* ---------- boot ---------- */
async function boot(reload) {
  try {
    await loadEvents();
    state.openId = null;
    renderAll();
  } catch (e) {
    $('dashMain').innerHTML = `<div class="dash-signin">
      <h1>Couldn't load events</h1>
      <p>${esc(e.message)}</p>
    </div>`;
  }
  if (reload) return;

  try {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      state.token = saved;
      await loadUser();
    }
  } catch (e) {
    // An expired or revoked token is not an error worth shouting about —
    // publishing will simply ask for a fresh sign-in.
    state.token = null;
  }
  renderAccount();
}

wire();
boot();
