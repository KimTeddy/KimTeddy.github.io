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
      toggleBtn.innerHTML = theme === 'light' ? '<span class="theme-icon">🌙</span>' : '<span class="theme-icon">☀️</span>';
      toggleBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    }
  }

  function toggleTheme(e) {
    const isLight = document.body.classList.contains('light-mode');
    const newTheme = isLight ? 'dark' : 'light';
    
    // Check if View Transitions API is supported
    if (!document.startViewTransition) {
      applyTheme(newTheme);
      localStorage.setItem(STORAGE_KEY, newTheme);
      return;
    }

    const toggle = e.target.closest('.theme-toggle');
    const rect = toggle.getBoundingClientRect();
    // Use actual click/touch coordinates for accuracy on mobile;
    // fall back to button center for keyboard activation (clientX/Y = 0)
    const x = (e.clientX || e.clientY) ? e.clientX : rect.left + rect.width / 2;
    const y = (e.clientX || e.clientY) ? e.clientY : rect.top + rect.height / 2;
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    // Disable nav's own CSS transition to prevent double-animation flicker
    const nav = document.querySelector('.nav');
    if (nav) nav.style.transition = 'none';

    const transition = document.startViewTransition(() => {
      applyTheme(newTheme);
      localStorage.setItem(STORAGE_KEY, newTheme);
    });

    transition.finished.then(() => {
      if (nav) nav.style.transition = '';
    });

    transition.ready.then(() => {
      // Add a quick flash if switching to light mode
      if (newTheme === 'light') {
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:100000;pointer-events:none;opacity:0.8;';
        document.body.appendChild(flash);
        flash.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 400, easing: 'ease-out' }).onfinish = () => flash.remove();
      }

      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];
      document.documentElement.animate(
        {
          clipPath: isLight ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 700,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: isLight ? '::view-transition-old(root)' : '::view-transition-new(root)',
        }
      );
    });
  }

  function getStoredTheme() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function init() {
    const stored = getStoredTheme();
    const theme = stored || 'dark';
    applyTheme(theme);

    document.addEventListener('click', function(e) {
      if (e.target.closest('.theme-toggle')) {
        toggleTheme(e);
      }
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function(e) {
      if (!getStoredTheme()) {
        applyTheme(e.matches ? 'light' : 'dark');
      }
    });
  }

  // Run immediately to prevent flash
  if (getStoredTheme() === 'light') {
    document.body.classList.add('light-mode');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
