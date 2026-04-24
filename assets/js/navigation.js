/* navigation.js — Common navigation logic for all pages */
(function () {
  function init() {
    highlightCurrentPage();
    initBurgerMenu();
    initScrollProgress();
    initBackToTop();
    loadFooter();
  }

  function highlightCurrentPage() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    document.querySelectorAll('.nav__link').forEach(function (link) {
      const href = link.getAttribute('href');
      if (href === filename || (filename === 'index.html' && href === './') || (filename === '' && href === './')) {
        link.classList.add('active');
      }
    });
  }

  function initBurgerMenu() {
    const burger = document.querySelector('.nav__burger');
    const mobileMenu = document.querySelector('.nav__mobile-menu');
    if (!burger || !mobileMenu) return;

    burger.addEventListener('click', function () {
      burger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
    });

    // Close on link click
    mobileMenu.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', function () {
        burger.classList.remove('open');
        mobileMenu.classList.remove('open');
      });
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!burger.contains(e.target) && !mobileMenu.contains(e.target)) {
        burger.classList.remove('open');
        mobileMenu.classList.remove('open');
      }
    });
  }

  function initScrollProgress() {
    const bar = document.querySelector('.nav__progress');
    if (!bar) return;
    window.addEventListener('scroll', function () {
      const scrollH = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollH > 0) {
        bar.style.width = ((window.scrollY / scrollH) * 100) + '%';
      }
    }, { passive: true });
  }

  function initBackToTop() {
    const btn = document.querySelector('.back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', function () {
      if (window.scrollY > 400) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
      // Push button above footer when overlapping
      var footer = document.querySelector('.footer');
      if (footer) {
        var footerTop = footer.getBoundingClientRect().top;
        var viewportH = window.innerHeight;
        var btnBottom = 32; // default --space-8
        if (footerTop < viewportH) {
          btn.style.bottom = (viewportH - footerTop + 16) + 'px';
        } else {
          btn.style.bottom = '';
        }
      }
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function loadFooter() {
    const placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return;
    fetch('footer.html')
      .then(function (r) { return r.text(); })
      .then(function (html) { placeholder.innerHTML = html; })
      .catch(function () { });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
