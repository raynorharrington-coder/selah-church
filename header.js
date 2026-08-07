// Shared site header — injected into <div id="site-header"></div>

/* Nav structure, defined once and rendered into both the desktop bar and the
   mobile drawer so the two can't drift apart. A section with `items` becomes a
   dropdown; one with `href` is a plain link. Section labels are deliberately
   not links — every destination under them is a real page, so a clickable
   parent would only ever be a duplicate of its own first child. */
const NAV_SECTIONS = [
  { label: 'About Us', id: 'about', items: [
    { href: 'our-team.html', label: 'Our Team' },
    { href: 'our-beliefs.html', label: 'Our Beliefs' },
    { href: 'our-beginning.html', label: 'Our Beginning' },
  ] },
  { label: 'Connect', id: 'connect', items: [
    { href: 'cadre.html', label: 'Cadre' },
    { href: 'small-groups.html', label: 'Small Groups' },
    { href: 'shabbat-dinners.html', label: 'Shabbat Dinner Groups' },
    { href: 'serve.html', label: 'Serve' },
    { href: 'prayer.html', label: 'Prayer Request' },
  ] },
  { label: 'Youth', id: 'youth', items: [
    { href: 'students.html', label: 'Students' },
    { href: 'selah-kids.html', label: 'Selah Kids' },
  ] },
  { href: 'sermons.html', label: 'Sermons' },
  { href: 'events.html', label: 'Events' },
  { label: 'First Steps', id: 'first-steps', items: [
    { href: 'visit.html', label: 'Plan a Visit' },
    { href: 'contact.html', label: 'Contact Us' },
  ] },
];

const CHEVRON = '<svg class="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function desktopNavItem(section) {
  if (section.href) return `<a href="${section.href}">${section.label}</a>`;
  return `<div class="nav-group">
        <button type="button" class="nav-trigger" aria-expanded="false" aria-controls="navmenu-${section.id}">${section.label}${CHEVRON}</button>
        <div class="nav-menu" id="navmenu-${section.id}">
          ${section.items.map(i => `<a href="${i.href}">${i.label}</a>`).join('\n          ')}
        </div>
      </div>`;
}

function mobileNavItem(section) {
  if (section.href) return `<a href="${section.href}">${section.label}</a>`;
  return `<div class="mobile-nav-group">
      <button type="button" class="mobile-nav-trigger" aria-expanded="false" aria-controls="mobilemenu-${section.id}">${section.label}${CHEVRON}</button>
      <div class="mobile-nav-menu" id="mobilemenu-${section.id}">
        ${section.items.map(i => `<a href="${i.href}">${i.label}</a>`).join('\n        ')}
      </div>
    </div>`;
}

