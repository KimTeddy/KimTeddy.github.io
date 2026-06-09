// pcb3d.js — A.RM.I PCB 3D Showcase with Elegant Card-Reveal Intro Animation
// The model fills the fullscreen, sways gracefully, then glides to its showcase position.
(function () {
  const container = document.getElementById('pcb-3d-container');
  if (!container || typeof THREE === 'undefined') return;

  const fallbackImg = document.getElementById('pcb-fallback-img');
  const loadingEl = document.getElementById('pcb-loading');

  let scene, camera, renderer, controls;
  let pcbModel = null;
  let animationId = null;
  let isInView = false;
  let revealComplete = false;

  // "Home" state — normal viewing in the showcase section
  const homeCameraPos = new THREE.Vector3(0, 0.22, 0.20);
  const homeModelY = 0.02;

  // Reveal state
  let revealRunning = false;
  let revealStartTime = 0;
  let skipBtn = null;

  // Reveal scene: separate scene + camera for the fullscreen intro
  let revealScene, revealCamera, revealModel;
  
  // Magical effects
  let revealAura, sweepLight;

  // ── REVEAL TIMING (ms) ──
  const T_APPEAR = 0;         // Model fades in
  const T_SWAY_START = 500;   // Begin elegant sway
  const T_SWAY_END = 2600;    // End of elegant presentation (~2.1s)
  const T_FLY_START = 2600;   // Begin fading out
  const T_FLY_END = 3400;     // Fade complete
  const T_SETTLE = 3700;      // Fully settled

  init();

  function init() {
    // ── Main Scene (used post-reveal) ──
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      40, container.clientWidth / container.clientHeight, 0.01, 100
    );
    camera.position.copy(homeCameraPos);

    const isMobile = window.innerWidth <= 768;
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls (disabled during reveal)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.minDistance = 0.1;
    controls.maxDistance = 1.0;

    renderer.domElement.addEventListener('wheel', (e) => {
      if (!e.shiftKey) e.stopImmediatePropagation();
    }, true);

    // ── Lighting for main scene ──
    addLighting(scene);

    // ── Floor + glow ring ──
    const floorGeo = new THREE.CircleGeometry(0.8, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x111118, metalness: 0.8, roughness: 0.3,
      transparent: true, opacity: 0.5
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    scene.add(floor);

    const ringGeo = new THREE.RingGeometry(0.18, 0.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5a0, transparent: true, opacity: 0.3, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.04;
    scene.add(ring);

    // ── Reveal Scene (separate, for fullscreen intro) ──
    revealScene = new THREE.Scene();
    revealCamera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
    addLighting(revealScene);

    // Resize (only post-reveal)
    window.addEventListener('resize', onResize);

    let hasStartedLoading = false;

    // IntersectionObserver (load only when visible, then play post-reveal)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isInView = entry.isIntersecting;
        if (isInView) {
          if (!hasStartedLoading) {
            hasStartedLoading = true;
            loadModel();
          } else if (!animationId && revealComplete) {
            animate();
          }
        }
      });
    }, { threshold: 0.1 });
    observer.observe(container);

    // Control hint
    const controlHint = document.getElementById('pcb-control-hint');
    if (controlHint) {
      container.addEventListener('mouseenter', () => {
        controlHint.style.opacity = '1';
        controlHint.style.transform = 'translateY(0)';
      });
      container.addEventListener('mouseleave', () => {
        controlHint.style.opacity = '0.5';
      });
    }
  }

  function addLighting(targetScene) {
    targetScene.add(new THREE.AmbientLight(0xffffff, 0.8));

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(3, 5, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 15;
    dirLight.shadow.camera.left = -0.5;
    dirLight.shadow.camera.right = 0.5;
    dirLight.shadow.camera.top = 0.5;
    dirLight.shadow.camera.bottom = -0.5;
    targetScene.add(dirLight);

    const accentLight = new THREE.PointLight(0xffffff, 0.6, 10);
    accentLight.position.set(0, -0.3, 0.2);
    targetScene.add(accentLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-3, 3, 5);
    targetScene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 0.5);
    rimLight.position.set(-2, 2, -3);
    targetScene.add(rimLight);

    // Extra top light for drama
    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 8, 0);
    targetScene.add(topLight);
  }

  function loadModel() {
    const loader = new THREE.GLTFLoader();
    const modelSrc = container.getAttribute('data-model-src') || 'assets/models/armi-pcb.glb';

    loader.load(modelSrc, (gltf) => {
      pcbModel = gltf.scene;

      const box = new THREE.Box3().setFromObject(pcbModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 0.25 / maxDim;
      pcbModel.scale.setScalar(scale);

      const scaledCenter = center.multiplyScalar(scale);
      pcbModel.position.sub(scaledCenter);
      pcbModel.position.y += homeModelY;

      const matCache = {};
      pcbModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const mat = child.material;
          if (mat) {
             const mName = mat.name ? mat.name.toLowerCase() : '';
             
             let ancestorName = '';
             let curr = child;
             while (curr) {
               if (curr.name) ancestorName += curr.name.toLowerCase() + ' ';
               curr = curr.parent;
             }

             const isSwitchOrConnector = ancestorName.match(/(?:^|\s)sw\d/) || ancestorName.match(/(?:^|\s)j\d/) || 
                                         ancestorName.includes('usb') || ancestorName.includes('button') || ancestorName.includes('switch') ||
                                         mName.includes('plastic-white') || mName.includes('button') || mName.includes('usb');
             
             const isCapacitor = !isSwitchOrConnector && (mName.includes('cap') || mName.includes('ceramic') || mName.includes('mlcc') || 
                                                          mName.includes('tantalum') || mName.includes('tant') ||
                                                          mName.includes('plastic-yellow') || mName.includes('plastic-orange') ||
                                                          ancestorName.match(/(?:^|\s)c\d/));

             const cacheKey = mat.uuid + '_' + (isSwitchOrConnector ? 'sw' : (isCapacitor ? 'cap' : 'norm'));

             if (matCache[cacheKey]) {
                child.material = matCache[cacheKey];
             } else {
                let newMat = mat;
                if (!Array.isArray(mat)) {
                  newMat = mat.clone();
                  child.material = newMat;
                  matCache[cacheKey] = newMat;
                }
                
                (Array.isArray(newMat) ? newMat : [newMat]).forEach((m) => {
                  if (m.map) m.map.encoding = THREE.sRGBEncoding;
                  if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
                  if (m.aoMap) m.aoMap.encoding = THREE.sRGBEncoding;
                  
                  if (mName.includes('metal') || mName.includes('solder') || mName.includes('iron') || 
                      mName.includes('lead') || mName.includes('tin') || mName.includes('silver') || 
                      mName.includes('pad')) {
                    m.metalness = 1.0;
                    m.roughness = Math.min(m.roughness, 0.2); 
                    if (m.color && m.color.getHSL({}).l < 0.5) m.color.offsetHSL(0, 0, 0.2); 
                  } else if (mName.includes('pin') || mName.includes('header')) {
                    m.metalness = 0.9;
                    m.roughness = Math.min(m.roughness, 0.3);
                    if (m.color) {
                      const hsl = m.color.getHSL({});
                      if (hsl.l < 0.6) m.color.setHSL(hsl.h, hsl.s, 0.6); 
                    }
                  } else if (isSwitchOrConnector) {
                    m.metalness = 0.1;
                    m.roughness = 0.6;
                    if (m.color) m.color.setHSL(0, 0, 0.9); 
                  } else if (isCapacitor) {
                    m.metalness = 0.1;
                    m.roughness = 0.6; 
                    if (m.color) {
                      const hsl = m.color.getHSL({});
                      if (mName.includes('tantalum') || mName.includes('tant') || mName.includes('plastic-yellow') || mName.includes('plastic-orange')) {
                        const h = hsl.s === 0 ? 0.1 : hsl.h;
                        const s = Math.max(hsl.s, 0.6);
                        m.color.setHSL(h, s, 0.45);
                      } else {
                        const h = hsl.s === 0 ? 0.08 : hsl.h; 
                        const s = Math.max(hsl.s, 0.4);
                        m.color.setHSL(h, s, 0.3); 
                      }
                    }
                  } else if (mName.includes('plastic') || mName.includes('package') || mName.includes('body') || 
                             mName.includes('ic') || mName.includes('black') || mName.includes('resin') || 
                             mName.includes('chip') || mName.includes('mcu') || mName.includes('resistor') || 
                             mName.includes('res')) {
                    m.metalness = 0.1;
                    m.roughness = Math.max(m.roughness, 0.6); 
                    if (m.color) {
                      const hsl = m.color.getHSL({});
                      if (hsl.l > 0.01) m.color.setHSL(hsl.h, hsl.s, 0.01); 
                    }
                  }
                  m.needsUpdate = true;
                });
             }
          }
        }
      });

      scene.add(pcbModel);

      // Precompile shaders for the main scene
      renderer.compile(scene, camera);

      if (loadingEl) loadingEl.style.display = 'none';

      // Check reduced motion
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        renderer.domElement.style.opacity = '1';
        revealComplete = true;
        controls.enabled = true;
        if (isInView) animate();
      } else {
        startReveal();
      }
    },
    (progress) => {
      if (loadingEl && progress.total > 0) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loadingEl.textContent = `PCB 모델 로딩 중... ${pct}%`;
      }
    },
    (error) => {
      console.error('GLB load error:', error);
      if (loadingEl) loadingEl.style.display = 'none';
      if (fallbackImg) fallbackImg.style.display = 'block';
      renderer.domElement.style.display = 'none';
    });
  }

  // ─────────────────────────────────────────────
  //  REVEAL ANIMATION — Fullscreen, Elegant Sway
  // ─────────────────────────────────────────────

  function startReveal() {
    revealRunning = true;
    controls.enabled = false;
    controls.autoRotate = false;

    // Lock page scrolling
    document.body.classList.add('pcb-reveal-active');

    // Clone the model into the reveal scene
    revealModel = pcbModel.clone();
    // Scale up for fullscreen visibility
    revealModel.scale.copy(pcbModel.scale);
    revealModel.position.set(0, 0, 0);
    // Set rotation order to YXZ so Y-axis rotation spins it horizontally like a card
    revealModel.rotation.order = 'YXZ';
    revealScene.add(revealModel);

    // Position reveal camera for standing card-like PCB
    const aspect = window.innerWidth / window.innerHeight;
    revealCamera.aspect = aspect;
    revealCamera.fov = 32;
    revealCamera.updateProjectionMatrix();
    
    // Adjust camera distance for mobile (portrait) so the PCB is not cut off
    // Base distance is 0.45. If aspect < 1.2, move camera further back proportionally.
    let zDist = 0.45;
    if (aspect < 1.2) {
      zDist = 0.45 * (1.2 / aspect); 
    }
    revealCamera.position.set(0, 0, zDist);
    revealCamera.lookAt(0, 0, 0);

    // Create a separate fullscreen canvas for the reveal
    const isMobile = window.innerWidth <= 768;
    const revealCanvas = document.createElement('canvas');
    revealCanvas.id = 'pcb-reveal-canvas';
    revealCanvas.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 990;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.5s ease;
      ${isMobile ? '' : 'backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);'}
    `;
    document.body.appendChild(revealCanvas);

    // Create a second renderer for the reveal canvas
    const revealRenderer = new THREE.WebGLRenderer({
      canvas: revealCanvas,
      alpha: true,
      antialias: true
    });
    // Semi-transparent background
    revealRenderer.setClearColor(0x08080f, 0.75);
    revealRenderer.setSize(window.innerWidth, window.innerHeight);
    revealRenderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    revealRenderer.outputEncoding = THREE.sRGBEncoding;
    revealRenderer.shadowMap.enabled = true;
    revealRenderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

    // Precompile reveal shaders
    revealRenderer.compile(revealScene, revealCamera);

    // Fade in the reveal canvas
    requestAnimationFrame(() => {
      revealCanvas.style.opacity = '1';
    });

    // Create skip button
    skipBtn = document.createElement('button');
    skipBtn.className = 'pcb-reveal-skip';
    skipBtn.textContent = 'SKIP →';
    skipBtn.setAttribute('aria-label', 'Skip animation');
    skipBtn.addEventListener('click', () => {
      revealRunning = false;
      cleanupReveal(revealCanvas, revealRenderer);
    });
    document.body.appendChild(skipBtn);

    // Set initial model rotation: standing upright like a card facing camera, slight backward lean
    // X = ~1.3 radians (approx 75 degrees) tilts the top face towards the camera but slightly leaned back
    // Y = slight turn for 3D perspective
    revealModel.rotation.set(1.2, -0.15, 0.05);

    // ─── MAGICAL EFFECTS SETUP ───
    
    // 1. Create a soft radial gradient texture for aura and particles
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 64; texCanvas.height = 64;
    const ctx = texCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.2, 'rgba(0, 229, 160, 0.8)'); // brand cyan/mint
    grad.addColorStop(0.6, 'rgba(59, 130, 246, 0.3)'); // brand blue
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const glowTexture = new THREE.CanvasTexture(texCanvas);

    // 2. Background Aura
    const auraGeo = new THREE.PlaneGeometry(0.8, 0.8);
    const auraMat = new THREE.MeshBasicMaterial({
      map: glowTexture, transparent: true, blending: THREE.AdditiveBlending,
      opacity: 0, depthWrite: false
    });
    revealAura = new THREE.Mesh(auraGeo, auraMat);
    revealAura.position.z = -0.1;
    revealScene.add(revealAura);

    // 3. Sweeping "Holographic" Light
    sweepLight = new THREE.PointLight(0xffffff, 0, 0.5);
    revealScene.add(sweepLight);

    // Store references for the reveal tick
    const revealState = {
      canvas: revealCanvas,
      renderer: revealRenderer,
      baseZ: zDist
    };
    revealCanvas.__renderer = revealRenderer;
    revealCanvas.__state = revealState;

    revealStartTime = performance.now();
    revealTick(revealState);
  }

  function revealTick(state) {
    if (!revealRunning) return;

    const now = performance.now();
    const t = now - revealStartTime;

    // ─── Phase 1: Appear (0 ~ 500ms) ───
    // Model fades in (CSS transition), camera settles
    if (t < T_SWAY_START) {
      const p = easeOutCubic(Math.min(t / 500, 1));

      // Camera gently settles
      revealCamera.position.set(0, 0, state.baseZ + 0.03 - p * 0.03);
      revealCamera.lookAt(0, 0, 0);

      // Model eases into standing pose
      revealModel.rotation.x = 1.1 + p * 0.15; // settles at 1.25 (leaned back)
      revealModel.rotation.y = -0.25 + p * 0.1; // settles at -0.15

      // Magic effects fade in
      if (revealAura) {
        revealAura.scale.setScalar(0.5 + p * 0.5); // aura expands
        revealAura.material.opacity = p * 0.6;
      }
    }

    // ─── Phase 2: Elegant Sway & Magic (500 ~ 2600ms) ───
    // Standing card gently sways with sparkles and light sweep
    if (t >= T_SWAY_START && t < T_SWAY_END) {
      const time = t * 0.001;

      // Standing PCB: gentle Y rotation sway (turning left-right like a card)
      const swayY = Math.sin(time * 1.2) * 0.15;
      // Very subtle X sway (nodding)
      const swayX = Math.sin(time * 0.8) * 0.03;
      // Tiny Z wobble
      const swayZ = Math.cos(time * 1.0) * 0.02;

      revealModel.rotation.x = 1.25 + swayX;
      revealModel.rotation.y = -0.15 + swayY;
      revealModel.rotation.z = 0.05 + swayZ;

      // Subtle floating up/down
      revealModel.position.y = Math.sin(time * 1.5) * 0.008;

      // Sweep Light (holo effect moving across card)
      if (sweepLight) {
        sweepLight.intensity = 1.5 + Math.sin(time * 3) * 0.5;
        // Moves diagonally across the front of the card
        sweepLight.position.x = Math.sin(time * 2.5) * 0.2;
        sweepLight.position.y = Math.cos(time * 2.5) * 0.2;
        sweepLight.position.z = 0.05 + Math.sin(time * 1.5) * 0.02;
      }

      // Aura pulsing
      if (revealAura) {
        revealAura.scale.setScalar(1.0 + Math.sin(time * 2) * 0.1);
        revealAura.material.opacity = 0.5 + Math.sin(time * 3) * 0.1;
      }
    }

    // ─── Phase 3: Fade out (2600 ~ 3400ms) ───
    if (t >= T_FLY_START && t < T_FLY_END) {
      const raw = (t - T_FLY_START) / (T_FLY_END - T_FLY_START);
      const fp = easeInOutCubic(raw);

      // Fade out the reveal canvas
      state.canvas.style.opacity = String(1 - fp);
      state.canvas.style.transition = 'opacity 0.6s ease';

      // Model spins rapidly, shrinks, and falls out of view
      const time = t * 0.001;
      const currentY = -0.15 + Math.sin(time * 1.2) * 0.15;
      
      // Accelerating curve for falling
      const fallP = fp * fp; 

      // Spin rapidly left-right around the vertical axis (YXZ order makes Y vertical)
      revealModel.rotation.y = currentY + fallP * Math.PI * 6;
      // Tilt backwards slightly more as it falls
      revealModel.rotation.x = 1.25 + fallP * 0.5;
      revealModel.rotation.z = 0.05; // cancel wobble
      
      // Shrink to zero
      const s = pcbModel.scale.x * (1 - fallP);
      revealModel.scale.setScalar(s);

      // Move downwards off screen
      revealModel.position.y = -fallP * 0.8;

      // Camera pulls back slightly
      revealCamera.position.z = state.baseZ + fp * 0.1;
      revealCamera.lookAt(0, -fp * 0.2, 0); // follow it down a bit

      // Fade out magic
      if (revealAura) revealAura.material.opacity = 0.5 * (1 - fp);
      if (sweepLight) sweepLight.intensity = 1.5 * (1 - fp);

      // Fade out skip button
      if (skipBtn) skipBtn.style.opacity = String(1 - fp);
    }

    // ─── Phase 4: Settle ───
    if (t >= T_FLY_END && t < T_SETTLE) {
      const raw = (t - T_FLY_END) / (T_SETTLE - T_FLY_END);
      const sp = easeOutCubic(raw);

      // Fade in the main showcase canvas
      renderer.domElement.style.opacity = String(sp);
    }

    // ─── Done ───
    if (t >= T_SETTLE) {
      revealRunning = false;
      cleanupReveal(state.canvas, state.renderer);
      return;
    }

    // Render the reveal scene
    state.renderer.render(revealScene, revealCamera);
    requestAnimationFrame(() => revealTick(state));
  }

  function cleanupReveal(revealCanvas, revealRenderer) {
    // Clean up magic effects
    if (revealAura) {
      revealAura.geometry.dispose();
      revealAura.material.map.dispose();
      revealAura.material.dispose();
      revealScene.remove(revealAura);
      revealAura = null;
    }
    if (sweepLight) {
      revealScene.remove(sweepLight);
      sweepLight = null;
    }

    // Clean up reveal scene
    if (revealModel && revealScene) {
      revealScene.remove(revealModel);
      revealModel = null;
    }

    // Dispose reveal renderer
    if (revealRenderer) {
      revealRenderer.dispose();
    }

    // Remove reveal canvas
    if (revealCanvas && revealCanvas.parentNode) {
      revealCanvas.style.opacity = '0';
      setTimeout(() => {
        if (revealCanvas.parentNode) revealCanvas.parentNode.removeChild(revealCanvas);
      }, 400);
    }

    // Remove skip button
    if (skipBtn && skipBtn.parentNode) {
      skipBtn.parentNode.removeChild(skipBtn);
      skipBtn = null;
    }

    // Show the main canvas
    renderer.domElement.style.opacity = '1';

    // Unlock scrolling
    document.body.classList.remove('pcb-reveal-active');

    // Enable controls
    controls.enabled = true;
    controls.autoRotate = true;
    controls.target.set(0, homeModelY, 0);
    controls.update();

    revealComplete = true;
    isInView = true;
    animate();
  }

  // ─────────────────────────────────────────────
  //  NORMAL OPERATION (post-reveal)
  // ─────────────────────────────────────────────

  function onResize() {
    if (revealRunning && revealCamera) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const aspect = w / h;
      revealCamera.aspect = aspect;
      revealCamera.updateProjectionMatrix();
      
      const canvas = document.getElementById('pcb-reveal-canvas');
      if (canvas) {
        if (canvas.__renderer) canvas.__renderer.setSize(w, h);
        if (canvas.__state) {
          let zDist = 0.45;
          if (aspect < 1.2) zDist = 0.45 * (1.2 / aspect);
          canvas.__state.baseZ = zDist;
        }
      }
    }

    if (!camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate() {
    if (!isInView || !revealComplete) {
      animationId = null;
      return;
    }
    animationId = requestAnimationFrame(animate);
    controls.update();

    if (pcbModel) {
      const time = Date.now() * 0.001;
      pcbModel.position.y = homeModelY + Math.sin(time * 1.2) * 0.005;
    }

    renderer.render(scene, camera);
  }

  // ─────────────────────────────────────────────
  //  EASING
  // ─────────────────────────────────────────────

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
})();
