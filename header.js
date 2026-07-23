// Shared site header — injected into <div id="site-header"></div>
document.getElementById('site-header').innerHTML = `
<header class="site-header" id="siteHeader">
  <div class="header-inner">
    <a href="index.html" class="brand" aria-label="Selah Church home">
      <svg class="pause-mark" viewBox="0 0 40 40" aria-hidden="true">
        <line x1="8" y1="6" x2="8" y2="34"></line>
        <line x1="32" y1="6" x2="32" y2="34"></line>
        <line x1="8" y1="20" x2="32" y2="20"></line>
      </svg>
      <span class="brand-word">SELAH</span>
    </a>

    <nav class="main-nav" aria-label="Primary">
      <a href="about.html">About</a>
      <a href="ministries.html">Ministries</a>
      <a href="sermons.html">Sermons</a>
      <a href="events.html">Events</a>
      <a href="visit.html">Plan a Visit</a>
    </nav>

    <div class="header-actions">
      <a href="give.html" class="btn btn-gold btn-small">Give</a>
      <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>

  <nav class="mobile-nav" id="mobileNav" aria-label="Mobile">
    <a href="about.html">About</a>
    <a href="ministries.html">Ministries</a>
    <a href="sermons.html">Sermons</a>
    <a href="events.html">Events</a>
    <a href="visit.html">Plan a Visit</a>
    <a href="give.html" class="btn btn-gold">Give</a>
  </nav>
</header>
`;