document.getElementById('site-header').insertAdjacentHTML('beforebegin',
  '<a href="#main-content" class="skip-link">Skip to main content</a>'
);
document.getElementById('site-header').innerHTML = `
<header class="site-header" id="siteHeader">
  <div class="header-inner">
    <a href="index.html" class="brand" aria-label="Selah Church home">
      <svg class="brand-logo" viewBox="0 0 852.8 328.78" role="img" aria-label="Selah Church"><defs><style>.cls-1{fill:#fffffc;stroke-width:0px;}</style></defs><path class="cls-1" d="M269.98,150.43l-97.85-81.43c-1.39-1.16-3.41-1.16-4.8,0l-47.28,39.34v-19.68c0-2.07-1.68-3.75-3.75-3.75s-3.75,1.68-3.75,3.75v25.92l-43.08,35.85c-1.59,1.32-1.81,3.69-.48,5.28,1.32,1.59,3.69,1.81,5.28.48l11.57-9.63v113.09c0,2.07,1.68,3.75,3.75,3.75h160.27c2.07,0,3.75-1.68,3.75-3.75v-113.09l11.57,9.63c.7.58,1.55.87,2.4.87,1.08,0,2.14-.46,2.88-1.35,1.32-1.59,1.11-3.96-.48-5.28ZM146.77,255.9v-72.48h45.92v72.48h-45.92ZM246.12,255.9h-45.92v-76.23c0-2.07-1.68-3.75-3.75-3.75h-53.42c-2.07,0-3.75,1.68-3.75,3.75v76.23h-45.92v-115.58l76.39-63.57,76.39,63.57v115.58Z"/><path class="cls-1" d="M351.96,152.47c8.7,0,14.69-4.22,14.69-12.38,0-7.34-4.9-9.79-12.92-13.06l-14.69-5.85c-10.2-4.08-17-11.29-17-22.71,0-16.32,12.78-27.61,32.5-27.61,13.33,0,22.98,5.58,28.56,11.29l-8.43,12.65c-5.98-5.44-13.19-9.38-21.22-9.38s-13.87,3.81-13.87,10.74,5.46,9.26,10.74,11.42l15.64,6.39c13.19,5.44,18.36,12.78,18.36,24.48,0,17.41-12.78,28.97-32.64,28.97-16.05,0-27.06-7.48-33.18-14.55l8.43-12.78c7.34,8.02,16.18,12.38,25.02,12.38Z"/><path class="cls-1" d="M474.46,71.96v14.69h-40.26v23.26h37.94v14.55h-37.94v26.66h41.34v14.69h-59.02v-93.84h57.94Z"/><path class="cls-1" d="M526.9,71.96v79.15h32.78v14.69h-50.32v-93.84h17.54Z"/><path class="cls-1" d="M637.19,71.82l36.86,93.98h-19.31l-8.16-21.62h-36.86l-8.16,21.62h-18.36l36.86-93.98h17.14ZM628.22,92.09l-14.14,37.94h28.15l-14.01-37.94Z"/><path class="cls-1" d="M701.25,71.96h17.68v37.54h43.79v-37.54h17.54v93.84h-17.54v-41.48h-43.79v41.48h-17.68v-93.84Z"/><path class="cls-1" d="M347.62,260.65c-17.08,0-29.92-11.98-29.92-30.26s13.17-30.26,30-30.26c10.97,0,17.6,4.59,20.83,7.73l-3.49,6.63c-2.29-2.89-8.84-7.14-17-7.14-12.67,0-21.84,9.09-21.84,22.86s9.26,22.86,21.84,22.86c7.73,0,13.68-2.98,17.51-7.14l3.57,6.04c-3.65,4.08-10.37,8.67-21.5,8.67Z"/><path class="cls-1" d="M405.15,200.98h8.25v24.22h31.19v-24.22h8.25v58.65h-8.25v-27.37h-31.19v27.37h-8.25v-58.65Z"/><path class="cls-1" d="M504.78,248.07c2.38,3.23,6.2,5.19,11.3,5.19s8.84-1.96,11.3-5.19c2.64-3.48,2.72-8.33,2.72-13.17v-33.91h8.25v34.68c0,7.31-.68,13.09-4.68,17.85-3.99,4.59-9.86,7.14-17.59,7.14s-13.68-2.55-17.59-7.14c-4.08-4.76-4.76-10.54-4.76-17.85v-34.68h8.33v33.91c0,4.93.08,9.69,2.72,13.17Z"/><path class="cls-1" d="M609.89,205.06c3.48,2.8,5.69,7.05,5.69,12.41s-1.86,9.02-4.51,11.61c-2.54,2.48-5.8,3.87-8.83,4.46l16.75,26.09h-9.95l-15.3-25.24h-6.29v25.24h-8.25v-58.65h16.57c5.87,0,10.62,1.36,14.11,4.08ZM603.34,225.55c2.64-1.96,3.74-4.33,3.74-7.91s-1.1-5.95-3.74-7.82c-2.63-1.96-5.78-2.12-9.86-2.12h-6.03v19.89h6.03c4.08,0,7.23-.17,9.86-2.04Z"/><path class="cls-1" d="M679.46,260.65c-17.08,0-29.92-11.98-29.92-30.26s13.17-30.26,30-30.26c10.97,0,17.6,4.59,20.83,7.73l-3.49,6.63c-2.29-2.89-8.84-7.14-17-7.14-12.67,0-21.84,9.09-21.84,22.86s9.26,22.86,21.84,22.86c7.73,0,13.68-2.98,17.51-7.14l3.57,6.04c-3.65,4.08-10.37,8.67-21.5,8.67Z"/><path class="cls-1" d="M736.99,200.98h8.25v24.22h31.19v-24.22h8.25v58.65h-8.25v-27.37h-31.19v27.37h-8.25v-58.65Z"/></svg>
    </a>

    <nav class="main-nav" aria-label="Primary">
      ${NAV_SECTIONS.map(desktopNavItem).join('\n      ')}
    </nav>

    <div class="header-actions">
      <a href="give.html" class="btn btn-gold btn-small">Give</a>
      <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>

  <nav class="mobile-nav" id="mobileNav" aria-label="Mobile">
    ${NAV_SECTIONS.map(mobileNavItem).join('\n    ')}
    <a href="give.html" class="btn btn-gold">Give</a>
  </nav>
</header>
`;

/* Dropdown behaviour for both navs.

   One state flag (`is-open`) drives everything, including hover — CSS
   :hover alone can't work here, because a closed menu has to be `inert` to
   stay out of the tab order, and `inert` also swallows pointer events, so a
   CSS-only hover would show a menu nobody could click. Hover is bound only
   on real pointing devices; touch and keyboard fall through to click. */
function initNavDropdowns() {
  const groups = [
    ...document.querySelectorAll('.nav-group'),
    ...document.querySelectorAll('.mobile-nav-group'),
  ];
  if (!groups.length) return;

  const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const entries = groups.map((group) => {
    const trigger = group.querySelector('button');
    const menu = group.querySelector('.nav-menu, .mobile-nav-menu');
    const entry = { group, trigger, menu, hoverOpened: false };
    entry.set = (open) => {
      group.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
      menu.inert = !open;
      if (!open) entry.hoverOpened = false;
    };
    entry.set(false);
    return entry;
  });

  const closeAll = (except) => entries.forEach((e) => { if (e !== except) e.set(false); });

  entries.forEach((entry) => {
    const { group, trigger, set } = entry;

    trigger.addEventListener('click', () => {
      // On a mouse, the menu is already open by the time the click lands —
      // hovering opened it. Toggling here would slam it shut under the
      // pointer, so leave it alone and let mouseleave do the closing.
      if (entry.hoverOpened) return;
      const open = !group.classList.contains('is-open');
      closeAll(entry);
      set(open);
    });

    if (hasHover && group.classList.contains('nav-group')) {
      group.addEventListener('mouseenter', () => {
        closeAll(entry);
        entry.hoverOpened = true;
        set(true);
      });
      group.addEventListener('mouseleave', () => {
        entry.hoverOpened = false;
        set(false);
      });
    }

    // Tabbing out the far end of a menu should close it behind you, the same
    // way moving the mouse away does. relatedTarget is null when focus leaves
    // the document entirely — don't treat that as "moved somewhere else".
    group.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !group.contains(e.relatedTarget)) set(false);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = entries.find((entry) => entry.group.classList.contains('is-open'));
    if (open) {
      open.set(false);
      open.trigger.focus();
      // header.js binds before script.js, so this runs first: inside the
      // mobile drawer, the first Escape closes the open submenu and the
      // second one closes the drawer, rather than both at once.
      e.stopImmediatePropagation();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-group, .mobile-nav-group')) closeAll();
  });
}

initNavDropdowns();
