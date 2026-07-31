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
  const revealTargets = document.querySelectorAll('.reveal, .reveal-photo, .route-card, .ministry-card, .pause-divider, .sermon-card, .event-card, .give-card');
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
      const note = form.querySelector('.form-note');
      if (note) {
        note.textContent = "This form isn't connected yet, so we can't receive it this way — nothing was lost, your answers are still here. In the meantime, reach out through Instagram or Facebook in the footer.";
        note.setAttribute('role', 'status');
        note.setAttribute('aria-live', 'polite');
      }
    });
  });
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
  ];

  features.forEach(([name, init]) => {
    try {
      init();
    } catch (e) {
      console.error(`${name} init failed`, e);
    }
  });
});
