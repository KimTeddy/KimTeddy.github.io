// about-hobbies.js — Interactive auto-playing tabs for Hobbies section
(function() {
  const tabs = document.querySelectorAll('.hobby-tab');
  const panels = document.querySelectorAll('.hobby-panel');
  const progressBar = document.querySelector('.hobby-progress-bar');
  let currentIndex = -1; // init state
  let autoPlayTimer;
  const autoPlayDelay = 5000; // 5 seconds

  function switchTab(index, userAction = false) {
    if (index === currentIndex) return;
    
    if (currentIndex >= 0) {
      tabs[currentIndex].classList.remove('active');
      panels[currentIndex].classList.remove('active');
    }
    
    currentIndex = index;
    
    tabs[currentIndex].classList.add('active');
    panels[currentIndex].classList.add('active');
    
    resetProgressBar();
    
    if (userAction) {
      resetAutoPlay();
    }
  }

  function resetProgressBar() {
    if (!progressBar) return;
    progressBar.style.animation = 'none';
    progressBar.offsetHeight; // trigger reflow
    progressBar.style.animation = `hobbyProgress ${autoPlayDelay}ms linear forwards`;
  }

  function startAutoPlay() {
    resetProgressBar();
    autoPlayTimer = setInterval(() => {
      const nextIndex = (currentIndex + 1) % tabs.length;
      switchTab(nextIndex, false);
    }, autoPlayDelay);
  }

  function resetAutoPlay() {
    clearInterval(autoPlayTimer);
    startAutoPlay();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => switchTab(index, true));
  });

  if (tabs.length > 0) {
    switchTab(0, false);
    startAutoPlay();
  }
})();
