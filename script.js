function getReducedMotionPreference() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    console.error('reduced-motion check failed, defaulting to motion enabled', e);
    return false;
  }
}

/* ---------- Hero video: reduced motion, mobile bandwidth, tab visibility ---------- */
function initHeroVideo(reduceMotion) {
  const heroVideo = document.getElementById('heroVideo');
  if (!heroVideo) return;

  const isNarrowViewport = window.matchMedia('(max-width: 700px)').matches;
  const source = heroVideo.querySelector('source[data-src]');

  if (reduceMotion || isNarrowViewport) {
    // Skip downloading the video entirely on mobile / reduced-motion — poster image only.
    heroVideo.removeAttribute('autoplay');
    heroVideo.pause();
  } else if (source) {
    source.src = source.dataset.src;
    heroVideo.load();
  }

  // Save resources when the tab isn't visible.
  document.addEventListener('visibilitychange', () => {
    if (!heroVideo.paused && document.hidden) heroVideo.pause();
    else if (document.visibilityState === 'visible' && heroVideo.getAttribute('autoplay') !== null) heroVideo.play().catch(() => {});
  });
}

/* ---------- Header scroll state ---------- */
function initHeaderScroll() {
  const header = document.getElementById('siteHeader');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 60);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- Mobile nav toggle ---------- */
function initMobileNav() {
  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  if (!navToggle || !mobileNav) return;

  // CSS only hides the closed panel via max-height/overflow, which doesn't
  // remove its links from the tab order — `inert` keeps the whole panel out
  // of the tab order and out of assistive tech until it's actually open.
  const setMobileNavOpen = (open) => {
    navToggle.classList.toggle('open', open);
    mobileNav.classList.toggle('open', open);
    mobileNav.inert = !open;
    navToggle.setAttribute('aria-expanded', open);
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  setMobileNavOpen(false);
  navToggle.addEventListener('click', () => {
    setMobileNavOpen(!navToggle.classList.contains('open'));
  });
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMobileNavOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navToggle.classList.contains('open')) {
      setMobileNavOpen(false);
      navToggle.focus();
    }
  });
}

/* ---------- Highlight the current page in the nav ---------- */
function initActiveNavHighlight() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a, .mobile-nav a').forEach(link => {
    const linkPath = link.getAttribute('href');
    if (linkPath === currentPath || (currentPath === '' && linkPath === 'index.html')) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

/* ---------- Hero entrance sequence ---------- */
function initHeroEntrance(reduceMotion) {
  const heroEls = document.querySelectorAll('.hero-eyebrow, .hero h1, .hero-sub, .hero-ctas');
  if (heroEls.length && window.gsap && !reduceMotion) {
    gsap.set(heroEls, { y: 24 });
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .to(heroEls, { opacity: 1, y: 0, duration: 1.1, stagger: 0.16, delay: 0.3 });

    /* subtle hero parallax on scroll */
    const heroMedia = document.querySelector('.hero-media video, .hero-media img');
    if (heroMedia && window.ScrollTrigger) {
      gsap.to(heroMedia, {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }
  } else {
    heroEls.forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
  }
}

/* ---------- Generic scroll-reveal (IntersectionObserver) ---------- */
function initScrollReveal(reduceMotion) {
  const revealTargets = document.querySelectorAll('.reveal, .reveal-photo, .route-card, .ministry-card, .sermon-card, .event-card, .give-card, .shop-card');
  if (reduceMotion) {
    revealTargets.forEach(el => el.classList.add('in-view'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });
    revealTargets.forEach((el, i) => {
      el.style.transitionDelay = reduceMotion ? '0ms' : `${(i % 4) * 90}ms`;
      io.observe(el);
    });
  }
}

/* ---------- Sermon series filter (sermons.html) ---------- */
function initSermonFilter() {
  const filterTabs = document.querySelectorAll('.filter-tab');
  const sermonCards = document.querySelectorAll('.sermon-card');
  const sermonEmpty = document.querySelector('.sermon-empty');
  if (!filterTabs.length || !sermonCards.length) return;

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const series = tab.dataset.series;
      let visibleCount = 0;
      sermonCards.forEach(card => {
        const match = series === 'all' || card.dataset.series === series;
        card.classList.toggle('is-hidden', !match);
        if (match) visibleCount++;
      });
      if (sermonEmpty) sermonEmpty.classList.toggle('is-visible', visibleCount === 0);
    });
  });
  const emptyReset = document.querySelector('.sermon-empty-reset');
  if (emptyReset) {
    emptyReset.addEventListener('click', () => {
      const allTab = Array.from(filterTabs).find(t => t.dataset.series === 'all');
      if (allTab) allTab.click();
    });
  }
}

