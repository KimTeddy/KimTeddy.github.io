/* theme.js — Dark/Light mode toggle with localStorage persistence */
(function() {
  const STORAGE_KEY = 'teddy-theme';

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
    // Update toggle button icon
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
      toggleBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    }
  }

  function getStoredTheme() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function init() {
    const stored = getStoredTheme();
    const theme = stored || getSystemTheme();
    applyTheme(theme);

    // Listen for toggle clicks
    document.addEventListener('click', function(e) {
      const toggle = e.target.closest('.theme-toggle');
      if (!toggle) return;
      const isLight = document.body.classList.contains('light-mode');
      const newTheme = isLight ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, newTheme);
      applyTheme(newTheme);
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function(e) {
      if (!getStoredTheme()) {
        applyTheme(e.matches ? 'light' : 'dark');
      }
    });
  }

  // Run immediately to prevent flash
  const stored = getStoredTheme();
  if (stored === 'light') {
    document.body.classList.add('light-mode');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
