// Shared site footer — injected into <div id="site-footer"></div>
document.getElementById('site-footer').innerHTML = `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <svg class="pause-mark" viewBox="0 0 40 40" aria-hidden="true">
        <line x1="8" y1="6" x2="8" y2="34"></line>
        <line x1="32" y1="6" x2="32" y2="34"></line>
        <line x1="8" y1="20" x2="32" y2="20"></line>
      </svg>
      <span class="brand-word">SELAH</span>
      <p class="footer-tagline">The church was made for family.</p>
    </div>

    <div class="footer-col">
      <span class="footer-heading">Visit</span>
      <p>316 Forbes Street<br>Fredericksburg, VA</p>
      <p class="footer-times">Sundays &middot; <span class="tbd">[confirm time]</span></p>
    </div>

    <div class="footer-col">
      <span class="footer-heading">Explore</span>
      <a href="about.html">About</a>
      <a href="ministries.html">Ministries</a>
      <a href="sermons.html">Sermons</a>
      <a href="give.html">Give</a>
    </div>

    <div class="footer-col">
      <span class="footer-heading">Connect</span>
      <a href="https://www.instagram.com/selahchurchfxbg/" target="_blank" rel="noopener">Instagram</a>
      <a href="#" target="_blank" rel="noopener">Facebook</a>
      <a href="prayer.html">Prayer Request</a>
      <a href="visit.html">Contact</a>
    </div>
  </div>

  <div class="footer-bottom">
    <span>&copy; ${new Date().getFullYear()} Selah Church. All rights reserved.</span>
  </div>
</footer>
`;
