document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero video: reduced motion, mobile bandwidth, tab visibility ---------- */
  const heroVideo = document.getElementById('heroVideo');
  if (heroVideo) {
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
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav toggle ---------- */
  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      const open = navToggle.classList.toggle('open');
      mobileNav.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', open);
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      navToggle.classList.remove('open');
      mobileNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', false);
      navToggle.setAttribute('aria-label', 'Open menu');
    }));
  }

  /* ---------- Highlight the current page in the nav ---------- */
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a, .mobile-nav a').forEach(link => {
    const linkPath = link.getAttribute('href');
    if (linkPath === currentPath || (currentPath === '' && linkPath === 'index.html')) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  /* ---------- Hero entrance sequence ---------- */
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

  /* ---------- Generic scroll-reveal (IntersectionObserver) ---------- */
  const revealTargets = document.querySelectorAll('.reveal, .route-card, .ministry-card, .pause-divider, .sermon-card, .event-card, .give-card');
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

  /* ---------- Sermon series filter (sermons.html) ---------- */
  const filterTabs = document.querySelectorAll('.filter-tab');
  const sermonCards = document.querySelectorAll('.sermon-card');
  if (filterTabs.length && sermonCards.length) {
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const series = tab.dataset.series;
        sermonCards.forEach(card => {
          const match = series === 'all' || card.dataset.series === series;
          card.classList.toggle('is-hidden', !match);
        });
      });
    });
  }

  /* ---------- Simple in-page form confirmation (prayer/contact) ---------- */
  document.querySelectorAll('form[data-inline-confirm]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const note = form.querySelector('.form-note');
      if (note) note.textContent = 'Thanks — this has been sent. Someone from our team will follow up soon.';
      form.reset();
    });
  });
});
