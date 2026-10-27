// Runs before the app loads so the page never flashes the wrong theme.
(function () {
  var pref = 'system';
  try {
    pref = localStorage.getItem('moc-theme') || 'system';
  } catch (e) {
    /* storage unavailable */
  }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
