/* animations.js — IntersectionObserver-based scroll animations */
(function() {
  var observer;

  function createObserver() {
    observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });
  }

  function observeAll() {
    var elements = document.querySelectorAll('[data-animate]:not(.is-visible)');
    elements.forEach(function(el) { observer.observe(el); });
  }

  function init() {
    createObserver();
    observeAll();

    // Expose globally so YAML loaders can trigger re-observation
    window.reinitAnimations = function() {
      observeAll();
    };

    // Also watch for DOM changes with MutationObserver
    var mutObs = new MutationObserver(function(mutations) {
      var hasNew = false;
      mutations.forEach(function(m) {
        if (m.addedNodes.length) hasNew = true;
      });
      if (hasNew) observeAll();
    });
    mutObs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
