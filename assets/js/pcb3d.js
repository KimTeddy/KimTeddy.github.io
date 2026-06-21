// pcb3d.js — A.RM.I PCB 3D Showcase with Elegant Card-Reveal Intro Animation
// The model fills the fullscreen, sways gracefully, then glides to its showcase position.
(function () {
  const container = document.getElementById('pcb-3d-container');
  if (!container || typeof THREE === 'undefined') return;

  // ── Mobile detection (module-level, reused throughout) ──
  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const fallbackImg = document.getElementById('pcb-fallback-img');
  const loadingEl = document.getElementById('pcb-loading');

  let scene, camera, renderer, controls;
  let pcbModel = null;
  let animationId = null;
  let isInView = false;
  let revealComplete = false;
  let turntableGroup; // Group for PCB and floor to rotate together

  // RGB LED animation state
  let ledMeshes = [];       // Array of { mesh, originalMat } for RGB LED emissive surfaces
  let singleLedMeshes = []; // Array of all single-color LEDs
  window.sequenceLedMeshes = []; // Array of the 4 back LEDs for sequential animation
  let ledLights = [];       // PointLights placed under each LED for glow
  let stageSpots = [];      // Stage spotlight rigs for dramatic PCB showcase
  let lightIntroStartTime = null; // Track when the light intro animation starts

  // "Home" state — normal viewing in the showcase section
  // Y is the vertical axis in Three.js. Rotated 45 degrees in X-Z plane, and lowered.
  const homeCameraPos = new THREE.Vector3(0.55, 0.10, 0.55); 
  const homeModelY = 0.05; // Raised slightly so it doesn't clip the floor

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

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isMobile });
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
    controls.enablePan = true; // 우클릭 시점 이동 허용
    controls.autoRotate = false; // 트러스가 같이 도는 것을 막기 위해 카메라 자동 회전 비활성화
    controls.autoRotateSpeed = 1.5;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.minDistance = 0.1;
    controls.maxDistance = 5.0; // Allowed to zoom out to see the whole stage

    renderer.domElement.addEventListener('wheel', (e) => {
      if (!e.shiftKey) e.stopImmediatePropagation();
    }, true);

    // ── Lighting for main scene ──
    addLighting(scene, true, isMobile); // Added `true` to register stage spots for animation

    // ── Floor + glow ring ──
    turntableGroup = new THREE.Group();
    scene.add(turntableGroup);

    const floorSegments = isMobile ? 32 : 64;
    const floorGeo = new THREE.CircleGeometry(0.8, floorSegments);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x111118, metalness: 0.8, roughness: 0.3,
      transparent: true, opacity: 0.5
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    turntableGroup.add(floor);

    const ringGeo = new THREE.RingGeometry(0.18, 0.2, floorSegments);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5a0, transparent: true, opacity: 0.3, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.04;
    turntableGroup.add(ring);

    // ── Reveal Scene (separate, for fullscreen intro) ──
    revealScene = new THREE.Scene();
    revealCamera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100);
    // Mobile: lightweight reveal lighting (PCB model only, no truss/stage lights)
    // PC: full lighting with truss and stage structures
    if (isMobile) {
      addRevealLightingMobile(revealScene);
    } else {
      addLighting(revealScene);
    }

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

  // ── Mobile-only: Lightweight reveal lighting (no truss, no stage lights) ──
  function addRevealLightingMobile(targetScene) {
    // Simple ambient
    targetScene.add(new THREE.AmbientLight(0x0a0b1a, 0.6));

    // Fill from below (slightly stronger for mobile to compensate missing stage lights)
    const fillBelow = new THREE.DirectionalLight(0x1a2a4a, 0.5);
    fillBelow.position.set(0, -2, 1);
    targetScene.add(fillBelow);

    // Key Light — same position as PC but no shadow (mobile reveal doesn't need it)
    const keySpot = new THREE.SpotLight(0xffffff, 3.0, 5, 0.6, 0.5, 1);
    keySpot.position.set(0.25, 0.5, 0.75);
    keySpot.target.position.set(0, 0, 0);
    keySpot.castShadow = false; // No shadows in mobile reveal
    targetScene.add(keySpot);
    targetScene.add(keySpot.target);

    // Rim light from behind for depth (replaces missing stage beams visually)
    const rimLight = new THREE.DirectionalLight(0x00e5a0, 0.4);
    rimLight.position.set(-0.3, 0.3, -0.5);
    targetScene.add(rimLight);
  }

  function addLighting(targetScene, isMainScene, isMobileScene) {
    // ── Dramatic Dark Stage Ambient ──
    targetScene.add(new THREE.AmbientLight(0x0a0b1a, 0.4)); // Darker blue ambient

    // ── Subtle fill from below ──
    const fillBelow = new THREE.DirectionalLight(0x1a2a4a, 0.3);
    fillBelow.position.set(0, -2, 1);
    targetScene.add(fillBelow);

    // ── Key Light (Diagonal from Left of Camera, ~30 degrees) ──
    const keySpot = new THREE.SpotLight(0xffffff, 3.0, 5, 0.6, 0.5, 1);
    keySpot.position.set(0.25, 0.5, 0.75); // ~30 degrees left of camera
    keySpot.target.position.set(0, 0, 0);
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.set(isMobileScene ? 512 : 1024, isMobileScene ? 512 : 1024);
    keySpot.shadow.bias = -0.001;
    keySpot.shadow.normalBias = 0.02; // Fix shadow banding/acne on grazing angles
    targetScene.add(keySpot);
    targetScene.add(keySpot.target);

    // ── Build Square Metal Truss Structure ──
    const trussSize = 0.30; // Smaller truss at the top
    const trussY = 0.28; // Lowered slightly more
    const trussSegments = isMobileScene ? 4 : 8;
    const trussGeo = new THREE.CylinderGeometry(0.007, 0.007, trussSize + 0.02, trussSegments);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.4 });
    
    // Front, Back, Right, Left truss bars (Top and Bottom rails)
    const bars = [
      { x: 0, y: trussY + 0.02, z: trussSize/2, rot: Math.PI/2 }, 
      { x: 0, y: trussY + 0.02, z: -trussSize/2, rot: Math.PI/2 }, 
      { x: trussSize/2, y: trussY + 0.02, z: 0, rot: 0 }, 
      { x: -trussSize/2, y: trussY + 0.02, z: 0, rot: 0 },
      // Bottom rails
      { x: 0, y: trussY - 0.02, z: trussSize/2, rot: Math.PI/2 }, 
      { x: 0, y: trussY - 0.02, z: -trussSize/2, rot: Math.PI/2 }, 
      { x: trussSize/2, y: trussY - 0.02, z: 0, rot: 0 }, 
      { x: -trussSize/2, y: trussY - 0.02, z: 0, rot: 0 },
      // Diagonal crossbars to support center light
      { x: 0, y: trussY, z: 0, rot: Math.PI / 4, len: trussSize * 1.414 },
      { x: 0, y: trussY, z: 0, rot: -Math.PI / 4, len: trussSize * 1.414 }
    ];
    for (const b of bars) {
      const mesh = new THREE.Mesh(trussGeo, trussMat);
      if (b.len) mesh.scale.y = b.len / (trussSize + 0.02);
      mesh.position.set(b.x, b.y, b.z);
      mesh.rotation.x = Math.PI / 2; // lie along Z
      if (b.rot) mesh.rotation.z = b.rot; // rotate to align along X
      targetScene.add(mesh);
    }

    // ── Stage Lights (mobile: reduced count for performance) ──
    const numPerSide = isMobileScene ? 3 : 6;
    const half = trussSize / 2;
    const step = trussSize / (numPerSide - 1);
    const spotConfigs = [];

    // Generate positions along the perimeter of the square
    for (let i = 0; i < numPerSide; i++) {
      const pos = -half + i * step;
      spotConfigs.push({ x: pos, z: half });
      spotConfigs.push({ x: pos, z: -half });
      if (i > 0 && i < numPerSide - 1) {
        spotConfigs.push({ x: -half, z: pos });
        spotConfigs.push({ x: half, z: pos });
      }
    }

    if (isMainScene) stageSpots = []; // Clear array

    // 3 Colors: Cool White, White, Warm White
    const colors = [0xe0f0ff, 0xffffff, 0xfff4e0];

    for (let i = 0; i < spotConfigs.length; i++) {
      const cfg = spotConfigs[i];
      const isCorner = Math.abs(cfg.x) > half - 0.01 && Math.abs(cfg.z) > half - 0.01;
      const color = colors[i % 3]; // Alternate colors
      
      // ONLY use real THREE.SpotLight for corners to preserve 60FPS performance.
      const isReal = isCorner; 
      
      // Fixture Group
      const fixtureGroup = new THREE.Group();
      fixtureGroup.position.set(cfg.x, trussY - 0.02, cfg.z); // Attach to bottom rail
      
      // U-Bracket
      const bracketMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
      const bTopGeo = new THREE.BoxGeometry(0.028, 0.002, 0.01);
      const bTop = new THREE.Mesh(bTopGeo, bracketMat);
      bTop.position.y = 0.005;
      fixtureGroup.add(bTop);
      
      const bArmGeo = new THREE.BoxGeometry(0.002, 0.02, 0.01);
      const bArmL = new THREE.Mesh(bArmGeo, bracketMat);
      bArmL.position.set(-0.013, -0.005, 0);
      fixtureGroup.add(bArmL);
      const bArmR = new THREE.Mesh(bArmGeo, bracketMat);
      bArmR.position.set(0.013, -0.005, 0);
      fixtureGroup.add(bArmR);

      const headGroup = new THREE.Group();
      headGroup.position.y = -0.01; // pivot point
      fixtureGroup.add(headGroup);

      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 });

      // Main Cylindrical Body
      const bodySegments = isMobileScene ? 8 : 16;
      const bodyGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.04, bodySegments);
      bodyGeo.rotateX(Math.PI / 2);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      headGroup.add(body);

      // Sharp Bezel Ring (Torus)
      const bezelSegments = isMobileScene ? 8 : 16;
      const bezelGeo = new THREE.TorusGeometry(0.012, 0.0015, isMobileScene ? 4 : 8, bezelSegments);
      const bezel = new THREE.Mesh(bezelGeo, bodyMat);
      bezel.position.z = -0.02; 
      headGroup.add(bezel);

      // Lens (Glowing face)
      const lensGeo = new THREE.CircleGeometry(0.01, isMobileScene ? 8 : 16);
      const lensMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.z = -0.0205; // sits slightly in front of the body face, inside the torus
      headGroup.add(lens);

      // Volumetric Beam (Fake Light)
      const dist = 4.0; // Shoot far into the sky
      const wide = 0.15; // Narrow, laser-like stage beam
      // Truncated cone matching lens radius
      const beamSegments = isMobileScene ? 12 : 32;
      const beamGeo = new THREE.CylinderGeometry(0.011, wide, dist, beamSegments, 1, true);
      beamGeo.rotateX(Math.PI / 2); // Top (+Y) to +Z. Base (-Y) to -Z.
      beamGeo.translate(0, 0, -dist / 2 - 0.0205); 
      
      const beamMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: isCorner ? 0.08 : 0.04, // slightly brighter for narrow beam
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      headGroup.add(beam);
      
      targetScene.add(fixtureGroup);

      // Target to aim at (180 degree opposite of previous UP-OUTWARD: now DOWN-INWARD criss-cross)
      const target = new THREE.Object3D();
      // Mathematically inverted target to preserve exact angle
      const tx = -10.0 * cfg.x;
      const tz = -10.0 * cfg.z;
      target.position.set(tx, -3.6, tz); // Aim deep into the floor for criss-cross effect
      targetScene.add(target);
      
      headGroup.lookAt(target.position);

      if (isMainScene) {
        const phaseOffset = (cfg.x + cfg.z) * 4; // Wave effect
        stageSpots.push({ 
          target: target, 
          head: headGroup, 
          beamMat: beamMat,
          baseOpacity: isCorner ? 0.08 : 0.04,
          baseX: tx,
          baseZ: tz,
          srcX: cfg.x,
          srcZ: cfg.z
        });
      }
    }

    // ── Center Spotlight Shooting Straight Down ──
    const centerGroup = new THREE.Group();
    centerGroup.position.set(0, trussY + 0.025, 0); // raised above crossbars

    // U-Bracket
    const cBracketMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const cbTopGeo = new THREE.BoxGeometry(0.028, 0.002, 0.01);
    const cbTop = new THREE.Mesh(cbTopGeo, cBracketMat);
    cbTop.position.y = -0.005; // attach to truss
    centerGroup.add(cbTop);
    
    const cbArmGeo = new THREE.BoxGeometry(0.002, 0.02, 0.01);
    const cbArmL = new THREE.Mesh(cbArmGeo, cBracketMat);
    cbArmL.position.set(-0.013, -0.015, 0);
    centerGroup.add(cbArmL);
    const cbArmR = new THREE.Mesh(cbArmGeo, cBracketMat);
    cbArmR.position.set(0.013, -0.015, 0);
    centerGroup.add(cbArmR);

    const headGroup = new THREE.Group();
    headGroup.position.y = -0.02; // pivot point
    centerGroup.add(headGroup);

    const cBodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 });

    const cBodySegments = isMobileScene ? 8 : 16;
    const cBodyGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.04, cBodySegments);
    cBodyGeo.rotateX(Math.PI / 2);
    const cBody = new THREE.Mesh(cBodyGeo, cBodyMat);
    headGroup.add(cBody);

    const cBezelGeo = new THREE.TorusGeometry(0.012, 0.0015, isMobileScene ? 4 : 8, isMobileScene ? 8 : 16);
    const cBezel = new THREE.Mesh(cBezelGeo, cBodyMat);
    cBezel.position.z = -0.02; 
    headGroup.add(cBezel);

    const cLensGeo = new THREE.CircleGeometry(0.01, isMobileScene ? 8 : 16);
    const cLensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const cLens = new THREE.Mesh(cLensGeo, cLensMat);
    cLens.position.z = -0.0205;
    headGroup.add(cLens);

    // Center beam (subtle volumetric light downwards)
    const cDist = 4.0; // match perimeter lights
    const cWide = 0.15; // match perimeter lights
    const cBeamGeo = new THREE.CylinderGeometry(0.011, cWide, cDist, isMobileScene ? 12 : 32, 1, true);
    cBeamGeo.rotateX(Math.PI / 2);
    cBeamGeo.translate(0, 0, -cDist / 2 - 0.0205); 
    const cBeamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const cBeam = new THREE.Mesh(cBeamGeo, cBeamMat);
    headGroup.add(cBeam); // added to headGroup so it rotates with head

    targetScene.add(centerGroup);

    const cTarget = new THREE.Object3D();
    cTarget.position.set(0, -3.6, 0); // straight down to PCB
    targetScene.add(cTarget);
    headGroup.lookAt(cTarget.position); // Only head looks down, bracket stays fixed

    // Real center SpotLight removed to enhance diagonal shadows
    
    if (isMainScene) {
      stageSpots.push({ 
        target: cTarget, 
        head: headGroup, 
        beamMat: cBeamMat,
        baseOpacity: 0.04,
        baseX: 0,
        baseZ: 0,
        srcX: 0,
        srcZ: 0
      });

      // Sort lights counter-clockwise
      stageSpots.sort((a, b) => {
        if (a.srcX === 0 && a.srcZ === 0) return 1; // Center light goes last
        if (b.srcX === 0 && b.srcZ === 0) return -1;
        const angleA = Math.atan2(a.srcZ, a.srcX);
        const angleB = Math.atan2(b.srcZ, b.srcX);
        return angleA - angleB;
      });
    }
  }

  function loadModel() {
    const loader = new THREE.GLTFLoader();

    // Mobile: use DRACOLoader for compressed mobile model
    if (isMobile && typeof THREE.DRACOLoader !== 'undefined') {
      const dracoLoader = new THREE.DRACOLoader();
      dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
      loader.setDRACOLoader(dracoLoader);
    }

    // Mobile: use lightweight mobile GLB, PC: use full-quality GLB
    const defaultModel = isMobile ? 'assets/models/armi-pcb-mobile.glb' : 'assets/models/armi-pcb.glb';
    const modelSrc = container.getAttribute('data-model-src') || defaultModel;

    // Progress callback
    function onProgress(progress) {
      if (loadingEl && progress.total > 0) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loadingEl.textContent = `PCB 모델 로딩 중... ${pct}%`;
      }
    }

    // Error callback (with fallback for mobile)
    function onError(error) {
      console.error('GLB load error:', error);
      if (loadingEl) loadingEl.style.display = 'none';
      if (fallbackImg) fallbackImg.style.display = 'block';
      renderer.domElement.style.display = 'none';
    }

    // Try loading the model. If mobile GLB fails (e.g., not yet generated), fall back to original.
    function doLoad(src) {
      loader.load(src, onSuccess, onProgress, (error) => {
        if (isMobile && src.includes('-mobile.glb')) {
          console.warn('[PCB3D] Mobile GLB not found, falling back to full-quality GLB');
          const fallbackSrc = src.replace('-mobile.glb', '.glb');
          doLoad(fallbackSrc);
        } else {
          onError(error);
        }
      });
    }

    function onSuccess(gltf) {
      const originalScene = gltf.scene;
      pcbModel = new THREE.Group(); // wrapper to rotate around center

      const box = new THREE.Box3().setFromObject(originalScene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 0.25 / maxDim; // PCB 본래 크기 유지
      originalScene.scale.setScalar(scale);

      const scaledCenter = center.multiplyScalar(scale);
      originalScene.position.sub(scaledCenter);
      
      pcbModel.add(originalScene);

      // Tilt like a smartphone on a display stand (45 degrees back)
      pcbModel.rotation.x = Math.PI / 4; 
      pcbModel.position.y += homeModelY;

      const matCache = {};
      pcbModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const mat = child.material;
          if (mat) {
             const mName = mat.name ? mat.name.toLowerCase() : '';
             const childName = (child.name || '').toLowerCase();
             
             let ancestorName = '';
             let curr = child;
             while (curr) {
               if (curr.name) ancestorName += curr.name.toLowerCase() + ' ';
               curr = curr.parent;
             }

             // ── Detect PCB edge mesh: check material name, mesh name, AND ancestor names ──
             const allNames = mName + ' ' + childName + ' ' + ancestorName;
             const isPcbEdge = allNames.includes('pcb_edge') || allNames.includes('pcb edge') ||
                               allNames.includes('board_edge') || allNames.includes('board edge') ||
                               (allNames.includes('edge') && (allNames.includes('pcb') || allNames.includes('board')));

             // ── Detect 5050 RGB LED ──
             const is5050Group = !isPcbEdge && (ancestorName.includes('led_rgb_5050') || childName.includes('led_rgb_5050'));
             // The body is white plastic. Exclude it from the glowing lens.
             const is5050Body = is5050Group && (mName.includes('white') || mName.includes('body') || childName.endsWith('_1'));
             const is5050Pin = is5050Group && (mName.includes('metal') || mName.includes('pin') || mName.includes('copper') || mName.includes('solder') || childName.endsWith('_2'));
             const is5050Lens = is5050Group && !is5050Body && !is5050Pin;

             // ── Detect Single LEDs ──
             const isSingleLEDGroup = !isPcbEdge && !is5050Group && (ancestorName.includes('led') || childName.includes('led') || mName.includes('led') || ancestorName.match(/d\d+/i));
             const isSingleLEDPin = isSingleLEDGroup && (mName.includes('metal') || mName.includes('pin') || mName.includes('copper') || mName.includes('solder') || childName.endsWith('_2'));
             const isSingleLEDBody = isSingleLEDGroup && !isSingleLEDPin && !mName.includes('black');

             const isSwitchOrConnector = !is5050Group && !isSingleLEDGroup && !isPcbEdge && (ancestorName.match(/(?:^|\s)sw\d/) || ancestorName.match(/(?:^|\s)j\d/) || 
                                         ancestorName.includes('usb') || ancestorName.includes('button') || ancestorName.includes('switch') ||
                                         mName.includes('plastic-white') || mName.includes('button') || mName.includes('usb'));
             
             const isCapacitor = !isSwitchOrConnector && !isSingleLEDGroup && !isPcbEdge && (mName.includes('cap') || mName.includes('ceramic') || mName.includes('mlcc') || 
                                                          mName.includes('tantalum') || mName.includes('tant') ||
                                                          mName.includes('plastic-yellow') || mName.includes('plastic-orange') ||
                                                          ancestorName.match(/(?:^|\s)c\d/));

             const cacheKey = mat.uuid + '_' + (is5050Lens ? 'led' : (isSingleLEDBody ? 'sled' : (isSwitchOrConnector ? 'sw' : (isCapacitor ? 'cap' : (isPcbEdge ? 'edge' : 'norm')))));

             // ── PCB Edge: Skip here, handled by splitPcbVias post-process ──
             if (isPcbEdge) {
                // Don't modify or cache — splitPcbVias will apply FR4/gold separately
             } else if (is5050Lens) {
                // 5050 RGB LED Lens — give it rainbow emissive glow
                const ledMat = mat.clone();
                child.material = ledMat;
                ledMat.emissive = new THREE.Color(1, 0, 0);
                ledMat.emissiveIntensity = 2.5;
                ledMat.metalness = 0.0;
                ledMat.roughness = 0.4;
                ledMat.needsUpdate = true;

                ledMeshes.push({ mesh: child, mat: ledMat });

                // Add a SpotLight correctly attached to the PCB model to prevent piercing and ensure it rotates with the board
                if (ledLights.length === 0) {
                  const worldPos = new THREE.Vector3();
                  child.getWorldPosition(worldPos);
                  
                  const localPos = new THREE.Vector3();
                  localPos.copy(worldPos);
                  pcbModel.worldToLocal(localPos);

                  // SpotLight with ~90 degree half-angle (hemisphere) to prevent backward bleeding
                  const ledLight = new THREE.SpotLight(0xff0000, 1.5, 0.25, Math.PI / 2.1, 0.5, 1);
                  ledLight.position.copy(localPos);
                  
                  // Aim it strictly OUTWARDS from the PCB center plane (Y=0)
                  const lightTarget = new THREE.Object3D();
                  lightTarget.position.copy(localPos);
                  lightTarget.position.y += (localPos.y >= 0 ? 0.1 : -0.1); 

                  pcbModel.add(ledLight);
                  pcbModel.add(lightTarget);
                  ledLight.target = lightTarget;

                  ledLights.push(ledLight);
                }
             } else if (isSingleLEDBody) {
                // Single color LEDs — initially off (black)
                const ledMat = mat.clone();
                child.material = ledMat;
                ledMat.emissive = new THREE.Color(0, 0, 0);
                ledMat.emissiveIntensity = 2.0;
                ledMat.metalness = 0.1;
                ledMat.roughness = 0.4;
                ledMat.needsUpdate = true;
                
                const localPos = new THREE.Vector3();
                child.getWorldPosition(localPos);
                pcbModel.worldToLocal(localPos);

                // Store all coordinates to classify them later
                singleLedMeshes.push({ mesh: child, mat: ledMat, localX: localPos.x, localY: localPos.y, localZ: localPos.z });
             } else if (matCache[cacheKey]) {
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
                      if (mName.includes('white')) {
                        if (hsl.l < 0.85) m.color.setHSL(hsl.h, hsl.s, 0.85); // Keep it white
                      } else {
                        if (hsl.l > 0.01) m.color.setHSL(hsl.h, hsl.s, 0.01); // Turn it black
                      }
                    }
                  }
                  m.needsUpdate = true;
                });
             }
          }
        }
      });

      // Log LED detection results
      let sequenceLeds = [];
      let frontRightLeds = [];
      let farLeftLeds = [];

      if (singleLedMeshes.length > 0) {
         // Find the dominant X-column (where the 4-LED stacks are located on front & back)
         const xCounts = {};
         for (const sLed of singleLedMeshes) {
            const roundedX = Math.round(sLed.localX * 100);
            xCounts[roundedX] = (xCounts[roundedX] || 0) + 1;
         }
         let columnX = null;
         let maxCount = 0;
         for (const x in xCounts) {
            if (xCounts[x] > maxCount) {
               maxCount = xCounts[x];
               columnX = parseInt(x);
            }
         }

         for (const sLed of singleLedMeshes) {
            const roundedX = Math.round(sLed.localX * 100);
            const isInColumn = Math.abs(roundedX - columnX) <= 2;

            if (isInColumn) {
               sequenceLeds.push(sLed);
            } else if (sLed.localX > 0) {
               frontRightLeds.push(sLed);
            } else {
               farLeftLeds.push(sLed);
            }
         }
      }

      // Apply static colors to Front Right LEDs (Light Green)
      for (const sLed of frontRightLeds) {
         sLed.mat.emissive.setHex(0x88ff00);
         sLed.mat.emissiveIntensity = 2.0;
         sLed.mat.needsUpdate = true;
      }

      // Helper function to group multiple meshes (body + lens) belonging to the same physical LED
      function groupLedsByZ(ledArray) {
         const groups = [];
         for (const sLed of ledArray) {
            let found = false;
            for (const g of groups) {
               if (Math.abs(g.z - sLed.localZ) < 0.001) {
                  g.meshes.push(sLed);
                  found = true;
                  break;
               }
            }
            if (!found) groups.push({ z: sLed.localZ, meshes: [sLed] });
         }
         groups.sort((a, b) => b.z - a.z); // Bottom to top
         return groups;
      }

      // Apply static colors to Far Left LEDs (Bottom two are D11=Red, D12=Green)
      const farLeftGroups = groupLedsByZ(farLeftLeds);
      for (let i = 0; i < farLeftGroups.length; i++) {
         let hex = 0x000000;
         let intensity = 0.0;
         if (i === 0) { hex = 0xff0000; intensity = 2.0; } // D11 Red
         else if (i === 1) { hex = 0x00ff00; intensity = 2.0; } // D12 Green
         
         for (const sLed of farLeftGroups[i].meshes) {
            sLed.mat.emissive.setHex(hex);
            sLed.mat.emissiveIntensity = intensity;
            sLed.mat.needsUpdate = true;
         }
      }

      // Prepare Sequence LEDs for animation (Group multi-mesh components)
      window.sequenceLedGroups = groupLedsByZ(sequenceLeds);

      console.log(`[PCB3D] Grouped: ${window.sequenceLedGroups.length} Sequence LEDs, ${farLeftGroups.length} Far Left LEDs`);

      // ── Debug: Log ALL mesh and material names in the model ──
      const debugMats = new Set();
      pcbModel.traverse((c) => {
        if (c.isMesh && c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(m => {
            const key = `mesh:"${c.name}" mat:"${m.name}" metalness:${m.metalness?.toFixed(2)} roughness:${m.roughness?.toFixed(2)}`;
            debugMats.add(key);
          });
        }
      });
      console.log('[PCB3D] All meshes/materials:', [...debugMats].join('\n  '));

      if (pcbModel) {
        turntableGroup.add(pcbModel);
      }

      // ── Post-process: Split PCB edge into via barrels (gold) and board edge (FR4) ──
      // Uses EDGE-based connectivity (faces sharing 2 vertices) so vias and
      // board edge are properly separated even if they share single vertices.
      (function splitPcbVias() {
        // Find ALL edge meshes by material name, mesh name, or ancestor group name
        const edgeMeshes = [];
        pcbModel.traverse((c) => {
          if (c.isMesh && c.material) {
            const mn = (c.material.name || '').toLowerCase();
            const cn = (c.name || '').toLowerCase();
            let ancestorNames = '';
            let p = c.parent;
            while (p) {
              if (p.name) ancestorNames += p.name.toLowerCase() + ' ';
              p = p.parent;
            }
            const allNames = mn + ' ' + cn + ' ' + ancestorNames;
            if (allNames.includes('pcb_edge') || allNames.includes('pcb edge') || 
                allNames.includes('board_edge') || allNames.includes('board edge') ||
                (allNames.includes('edge') && (allNames.includes('pcb') || allNames.includes('board')))) {
              edgeMeshes.push(c);
            }
          }
        });

        console.log(`[PCB3D] Found ${edgeMeshes.length} edge mesh(es)`);
        if (edgeMeshes.length === 0) {
          console.warn('[PCB3D] No edge mesh found! Check material/mesh names above.');
          return;
        }

        // Get board XZ extent for via/edge classification
        const boardBox = new THREE.Box3().setFromObject(pcbModel);
        const boardXZSize = Math.max(
          boardBox.max.x - boardBox.min.x,
          boardBox.max.z - boardBox.min.z
        );
        // Components with XZ extent < 3% of board size are vias (tiny holes).
        // Larger holes (mounting, cutouts) are treated as board edge (FR4).
        const viaThreshold = boardXZSize * 0.03;

        const fr4Mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0.55, 0.50, 0.30),
          metalness: 0.0,
          roughness: 0.85
        });
        const viaMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0.85, 0.72, 0.35),
          metalness: 0.9,
          roughness: 0.15
        });

        for (const edgeMesh of edgeMeshes) {
          const geo = edgeMesh.geometry;
          const pos = geo.attributes.position;
          const idx = geo.index;

          if (!idx) {
            edgeMesh.material = fr4Mat.clone();
            console.log(`[PCB3D] Edge mesh "${edgeMesh.name}": no index, FR4 applied`);
            continue;
          }

          const faceCount = idx.count / 3;

          // ── Build EDGE-based adjacency (faces sharing 2 vertices = shared edge) ──
          const edgeToFaces = new Map();
          for (let f = 0; f < faceCount; f++) {
            const v0 = idx.getX(f * 3);
            const v1 = idx.getX(f * 3 + 1);
            const v2 = idx.getX(f * 3 + 2);
            const edges = [
              Math.min(v0, v1) + '-' + Math.max(v0, v1),
              Math.min(v1, v2) + '-' + Math.max(v1, v2),
              Math.min(v0, v2) + '-' + Math.max(v0, v2)
            ];
            for (const ek of edges) {
              if (!edgeToFaces.has(ek)) edgeToFaces.set(ek, []);
              edgeToFaces.get(ek).push(f);
            }
          }

          // ── BFS using edge-based adjacency ──
          const visited = new Uint8Array(faceCount);
          const components = [];

          for (let f = 0; f < faceCount; f++) {
            if (visited[f]) continue;
            const component = [];
            const queue = [f];
            visited[f] = 1;

            while (queue.length > 0) {
              const cf = queue.shift();
              component.push(cf);
              const cv0 = idx.getX(cf * 3);
              const cv1 = idx.getX(cf * 3 + 1);
              const cv2 = idx.getX(cf * 3 + 2);
              const cEdges = [
                Math.min(cv0, cv1) + '-' + Math.max(cv0, cv1),
                Math.min(cv1, cv2) + '-' + Math.max(cv1, cv2),
                Math.min(cv0, cv2) + '-' + Math.max(cv0, cv2)
              ];
              for (const ek of cEdges) {
                const neighbors = edgeToFaces.get(ek);
                for (const nf of neighbors) {
                  if (!visited[nf]) {
                    visited[nf] = 1;
                    queue.push(nf);
                  }
                }
              }
            }
            components.push(component);
          }

          console.log(`[PCB3D] Mesh "${edgeMesh.name}": ${components.length} edge-connected components`);

          // ── Classify each component by XZ extent: small = via, large = board edge ──
          const boardEdgeFaces = [];
          const viaFaces = [];

          for (const comp of components) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const f of comp) {
              for (let j = 0; j < 3; j++) {
                const vi = idx.getX(f * 3 + j);
                const x = pos.getX(vi);
                const z = pos.getZ(vi);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;
              }
            }
            const xzExtent = Math.max(maxX - minX, maxZ - minZ);

            if (xzExtent < viaThreshold) {
              // Small XZ extent → via barrel
              for (const f of comp) {
                viaFaces.push(idx.getX(f * 3), idx.getX(f * 3 + 1), idx.getX(f * 3 + 2));
              }
            } else {
              // Large XZ extent → board edge
              for (const f of comp) {
                boardEdgeFaces.push(idx.getX(f * 3), idx.getX(f * 3 + 1), idx.getX(f * 3 + 2));
              }
            }
          }

          console.log(`[PCB3D] "${edgeMesh.name}": ${boardEdgeFaces.length / 3} edge faces (FR4), ${viaFaces.length / 3} via faces (gold)`);

          if (viaFaces.length > 0 && boardEdgeFaces.length > 0) {
            // Split: edge mesh keeps board edge, new mesh for vias
            geo.setIndex(new THREE.BufferAttribute(new Uint32Array(boardEdgeFaces), 1));
            edgeMesh.material = fr4Mat.clone();

            const viaGeo = geo.clone();
            viaGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(viaFaces), 1));
            const viaMesh = new THREE.Mesh(viaGeo, viaMat.clone());
            viaMesh.position.copy(edgeMesh.position);
            viaMesh.rotation.copy(edgeMesh.rotation);
            viaMesh.scale.copy(edgeMesh.scale);
            viaMesh.castShadow = true;
            viaMesh.receiveShadow = true;
            edgeMesh.parent.add(viaMesh);
          } else if (boardEdgeFaces.length > 0) {
            // All faces are board edge
            edgeMesh.material = fr4Mat.clone();
          } else {
            // All faces are vias (small mesh)
            edgeMesh.material = viaMat.clone();
          }
        }
      })();

      // Precompile shaders for the main scene (after via split adds new materials)
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
    } // end onSuccess

    // Start loading
    doLoad(modelSrc);
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
    // Mobile: disable antialias and shadows for faster reveal rendering
    const revealRenderer = new THREE.WebGLRenderer({
      canvas: revealCanvas,
      alpha: true,
      antialias: !isMobile
    });
    // Semi-transparent background
    revealRenderer.setClearColor(0x08080f, 0.75);
    revealRenderer.setSize(window.innerWidth, window.innerHeight);
    revealRenderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.0 : 2));
    revealRenderer.outputEncoding = THREE.sRGBEncoding;
    if (isMobile) {
      // Mobile: no shadows in reveal (lightweight scene)
      revealRenderer.shadowMap.enabled = false;
    } else {
      // PC: full quality shadows
      revealRenderer.shadowMap.enabled = true;
      revealRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Precompile reveal shaders (skip on mobile — JIT compile is fast enough for simple scene)
    if (!isMobile) {
      revealRenderer.compile(revealScene, revealCamera);
    }

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
    controls.autoRotate = false; // 카메라 고정 (트러스 고정)
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
      if (lightIntroStartTime === null) {
        lightIntroStartTime = Date.now();
      }
      
      const time = Date.now() * 0.001;
      
      const introElapsed = (Date.now() - lightIntroStartTime) / 1000.0; // in seconds
      
      // Phase 1: Sequential Turn-On (0.0 to 2.0 seconds)
      const turnOnProgress = Math.min(Math.max(introElapsed / 2.0, 0), 1);
      
      // Phase 2: Simultaneous Swing-Down (2.0 to 3.5 seconds)
      const swingElapsed = Math.max(introElapsed - 2.0, 0);
      const swingProgress = Math.min(Math.max(swingElapsed / 1.5, 0), 1);
      const ease = 1 - Math.pow(1 - swingProgress, 4);

      pcbModel.position.y = homeModelY + Math.sin(time * 1.2) * 0.005;
      if (turntableGroup) {
        turntableGroup.rotation.y += 0.003; // 바닥 원판과 PCB가 함께 회전
      }

      // ── Stage Spotlights: fade in and align animation ──
      for (let i = 0; i < stageSpots.length; i++) {
        const s = stageSpots[i];
        
        // Final fixed target position (criss-cross on the floor)
        const sweepX = s.baseX;
        const sweepZ = s.baseZ;
        const sweepY = -3.6; 
        
        // Starting Keyframe: pointing straight up into the sky (180 degrees inverted)
        const startX = s.srcX;
        const startY = 5.0; // Pointing straight up
        const startZ = s.srcZ;

        // Interpolate between start and sweep using the ease curve
        s.target.position.x = startX + (sweepX - startX) * ease;
        s.target.position.y = startY + (sweepY - startY) * ease;
        s.target.position.z = startZ + (sweepZ - startZ) * ease;
        
        s.head.lookAt(s.target.position);

        // Update fake beam opacity: sequential fade in!
        if (s.beamMat) {
          // Max threshold should be 0.9 so the *10 multiplier reaches 1.0 perfectly at turnOnProgress = 1.0
          const turnOnThreshold = i * (0.9 / Math.max(stageSpots.length - 1, 1));
          // Very fast fade-in (over 10% of the Phase 1 duration per light)
          const lightFade = Math.min(Math.max((turnOnProgress - turnOnThreshold) * 10, 0), 1);
          s.beamMat.opacity = s.baseOpacity * lightFade;
        }
      }

      // ── Rainbow RGB LED Animation ──
      // Cycle hue through the full spectrum (0→1) over ~4 seconds
      if (ledMeshes.length > 0) {
        const hue = (time * 0.25) % 1.0; // full rainbow cycle every 4s
        const ledColor = new THREE.Color();
        ledColor.setHSL(hue, 1.0, 0.5);

        for (let i = 0; i < ledMeshes.length; i++) {
          const entry = ledMeshes[i];
          // Emissive glow = rainbow color
          entry.mat.emissive.copy(ledColor);
          // Subtle pulsing intensity for liveliness
          entry.mat.emissiveIntensity = 1.8 + Math.sin(time * 3) * 0.4;
          entry.mat.needsUpdate = true;
        }

        // Update associated PointLights to match LED color
        for (let i = 0; i < ledLights.length; i++) {
          ledLights[i].color.copy(ledColor);
          ledLights[i].intensity = 0.6 + Math.sin(time * 3) * 0.2;
        }
      }

      // ── 4 Single LEDs Sequential Animation (Red, Orange, Green, Blue) ──
      if (window.sequenceLedGroups && window.sequenceLedGroups.length > 0) {
        // Boosted blue slightly for better visibility
        const singleColors = [0xff0000, 0xffa500, 0x00ff00, 0x1144ff];
        // Total cycle is 2.0 seconds (0.5s per LED)
        const cycleTime = introElapsed % 2.0;
        for (let i = 0; i < window.sequenceLedGroups.length; i++) {
          const group = window.sequenceLedGroups[i];
          const step = i % 4; // Map front and back LEDs to the 4 steps
          const turnOnTime = step * 0.5;
          const turnOffTime = turnOnTime + 0.5;
          
          let colorHex = 0x000000;
          let intensity = 0.0;
          
          if (cycleTime >= turnOnTime && cycleTime < turnOffTime) {
            // Smooth pulse from 0 -> 1 -> 0 over the 0.5 second interval
            const pulse = Math.sin(((cycleTime - turnOnTime) / 0.5) * Math.PI);
            colorHex = singleColors[step];
            // Blue (step 3) needs higher intensity to match perceptual brightness
            const maxIntensity = (step === 3) ? 6.0 : 3.0;
            intensity = maxIntensity * pulse;
          }
          
          // Apply animation to all meshes (body, lens, etc.) of this physical LED
          for (const sLed of group.meshes) {
            sLed.mat.emissive.setHex(colorHex);
            sLed.mat.emissiveIntensity = intensity;
            sLed.mat.needsUpdate = true;
          }
        }
      }
    } // End of if (pcbModel)

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