/* ---------- Sermon data: fetched from the Worker's daily YouTube sync ----------
   /api/sermons is served by worker/index.js from a KV cache that a Cron
   Trigger refreshes once a day — see STEP-BY-STEP.md. This runs on both
   index.html (a small teaser linking to sermons.html) and sermons.html
   (the full featured panel + filterable grid), detected by which
   containers exist on the page. Never fake a result: if the fetch fails
   or KV hasn't synced yet, every render path falls back to an honest
   message linking straight to the YouTube channel. */
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@SelahChurchfxbg/featured';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function formatSermonDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function watchUrlFor(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function renderHomeSermonFeature(data) {
  const container = document.getElementById('homeSermonFeature');
  if (!container) return;
  const latest = data && data.latest;
  if (!latest) return; // static fallback markup already in the page is fine here

  const img = container.querySelector('.sermon-media img');
  const link = container.querySelector('.sermon-media');
  const eyebrow = container.querySelector('.sermon-copy .eyebrow');
  const heading = container.querySelector('.sermon-copy h3');
  const desc = container.querySelector('.sermon-copy p');
  if (img && latest.thumbnail) { img.src = latest.thumbnail; img.alt = latest.title; }
  if (link) link.href = 'sermons.html';
  if (eyebrow) eyebrow.textContent = `Latest Series · ${latest.seriesLabel}`;
  if (heading) heading.textContent = latest.title;
  if (desc) desc.textContent = `Posted ${formatSermonDate(latest.publishedAt)} — watch it or browse the full library.`;
}

function renderSermonFeaturePanel(data) {
  const container = document.getElementById('sermonFeature');
  if (!container) return;
  const latest = data && data.latest;

  if (!latest) {
    container.innerHTML = `
      <div class="sermon-copy">
        <span class="eyebrow">Latest Message</span>
        <h3>Couldn't load the latest message</h3>
        <p>Something went wrong pulling from YouTube just now — <a href="${YOUTUBE_CHANNEL_URL}" target="_blank" rel="noopener">watch on our channel</a> instead.</p>
        <a href="${YOUTUBE_CHANNEL_URL}" target="_blank" rel="noopener" class="btn btn-outline">Watch on YouTube</a>
      </div>`;
    return;
  }

  const url = watchUrlFor(latest.videoId);
  container.innerHTML = `
    <a href="${url}" target="_blank" rel="noopener" class="sermon-media reveal-photo is-organic">
      <img src="${latest.thumbnail || ''}" alt="${escapeHtml(latest.title)}" loading="lazy">
      <div class="play-button"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5Z"/></svg></span></div>
    </a>
    <div class="sermon-copy">
      <span class="eyebrow">Latest Message &middot; ${escapeHtml(latest.seriesLabel)}</span>
      <h3>${escapeHtml(latest.title)}</h3>
      <p>Posted ${formatSermonDate(latest.publishedAt)}.</p>
      <a href="${url}" target="_blank" rel="noopener" class="btn btn-outline">Watch now</a>
    </div>`;
}

function sermonCardHTML(video) {
  const url = watchUrlFor(video.videoId);
  return `
    <a href="${url}" target="_blank" rel="noopener" class="sermon-card" data-series="${escapeHtml(video.seriesSlug)}">
      <div class="thumb">
        <img src="${video.thumbnail || ''}" alt="" loading="lazy">
        <div class="play-button"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5Z"/></svg></span></div>
      </div>
      <span class="series-tag">${escapeHtml(video.seriesLabel)}</span>
      <h3>${escapeHtml(video.title)}</h3>
      <span class="date">${formatSermonDate(video.publishedAt)}</span>
    </a>`;
}

