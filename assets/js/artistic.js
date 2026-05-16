/**
 * artistic.js — High-end artistic interactions
 * Includes: Magnetic Elements, Parallax, Custom Cursor
 */

(function() {
  // 0. Inject Background Elements
  function injectBackground() {
    if (document.querySelector('.noise-overlay')) return;
    
    const noise = document.createElement('div');
    noise.className = 'noise-overlay';
    
    const blobs = document.createElement('div');
    blobs.className = 'bg-blobs';
    blobs.innerHTML = `
      <div class="blob blob--1"></div>
      <div class="blob blob--2"></div>
      <div class="blob blob--3"></div>
    `;
    
    document.body.prepend(blobs);
    document.body.prepend(noise);
  }

  // 1. Magnetic Buttons
  function initMagneticElements() {
    const magneticElements = document.querySelectorAll('.btn, .nav__link, .stat-item, .tech-chip');
    
    magneticElements.forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
        if (el.classList.contains('btn')) {
           el.style.transition = 'transform 0.1s ease-out';
        }
      });
      
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
        el.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
      });
    });
  }

  // 2. Reveal Stagger (Improved)
  function initTextReveals() {
    const targets = document.querySelectorAll('h1, .hero__greeting, .section-title');
    targets.forEach(target => {
      target.setAttribute('data-animate', 'fade-up');
    });
  }

  // 3. Custom Cursor
  function initCustomCursor() {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);

    const follower = document.createElement('div');
    follower.className = 'custom-cursor-follower';
    
    const cursorLabel = document.createElement('span');
    cursorLabel.className = 'cursor-label';
    follower.appendChild(cursorLabel);

    document.body.appendChild(follower);

    let mouseX = 0, mouseY = 0;
    let lastMouseX = 0, lastMouseY = 0;
    let mouseVelX = 0, mouseVelY = 0;
    let followerX = 0, followerY = 0;
    let firstMove = true;
    let isFalling = false;
    let velX = 0, velY = 0;
    const gravity = 0.5;
    const bounce = -0.7;
    const friction = 0.995; // Reduced air resistance
    const groundFriction = 0.98; // Reduced ground friction

    // Expose cursor ball state globally for pixel-pet interaction
    window.__cursorBall = { x: 0, y: 0, vx: 0, vy: 0, isFalling: false, radius: 16,
      applyImpulse: function(dvx, dvy) {
        if (isFalling) { velX += dvx; velY += dvy; }
      }
    };

    function animateFollower() {
      if (firstMove) {
        requestAnimationFrame(animateFollower);
        return;
      }

      if (isFalling) {
        velY += gravity;
        velX *= friction; // Air resistance
        followerX += velX;
        followerY += velY;

        const radius = 16;
        // Bounce off bottom
        if (followerY > window.innerHeight - radius) {
          followerY = window.innerHeight - radius;
          velY *= bounce;
          velX *= groundFriction; // Ground friction
        }
        // Bounce off sides
        if (followerX < radius) {
          followerX = radius;
          velX *= bounce;
        } else if (followerX > window.innerWidth - radius) {
          followerX = window.innerWidth - radius;
          velX *= bounce;
        }
        
        // Stop tiny jitters
        if (Math.abs(velY) < 0.1 && followerY > window.innerHeight - radius - 1) {
          velY = 0;
        }
        if (Math.abs(velX) < 0.1) {
          velX = 0;
        }
      } else {
        followerX += (mouseX - followerX) * 0.1;
        followerY += (mouseY - followerY) * 0.1;
      }
      
      let finalX = followerX;
      let finalY = followerY;

      // Clamp position strictly within viewport when message is visible
      if (cursorLabel.classList.contains('is-visible') && !isFalling) {
        const radius = 50; 
        finalX = Math.max(radius, Math.min(window.innerWidth - radius, finalX));
        finalY = Math.max(radius, Math.min(window.innerHeight - radius, finalY));
        follower.style.background = 'rgba(10, 10, 15, 0.9)'; 
        follower.style.borderColor = 'var(--accent-primary)';
      } else if (!isFalling) {
        follower.style.background = ''; 
        follower.style.borderColor = '';
      }

      // Sync global cursor ball state for pixel-pet interaction
      window.__cursorBall.x = finalX;
      window.__cursorBall.y = finalY;
      window.__cursorBall.vx = isFalling ? velX : 0;
      window.__cursorBall.vy = isFalling ? velY : 0;
      window.__cursorBall.isFalling = isFalling;

      follower.style.transform = `translate3d(${finalX}px, ${finalY}px, 0) translate(-50%, -50%)`;
      // Cursor dot also follows physics
      if (isFalling) {
        cursor.style.transform = `translate3d(${finalX}px, ${finalY}px, 0) translate(-50%, -50%)`;
      }
      requestAnimationFrame(animateFollower);
    }

    window.addEventListener('mousemove', (e) => {
      mouseVelX = e.clientX - lastMouseX;
      mouseVelY = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      mouseX = e.clientX;
      mouseY = e.clientY;
      isFalling = false;
      velX = 0; velY = 0;
      if (firstMove) {
        followerX = mouseX;
        followerY = mouseY;
        follower.style.opacity = '1';
        cursor.style.opacity = '1';
        firstMove = false;
      }
      cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    });

    document.addEventListener('mouseleave', () => {
      isFalling = true;
      // Inherit velocity from mouse movement (Inertia)
      velX = mouseVelX;
      velY = mouseVelY;
    });

    document.addEventListener('mouseenter', (e) => {
      isFalling = false;
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    animateFollower();

    // Hover states (Event Delegation for improved reliability across all pages)
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('a, button, .card, .tech-chip, .stat-item, [role="button"], .hobby-card, .project-cta__btn, .hardware-item, .flowchart-item, .nav__link');
      if (el) {
        follower.classList.add('is-hovering');
        cursor.classList.add('is-hovering');
        
        // Special label for theme toggle in dark mode
        if (el.classList.contains('theme-toggle') && !document.body.classList.contains('light-mode')) {
          cursorLabel.textContent = '🕶️ 눈뽕 주의!';
          cursorLabel.classList.add('is-visible');
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      const el = e.target.closest('a, button, .card, .tech-chip, .stat-item, [role="button"], .hobby-card, .project-cta__btn, .hardware-item, .flowchart-item, .nav__link');
      if (el) {
        follower.classList.remove('is-hovering');
        cursor.classList.remove('is-hovering');
        cursorLabel.classList.remove('is-visible');
      }
    });

    // Special click handler for theme toggle to clear labels
    document.addEventListener('click', (e) => {
      const el = e.target.closest('.theme-toggle');
      if (el) {
        cursorLabel.classList.remove('is-visible');
        follower.classList.remove('is-hovering');
        cursor.classList.remove('is-hovering');
      }
    });
  }

  // 4. Card Tilt Effect (Smoothed & Sync with Shine)
  function initCardTilt() {
    // Only apply to Home, About, Skills
    const path = window.location.pathname;
    const page = path.split("/").pop();
    const allowed = ["", "index.html", "about.html", "skills.html"];
    if (!allowed.includes(page)) return;

    document.body.classList.add('js-tilt-enabled');

    const cards = document.querySelectorAll('.card:not(.stat-item)');
    cards.forEach(card => {
      let state = {
        targetX: 0, targetY: 0,
        currentX: 0, currentY: 0,
        isHovered: false
      };

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        state.isHovered = true;
        const factor = card.classList.contains('card--tilt-subtle') ? 80 : 10;
        state.targetY = (x - centerX) / factor;
        state.targetX = (centerY - y) / factor;
      });

      card.addEventListener('mouseleave', () => {
        state.isHovered = false;
        state.targetX = 0;
        state.targetY = 0;
      });

      function update() {
        // Smoothing (lerp)
        state.currentX += (state.targetX - state.currentX) * 0.1;
        state.currentY += (state.targetY - state.currentY) * 0.1;

        const rotateX = state.currentX;
        const rotateY = state.currentY;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${state.isHovered ? 1.01 : 1}, ${state.isHovered ? 1.01 : 1}, ${state.isHovered ? 1.01 : 1})`;
        
        // Sync shine with the smoothed rotation
        const shineX = 50 + (rotateY * 4);
        const shineY = 50 - (rotateX * 4);
        card.style.setProperty('--shine-x', `${shineX}%`);
        card.style.setProperty('--shine-y', `${shineY}%`);

        requestAnimationFrame(update);
      }
      update();
    });
  }

  // 5. Page Transitions
  function initPageTransitions() {
    const transitionOverlay = document.createElement('div');
    transitionOverlay.className = 'transition-overlay';
    document.body.appendChild(transitionOverlay);

    const links = document.querySelectorAll('a.stat-item, a.card');
    
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        // Only trigger if it's a local link and not a new tab
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          
          // Find the card parent if the link is a stat-item
          const card = link.closest('.card, .stat-item');
          if (card) {
            card.classList.add('is-entering');
          }
          
          const wrapper = document.querySelector('.page-wrapper');
          wrapper.classList.add('is-exiting');
          transitionOverlay.classList.add('is-active');
          
          setTimeout(() => {
            window.location.href = href;
          }, 450); // Faster transition to synchronize with browser loading
        }
      });
    });
    
    // Entry animation on load
    document.addEventListener('DOMContentLoaded', () => {
      const overlay = document.querySelector('.transition-overlay');
      if (overlay) {
        overlay.style.transition = 'opacity 0.4s ease';
        overlay.classList.add('is-active');
        setTimeout(() => {
          overlay.classList.remove('is-active');
        }, 10);
      }
    });

    // In animation on load (for back button)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        document.querySelector('.page-wrapper').classList.remove('is-exiting');
        transitionOverlay.classList.remove('is-active');
      }
    });
  }

  function init() {
    injectBackground();
    initMagneticElements();
    initTextReveals();
    initCustomCursor();
    initCardTilt();
    initPageTransitions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