function renderSermonGrid(data) {
  const grid = document.getElementById('sermonGrid');
  if (!grid) return;

  const allVideos = (data && data.series ? data.series : [])
    .flatMap((s) => s.videos.map((v) => ({ ...v, seriesSlug: s.slug, seriesLabel: s.label })))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  if (!allVideos.length) {
    grid.innerHTML = `<p class="sermon-loading-note">Couldn't load messages right now — <a href="${YOUTUBE_CHANNEL_URL}" target="_blank" rel="noopener">visit our YouTube channel</a> instead.</p>`;
    return;
  }

  grid.innerHTML = allVideos.map(sermonCardHTML).join('');

  // These cards didn't exist when initScrollReveal/initSermonFilter first
  // ran at DOMContentLoaded — wire both up now for the freshly-inserted markup.
  initSermonFilter();
  const reduceMotion = getReducedMotionPreference();
  const newCards = grid.querySelectorAll('.sermon-card');
  if (reduceMotion) {
    newCards.forEach((el) => el.classList.add('in-view'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });
    newCards.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 90}ms`;
      io.observe(el);
    });
  }
}

async function initSermonData() {
  const needsHomeFeature = document.getElementById('homeSermonFeature');
  const needsFullPage = document.getElementById('sermonFeature') || document.getElementById('sermonGrid');
  if (!needsHomeFeature && !needsFullPage) return;

  let data = null;
  try {
    const res = await fetch('/api/sermons');
    if (res.ok) data = await res.json();
  } catch (e) {
    console.error('sermon data fetch failed', e);
  }

  try {
    if (needsHomeFeature) renderHomeSermonFeature(data);
    if (document.getElementById('sermonFeature')) renderSermonFeaturePanel(data);
    if (document.getElementById('sermonGrid')) renderSermonGrid(data);
  } catch (e) {
    console.error('sermon data render failed', e);
  }
}

/* ---------- Events: staff-editable via /admin (Decap CMS) ----------
   content/events.json is edited through the dashboard, not by hand — see
   STEP-BY-STEP.md and the USER-GUIDE.md handed to Luke's team. The static
   cards already in events.html's markup are the fallback: they're only
   left on screen if this fetch fails, never silently replaced with
   something misleading. */
function eventCardHTML(ev) {
  const hasDate = ev.date && !Number.isNaN(new Date(`${ev.date}T00:00:00`).getTime());
  const d = hasDate ? new Date(`${ev.date}T00:00:00`) : null;
  const month = d ? d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : 'TBD';
  const day = d ? String(d.getDate()) : '—';
  return `
    <div class="event-card">
      <div class="event-date"><span class="month">${escapeHtml(month)}</span><span class="day">${escapeHtml(day)}</span></div>
      <div class="event-info">
        <h3>${escapeHtml(ev.title)}</h3>
        <p>${escapeHtml(ev.description)}</p>
        <span class="event-meta">${escapeHtml(ev.meta || 'Time & location — TBD')}</span>
      </div>
    </div>`;
}

async function initEventsData() {
  const list = document.getElementById('eventList');
  if (!list) return;
  try {
    const res = await fetch('content/events.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      list.innerHTML = '<p class="sermon-loading-note">No events posted right now — check back soon.</p>';
      return;
    }
    list.innerHTML = items.map(eventCardHTML).join('');

    // These cards didn't exist when initScrollReveal first ran at
    // DOMContentLoaded — wire the reveal observer up now for the
    // freshly-inserted markup (same pattern as renderSermonGrid).
    const reduceMotion = getReducedMotionPreference();
    const newCards = list.querySelectorAll('.event-card');
    if (reduceMotion) {
      newCards.forEach((el) => el.classList.add('in-view'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.18 });
      newCards.forEach((el, i) => {
        el.style.transitionDelay = `${(i % 4) * 90}ms`;
        io.observe(el);
      });
    }
  } catch (e) {
    console.error('events fetch failed — leaving the static fallback cards in place', e);
  }
}

/* ---------- Form validation + confirmation (prayer/contact) ----------
   No backend exists yet (see the dev-note on each form). Telling the user
   it sent when it didn't is worse than telling them it doesn't work yet —
   so this reports the real state honestly and leaves their input intact
   rather than wiping a prayer request or message they'd have to retype.
   Real-time inline validation runs first so a user finds out about a typo
   before they're told the (still honest) news that submission isn't wired
   up — matching what real form validation would do once it is. */
function fieldLabel(field) {
  const label = field.closest('.form-field')?.querySelector('label');
  return label ? label.textContent.replace('*', '').replace(/\(.*\)/, '').trim() : 'This field';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clearFieldError(field) {
  const wrap = field.closest('.form-field');
  if (!wrap) return;
  wrap.classList.remove('has-error');
  field.removeAttribute('aria-invalid');
  const err = wrap.querySelector('.field-error');
  if (err) err.textContent = '';
}

function showFieldError(field, message) {
  const wrap = field.closest('.form-field');
  if (!wrap) return;
  wrap.classList.add('has-error');
  field.setAttribute('aria-invalid', 'true');
  let err = wrap.querySelector('.field-error');
  if (!err) {
    err = document.createElement('span');
    err.className = 'field-error';
    err.id = field.id + '-error';
    err.setAttribute('role', 'alert');
    wrap.appendChild(err);
  }
  err.textContent = message;
  field.setAttribute('aria-describedby', err.id);
}

function validateForm(form) {
  const invalid = [];
  form.querySelectorAll('[required], input[type="email"]').forEach((field) => {
    clearFieldError(field);
    let message = '';
    if (field.required && !field.value.trim()) {
      message = `${fieldLabel(field)} is required.`;
    } else if (field.type === 'email' && field.value.trim() && !isValidEmail(field.value.trim())) {
      message = 'Enter a valid email address.';
    }
    if (message) {
      showFieldError(field, message);
      invalid.push(field);
    }
  });
  return invalid;
}

// Google Apps Script Web App URL — see google-apps-script/README.md.
// Leave blank locally; forms fall back to the "not connected yet" message.
const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbziXtOG-ZQdg4vFqecgHKqE_7T1b6Ww3DPPbE8l8SX6N1-L9FLK1jLmYSrqlc5qWwpr/exec';

function initFormConfirm() {
  document.querySelectorAll('form[data-inline-confirm]').forEach((form) => {
    form.querySelectorAll('[required], input[type="email"]').forEach((field) => {
      field.addEventListener('input', () => clearFieldError(field));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const invalidFields = validateForm(form);
      if (invalidFields.length) {
        invalidFields[0].focus();
        return;
      }
      submitForm(form);
    });
  });
}

async function submitForm(form) {
  const note = form.querySelector('.form-note');
  const submitBtn = form.querySelector('button[type="submit"]');

  const setNote = (text) => {
    if (!note) return;
    note.textContent = text;
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
  };

  if (!FORM_ENDPOINT) {
    setNote("This form isn't connected yet, so we can't receive it this way — nothing was lost, your answers are still here. In the meantime, reach out through Instagram or Facebook in the footer.");
    return;
  }

  const payload = { formType: form.dataset.formType };
  new FormData(form).forEach((value, key) => {
    payload[key] = value;
  });
  const confidentialField = form.querySelector('input[name="confidential"]');
  if (confidentialField) {
    payload.confidential = confidentialField.checked;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sending…';
  }

  try {
    // Apps Script web apps redirect POSTs through script.googleusercontent.com
    // to deliver the response, and that hop's CORS headers are unreliable —
    // fetch can report "Failed to fetch" even when Apps Script already ran
    // to completion and saved/emailed the submission. mode: 'no-cors' sends
    // the request without asking the browser to expose that response back to
    // JS, so we can't read a real success/failure status, but the request
    // still reaches the script every time. A true network-level failure
    // (offline, DNS, etc.) still throws and hits the catch block below.
    // text/plain keeps this a CORS "simple request" so no OPTIONS preflight
    // is sent; the server still parses the body as JSON.
    await fetch(FORM_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    form.reset();
    form.querySelectorAll('input, textarea, button').forEach((el) => { el.disabled = true; });
    setNote("Thank you — this was sent successfully. We'll be in touch soon.");
  } catch (err) {
    console.error('Form submission failed', err);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalText || 'Submit';
    }
    setNote("Something went wrong sending this — please try again, or reach out through Instagram or Facebook in the footer.");
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = getReducedMotionPreference();

  // Each feature initializes independently — one throwing doesn't take down
  // the rest of the page's interactivity (nav, forms, filters, animations).
  const features = [
    ['hero video', () => initHeroVideo(reduceMotion)],
    ['header scroll', initHeaderScroll],
    ['mobile nav', initMobileNav],
    ['active nav highlight', initActiveNavHighlight],
    ['hero entrance', () => initHeroEntrance(reduceMotion)],
    ['scroll reveal', () => initScrollReveal(reduceMotion)],
    ['sermon filter', initSermonFilter],
    ['form confirm', initFormConfirm],
    ['sermon data', initSermonData],
    ['events data', initEventsData],
  ];

  features.forEach(([name, init]) => {
    try {
      init();
    } catch (e) {
      console.error(`${name} init failed`, e);
    }
  });
});
