/* pcb-gallery.js — PCB 3D Exhibition Hall
 * A majestic museum-style hall: mirror floor, colonnade, spotlight beams,
 * rotating PCB models on pedestals, cinematic camera moves between exhibits.
 * Exhibit data is loaded from assets/data/pcb-models.yaml.
 *
 * Built to scale to MANY exhibits:
 *  - Hall geometry (arc radius, floor, pillars, fog, overview camera) is
 *    computed from the number of entries — add YAML entries, hall grows.
 *  - One shared light rig follows the focused pedestal instead of
 *    per-pedestal lights (forward renderer stays fast at any exhibit count).
 *  - GLB models are lazy-loaded (focused + neighbors only) with an LRU cap;
 *    evicted models are disposed and fall back to the hologram.
 */
(function () {
  const container = document.getElementById('pcb-hall-container');
  if (!container) return;

  const loadingEl = document.getElementById('pcb-hall-loading');
  const curtainEl = document.getElementById('pcb-hall-curtain');
  const infoEl = document.getElementById('pcb-exhibit-info');
  const dotsEl = document.getElementById('pcb-hall-dots');
  const prevBtn = document.getElementById('pcb-hall-prev');
  const nextBtn = document.getElementById('pcb-hall-next');
  const overviewBtn = document.getElementById('pcb-hall-overview');

  if (typeof THREE === 'undefined') {
    if (loadingEl) loadingEl.innerHTML = '<p>3D 라이브러리를 불러오지 못했습니다.</p>';
    return;
  }

  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ── Exhibit constants ──
  const PEDESTAL_TOP_Y = 1.41;     // top surface of pedestal
  const MODEL_Y = 2.05;            // resting height of exhibit center
  const MODEL_SIZE = 1.15;         // normalized max dimension of exhibits
  const ACCENT = 0x00e5a0;
  const CHORD = 3.4;               // distance between neighboring pedestals
  const MAX_SPREAD = Math.PI * 1.15; // pedestals never wrap further than ~207°
  const MAX_LOADED = isMobile ? 5 : 10; // LRU cap for simultaneously loaded GLBs

  // ── Hall layout (computed from exhibit count in init) ──
  let ARC_STEP = 0.85;
  let ARC_RADIUS = 4.2;
  let HALL_R = 9;                  // mirror floor radius
  let PILLAR_R = 11.5;

  let scene, camera, renderer, controls;
  let pedestals = [];              // { entry, group, ring, ringMat, modelGroup, holo, beamMats, pos, angle, phase, loading }
  let rig = null;                  // shared light rig { spot, spotTarget, rim, nSpots: [..] }
  let dust, dustVels = [];
  let loadedOrder = [];            // pedestal indices in load order (LRU)
  let centerIndex = 0;             // pedestal of the FIRST YAML entry (hall center)
  let currentIndex = -1;           // -1 = overview
  let camTween = null;
  let idleTimer = null;
  let isInView = true;
  let lastT = 0;
  const clock = new THREE.Clock();

  // ─────────────────────────────────────────────────────────────
  // Bootstrap: load exhibit data, then build the hall
  // ─────────────────────────────────────────────────────────────
  fetch('assets/data/pcb-models.yaml')
    .then(function (r) { return r.text(); })
    .then(function (t) {
      const data = jsyaml.load(t);
      const entries = (data && data.models) ? data.models : [];
      init(entries);
    })
    .catch(function (err) {
      console.error('[PCB Hall] data load error:', err);
      if (loadingEl) loadingEl.innerHTML = '<p>전시 데이터를 불러오지 못했습니다.</p>';
    });

  function init(entries) {
    computeLayout(entries.length);

    // ── Renderer ──
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050509);
    scene.fog = new THREE.Fog(0x050509, HALL_R + 1, PILLAR_R * 2.3);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.05, PILLAR_R * 5);
    camera.position.set(0, HALL_R * 0.72, HALL_R + 4);

    renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    // Enable dithering to fix 8-bit banding/stepping artifacts on smooth subtle light breathing
    renderer.dithering = true;
    renderer.shadowMap.enabled = !isMobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ── Controls ──
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 1.3;
    controls.maxDistance = HALL_R + 7;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.target.set(0, 2.0, 0);
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;

    // Wheel steps between exhibits (Shift+wheel zooms); touch swipes navigate on mobile
    initWheelNav();

    // Idle → slow majestic auto-orbit
    controls.addEventListener('start', function () {
      controls.autoRotate = false;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { if (!camTween) controls.autoRotate = true; }, 7000);
    });

    buildLighting();
    buildLightRig();
    buildHall();
    buildPedestals(entries);

    // Re-order pedestals spatially (left → right) so that index ±1 is a
    // physical neighbor — arrows, lazy-loading and the light rig all rely on it.
    // The first YAML entry sits at angle 0 (hall center) and gets initial focus.
    pedestals.sort(function (a, b) { return a.angle - b.angle; });
    centerIndex = pedestals.findIndex(function (p) { return p.angle === 0; });
    if (centerIndex < 0) centerIndex = 0;

    // Pre-load ALL non-placeholder models BEFORE the curtain opens
    // so every exhibit is already fetching during the cinematic camera descent.
    // With the current exhibit count this fits within MAX_LOADED comfortably.
    if (pedestals.length) {
      for (var pi = 0; pi < pedestals.length; pi++) ensureLoaded(pi);
      retargetRig(centerIndex);
    }

    buildDust();
    buildUI();

    window.addEventListener('resize', onResize);
    initRaycast();
    initVisibilityPause();

    // Reveal: hide loading, open curtain, cinematic descent to the first exhibit
    if (loadingEl) loadingEl.classList.add('is-hidden');
    setTimeout(function () {
      if (curtainEl) curtainEl.classList.add('is-open');
      setTimeout(function () {
        if (pedestals.length) goTo(centerIndex, 3.0);
      }, 700);
    }, 250);

    animate();
  }

  // Arc + hall dimensions from exhibit count.
  // Keeps neighbor spacing at CHORD; widens the arc radius as N grows.
  function computeLayout(n) {
    if (n > 1) {
      ARC_STEP = Math.min(0.85, MAX_SPREAD / (n - 1));
      ARC_RADIUS = Math.max(4.2, CHORD / (2 * Math.sin(ARC_STEP / 2)));
    } else {
      ARC_STEP = 0;
      ARC_RADIUS = 4.2;
    }
    HALL_R = ARC_RADIUS + 5;
    PILLAR_R = HALL_R + 2.5;
  }

  // ─────────────────────────────────────────────────────────────
  // Lighting — global ambience + ONE shared rig that follows focus
  // ─────────────────────────────────────────────────────────────
  function buildLighting() {
    scene.add(new THREE.AmbientLight(0x404060, 0.5));
    scene.add(new THREE.HemisphereLight(0x223344, 0x000000, 0.4));

    // Faint cool fill from the front so pedestal faces are never pitch black
    const fill = new THREE.DirectionalLight(0x8899bb, 0.18);
    fill.position.set(0, 4, 10);
    scene.add(fill);
  }

  function buildLightRig() {
    rig = {};

    // Primary spotlight — the star of the show, follows the focused pedestal
    rig.spot = new THREE.SpotLight(0xfff2dd, 1.9, ARC_RADIUS * 4, 0.42, 0.6, 1.2);
    rig.spotTarget = new THREE.Object3D();
    scene.add(rig.spotTarget);
    rig.spot.target = rig.spotTarget;
    if (!isMobile) {
      rig.spot.castShadow = true;
      rig.spot.shadow.mapSize.set(1024, 1024);
      rig.spot.shadow.bias = -0.0005;
    }
    scene.add(rig.spot);

    // Soft white rim light behind the focused exhibit
    rig.rim = new THREE.PointLight(0xffffff, 0.55, 5);
    scene.add(rig.rim);

    // Two dim spots for the immediate neighbors (no shadows)
    rig.nSpots = [];
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(0xfff2dd, 0.55, ARC_RADIUS * 4, 0.45, 0.7, 1.4);
      const tgt = new THREE.Object3D();
      scene.add(tgt);
      s.target = tgt;
      scene.add(s);
      rig.nSpots.push({ light: s, target: tgt });
    }
  }

  // Aim the rig at pedestal `i` (and its neighbors). i = -1 → hall center.
  function retargetRig(i) {
    const main = (i >= 0 && pedestals[i]) ? pedestals[i].pos : new THREE.Vector3(0, 0, 0);
    rig.spot.position.set(main.x, 6.2, main.z);
    rig.spotTarget.position.set(main.x, PEDESTAL_TOP_Y, main.z);
    rig.rim.position.set(main.x, 2.1, main.z - 1.2);

    for (let k = 0; k < 2; k++) {
      const nb = (i >= 0) ? pedestals[i + (k === 0 ? 1 : -1)] : null;
      const s = rig.nSpots[k];
      if (nb) {
        s.light.visible = true;
        s.light.position.set(nb.pos.x, 6.2, nb.pos.z);
        s.target.position.set(nb.pos.x, PEDESTAL_TOP_Y, nb.pos.z);
      } else {
        s.light.visible = false;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // The hall: mirror floor, rings, colonnade, halo rings, stars
  // ─────────────────────────────────────────────────────────────
  function buildHall() {
    // Mirror floor (desktop) or glossy dark floor (mobile)
    if (!isMobile && typeof THREE.Reflector !== 'undefined') {
      const mirror = new THREE.Reflector(new THREE.CircleGeometry(HALL_R, 48), {
        clipBias: 0.003,
        textureWidth: 1024,
        textureHeight: 1024,
        color: 0x778
      });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.y = 0;
      scene.add(mirror);

      // Dim the reflection so it reads as polished stone, not a perfect mirror
      const dimmer = new THREE.Mesh(
        new THREE.CircleGeometry(HALL_R, 48),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62 })
      );
      dimmer.rotation.x = -Math.PI / 2;
      dimmer.position.y = 0.005;
      scene.add(dimmer);
    } else {
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(PILLAR_R + 8, 48),
        new THREE.MeshStandardMaterial({ color: 0x0a0a10, metalness: 0.6, roughness: 0.3 })
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
    }

    // Outer floor beyond the mirror
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(HALL_R, PILLAR_R + 12, 48),
      new THREE.MeshStandardMaterial({ color: 0x07070c, metalness: 0.2, roughness: 0.9 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.002;
    scene.add(outer);

    // Faint concentric accent rings on the floor
    [0.27, 0.53, 0.8].forEach(function (f, i) {
      const r = HALL_R * f;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.015, r + 0.015, 96),
        new THREE.MeshBasicMaterial({
          color: ACCENT, transparent: true, opacity: 0.10 - i * 0.02,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      scene.add(ring);
    });

    // Colonnade — tall pillars fading into the fog around the hall
    const pillarCount = Math.max(12, Math.round(PILLAR_R * 1.1));
    const pillarGeo = new THREE.CylinderGeometry(0.38, 0.46, 10, 12);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0e0e17, metalness: 0.3, roughness: 0.8 });
    const capGeo = new THREE.CylinderGeometry(0.55, 0.5, 0.22, 12);
    for (let i = 0; i < pillarCount; i++) {
      const a = (i / pillarCount) * Math.PI * 2 + Math.PI / pillarCount;
      const px = Math.sin(a) * PILLAR_R, pz = Math.cos(a) * PILLAR_R;
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 5, pz);
      scene.add(pillar);
      const cap = new THREE.Mesh(capGeo, pillarMat);
      cap.position.set(px, 0.11, pz);
      scene.add(cap);
    }

    // Halo rings floating high above — the "dome" of the hall
    [{ r: HALL_R, y: 8.0, o: 0.10 }, { r: HALL_R * 0.6, y: 9.2, o: 0.07 }].forEach(function (h) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(h.r, 0.05, 8, 96),
        new THREE.MeshBasicMaterial({
          color: ACCENT, transparent: true, opacity: h.o,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = h.y;
      scene.add(halo);
    });

    // Distant star specks for depth
    const starCount = isMobile ? 150 : 350;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45;
      const rad = PILLAR_R + 5 + Math.random() * 8;
      starPos[i * 3] = Math.sin(th) * Math.cos(ph) * rad;
      starPos[i * 3 + 1] = Math.sin(ph) * rad + 1;
      starPos[i * 3 + 2] = Math.cos(th) * Math.cos(ph) * rad;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xaaccff, size: 0.05, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(stars);
  }

  // ─────────────────────────────────────────────────────────────
  // Pedestals + exhibits
  // ─────────────────────────────────────────────────────────────
  // Slot i → arc angle: entry 0 center, then sequentially left to right
  function slotAngle(i, totalCount) {
    if (i === 0) return 0;
    const leftCount = Math.ceil((totalCount - 1) / 2);
    if (i <= leftCount) {
      return -(leftCount - i + 1) * ARC_STEP;
    } else {
      return (i - leftCount) * ARC_STEP;
    }
  }

  function buildPedestals(entries) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x14141d, metalness: 0.4, roughness: 0.35 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 1.0, roughness: 0.3 });
    const seg = isMobile ? 32 : 48;

    entries.forEach(function (entry, i) {
      const angle = slotAngle(i, entries.length);
      const px = Math.sin(angle) * ARC_RADIUS;
      const pz = (Math.cos(angle) - 1) * ARC_RADIUS;
      const pos = new THREE.Vector3(px, 0, pz);

      const group = new THREE.Group();
      group.position.copy(pos);
      scene.add(group);

      // Base step + column + top plate
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.16, seg), stoneMat);
      base.position.y = 0.08;
      group.add(base);

      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.1, seg), stoneMat);
      column.position.y = 0.71;
      column.castShadow = !isMobile;
      group.add(column);

      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.545, 0.545, 0.04, seg), goldMat);
      band.position.y = 1.24;
      group.add(band);

      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.56, 0.12, seg), stoneMat);
      top.position.y = 1.35;
      top.receiveShadow = !isMobile;
      group.add(top);

      // Glowing accent ring on the pedestal top
      const ringMat = new THREE.MeshBasicMaterial({
        color: ACCENT, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, dithering: true
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.018, 8, 64), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = PEDESTAL_TOP_Y;
      group.add(ring);

      // Visible light beams (volumetric cone fake) — MeshBasic, no lighting cost
      const beamMats = [];
      [{ rTop: 0.16, rBot: 1.35, o: 0.045 }, { rTop: 0.10, rBot: 0.85, o: 0.07 }].forEach(function (b) {
        const beamMat = new THREE.MeshBasicMaterial({
          color: 0xbfffe8, transparent: true, opacity: b.o,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, dithering: true
        });
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(b.rTop, b.rBot, 4.7, isMobile ? 16 : 24, 1, true), beamMat
        );
        beam.position.y = PEDESTAL_TOP_Y + 4.7 / 2;
        group.add(beam);
        beamMats.push(beamMat);
      });

      const ped = {
        entry: entry, group: group, ring: ring, ringMat: ringMat,
        modelGroup: null, holo: null, beamMats: beamMats,
        pos: pos, angle: angle, phase: i * 1.7, loading: false
      };
      pedestals.push(ped);

      // Every pedestal starts with a hologram; real models are lazy-loaded
      addHologram(ped);
    });
  }

  // "Coming Soon" hologram — also the stand-in while a GLB loads
  function addHologram(ped) {
    if (ped.holo) return;
    const holo = new THREE.Group();
    const outer = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshBasicMaterial({
        color: ACCENT, wireframe: true, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 0),
      new THREE.MeshBasicMaterial({
        color: 0x66ffd0, wireframe: true, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    holo.add(outer);
    holo.add(inner);
    holo.position.y = MODEL_Y;
    ped.group.add(holo);
    ped.holo = holo;
  }

  function removeHologram(ped) {
    if (!ped.holo) return;
    ped.group.remove(ped.holo);
    ped.holo.children.forEach(function (c) { c.geometry.dispose(); c.material.dispose(); });
    ped.holo = null;
  }

  // ─────────────────────────────────────────────────────────────
  // Lazy loading with an LRU cap — scales to any number of exhibits
  // ─────────────────────────────────────────────────────────────
  function touchLRU(i) {
    const at = loadedOrder.indexOf(i);
    if (at !== -1) loadedOrder.splice(at, 1);
    loadedOrder.push(i);
  }

  function evictIfNeeded() {
    while (loadedOrder.length > MAX_LOADED) {
      // Evict the least-recently-used model that isn't focused or a neighbor
      let evicted = false;
      for (let k = 0; k < loadedOrder.length; k++) {
        const idx = loadedOrder[k];
        if (Math.abs(idx - currentIndex) <= 1) continue;
        loadedOrder.splice(k, 1);
        disposeModel(pedestals[idx]);
        evicted = true;
        break;
      }
      if (!evicted) break; // everything left is focused/neighbor — keep them
    }
  }

  function disposeModel(ped) {
    if (!ped.modelGroup) return;
    ped.group.remove(ped.modelGroup);
    ped.modelGroup.traverse(function (c) {
      if (c.isMesh) {
        if (c.geometry) c.geometry.dispose();
        (Array.isArray(c.material) ? c.material : [c.material]).forEach(function (m) {
          if (!m) return;
          ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach(function (k) {
            if (m[k]) m[k].dispose();
          });
          m.dispose();
        });
      }
    });
    ped.modelGroup = null;
    ped.armiState = null;
    addHologram(ped); // fall back to hologram until re-focused
  }

  // Make sure pedestal i (if it has a real model) is loaded or loading
  function ensureLoaded(i) {
    const ped = pedestals[i];
    if (!ped || ped.entry.placeholder || !ped.entry.model) return;
    if (ped.modelGroup || ped.loading) { if (ped.modelGroup) touchLRU(i); return; }
    ped.loading = true;
    loadExhibit(ped, function () {
      ped.loading = false;
      if (ped.modelGroup) {
        touchLRU(i);
        evictIfNeeded();
      }
    });
  }

  // Load focused exhibit and its direct neighbors
  function ensureAround(i) {
    ensureLoaded(i);
    if (i + 1 < pedestals.length) ensureLoaded(i + 1);
    if (i - 1 >= 0) ensureLoaded(i - 1);
  }

  // Load a GLB exhibit onto its pedestal
  function loadExhibit(ped, done) {
    const loader = new THREE.GLTFLoader();
    if (isMobile && typeof THREE.DRACOLoader !== 'undefined') {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
      loader.setDRACOLoader(draco);
    }

    const src = (isMobile && ped.entry.model_mobile) ? ped.entry.model_mobile : ped.entry.model;

    function doLoad(url) {
      loader.load(url, onSuccess, undefined, function (err) {
        if (isMobile && url.indexOf('-mobile.glb') !== -1) {
          doLoad(url.replace('-mobile.glb', '.glb')); // mobile GLB missing → full GLB
        } else {
          console.error('[PCB Hall] GLB load error:', err);
          done(); // hologram stays as the exhibit
        }
      });
    }

    function onSuccess(gltf) {
      const obj = gltf.scene;
      const modelGroup = new THREE.Group();

      // Scale to preserve real-world relative sizes across all PCBs.
      // pcb2blender exports use consistent Blender units, so a fixed
      // reference scale keeps proportions correct: the largest board
      // (armi, ~0.10 units) fills MODEL_SIZE; smaller boards stay smaller.
      const REFERENCE_DIM = 0.10; // largest model's max dimension (Blender units)
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = (MODEL_SIZE * (ped.entry.scale || 1)) / REFERENCE_DIM;
      obj.scale.setScalar(s);
      obj.position.sub(center.multiplyScalar(s));
      modelGroup.add(obj);

      obj.traverse(function (child) {
        if (child.isMesh) {
          child.castShadow = !isMobile;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(function (m) {
            if (!m) return;
            if (m.map) m.map.encoding = THREE.sRGBEncoding;
            if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
          });
        }
      });

      // Apply ARMI PCB enhancements (LED animation, material tweaks, via split)
      if (ped.entry.enhance === 'armi' && typeof ArmiPcbEnhance !== 'undefined') {
        ped.armiState = ArmiPcbEnhance.process(modelGroup, { castShadow: !isMobile, receiveShadow: !isMobile });
      }

      // Display tilted like a framed artwork, floating above the pedestal
      // Set order to YXZ so Y-rotation spins it like a turntable rather than a local axis
      modelGroup.rotation.order = 'YXZ';
      modelGroup.rotation.x = Math.PI / 3;

      // Align by bottom edge so every PCB has the same gap above the
      // pedestal, regardless of model size.
      // Temporarily place at full scale to measure the rotated bounding box.
      modelGroup.position.y = 0;
      modelGroup.scale.setScalar(1);
      modelGroup.updateMatrixWorld(true);
      var rotatedBox = new THREE.Box3().setFromObject(modelGroup);
      var FLOAT_BOTTOM = PEDESTAL_TOP_Y + 0.25; // consistent gap above pedestal
      modelGroup.userData.baseY = FLOAT_BOTTOM - rotatedBox.min.y;
      modelGroup.position.y = modelGroup.userData.baseY;

      modelGroup.scale.setScalar(0.001);       // grow-in entrance
      modelGroup.userData.grow = 0;
      removeHologram(ped);
      ped.group.add(modelGroup);
      ped.modelGroup = modelGroup;
      done();
    }

    doLoad(src);
  }

  // ─────────────────────────────────────────────────────────────
  // Floating dust motes in the light
  // ─────────────────────────────────────────────────────────────
  function createTextTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = '900 96px Arial, "Arial Black", sans-serif'; // 아주 굵은 글씨체
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  function buildDust() {
    const totalCount = isMobile ? 90 : Math.min(320, 140 + pedestals.length * 20);
    const spreadX = HALL_R * 1.6, spreadZ = HALL_R;
    
    const letters = ['P', 'C', 'B'];
    dust = new THREE.Group();
    
    letters.forEach(function (letter) {
      const count = Math.floor(totalCount / 3);
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * spreadX;
        pos[i * 3 + 1] = Math.random() * 6;
        pos[i * 3 + 2] = (Math.random() - 0.5) * spreadZ - 1;
        dustVels.push(0.0015 + Math.random() * 0.003);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      
      const mat = new THREE.PointsMaterial({
        color: 0xcffff0, size: 0.1, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
        map: createTextTexture(letter)
      });
      dust.add(new THREE.Points(geo, mat));
    });
    
    scene.add(dust);
  }

  // ─────────────────────────────────────────────────────────────
  // Camera moves
  // ─────────────────────────────────────────────────────────────
  function focusView(i) {
    const ped = pedestals[i];
    const arcCenter = new THREE.Vector3(0, 0, -ARC_RADIUS);
    const dir = ped.pos.clone().sub(arcCenter).setY(0).normalize();
    const pos = ped.pos.clone().add(dir.multiplyScalar(3.05));
    pos.y = 2.3;
    return { pos: pos, target: new THREE.Vector3(ped.pos.x, 1.95, ped.pos.z) };
  }

  function overviewView() {
    // Pull back far enough to frame the whole arc, whatever its size
    const dist = HALL_R + 2.5;
    return {
      pos: new THREE.Vector3(0, dist * 0.42, dist),
      target: new THREE.Vector3(0, 1.6, -ARC_RADIUS * 0.35)
    };
  }

  function tweenCamera(view, dur) {
    camTween = {
      fromPos: camera.position.clone(), toPos: view.pos,
      fromTarget: controls.target.clone(), toTarget: view.target,
      start: clock.getElapsedTime(), dur: dur || 1.4
    };
    controls.enabled = false;
    controls.autoRotate = false;
  }

  function goTo(i, dur) {
    if (!pedestals.length) return;
    currentIndex = ((i % pedestals.length) + pedestals.length) % pedestals.length;
    ensureAround(currentIndex);
    retargetRig(currentIndex);
    tweenCamera(focusView(currentIndex), dur);
    updateUI();
  }

  function goOverview() {
    currentIndex = -1;
    retargetRig(-1);
    tweenCamera(overviewView(), 1.6);
    updateUI();
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ─────────────────────────────────────────────────────────────
  // UI: info panel, dots, arrows
  // ─────────────────────────────────────────────────────────────
  function buildUI() {
    // Dots follow the spatial (left → right) pedestal order
    if (dotsEl) {
      pedestals.forEach(function (_, i) {
        const dot = document.createElement('button');
        dot.className = 'pcb-hall__dot';
        dot.setAttribute('aria-label', '전시 ' + (i + 1));
        dot.addEventListener('click', function () { goTo(i); });
        dotsEl.appendChild(dot);
      });
    }
    if (prevBtn) prevBtn.addEventListener('click', function () { goTo(currentIndex < 0 ? centerIndex : currentIndex - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goTo(currentIndex < 0 ? centerIndex : currentIndex + 1); });
    if (overviewBtn) overviewBtn.addEventListener('click', goOverview);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') goTo(currentIndex < 0 ? centerIndex : currentIndex - 1);
      if (e.key === 'ArrowRight') goTo(currentIndex < 0 ? centerIndex : currentIndex + 1);
    });
  }

  function updateUI() {
    if (dotsEl) {
      Array.prototype.forEach.call(dotsEl.children, function (dot, i) {
        dot.classList.toggle('is-active', i === currentIndex);
      });
    }
    if (!infoEl) return;

    if (currentIndex < 0) {
      infoEl.classList.remove('is-visible');
      return;
    }
    const entry = pedestals[currentIndex].entry;
    let html = '';
    if (entry.year) html += '<p class="pcb-exhibit-info__year">EXHIBIT ' + String(currentIndex + 1).padStart(2, '0') + ' / ' + String(pedestals.length).padStart(2, '0') + ' — ' + entry.year + '</p>';
    else html += '<p class="pcb-exhibit-info__year">EXHIBIT ' + String(currentIndex + 1).padStart(2, '0') + ' / ' + String(pedestals.length).padStart(2, '0') + '</p>';
    html += '<h2 class="pcb-exhibit-info__title">' + entry.title + '</h2>';
    if (entry.subtitle) html += '<p class="pcb-exhibit-info__subtitle">' + entry.subtitle + '</p>';
    if (entry.description) html += '<p class="pcb-exhibit-info__desc">' + entry.description + '</p>';
    html += '<div class="pcb-exhibit-info__tags">';
    (entry.tags || []).forEach(function (tag) { html += '<span class="badge badge--accent">' + tag + '</span>'; });
    html += '</div>';
    html += '<div class="pcb-exhibit-info__actions">';
    if (entry.links) {
      if (entry.links.page) html += '<a href="' + entry.links.page + '" class="btn btn--primary">상세 보기 →</a>';
      if (entry.links.github) html += '<a href="' + entry.links.github + '" target="_blank" class="btn btn--ghost">GitHub</a>';
      if (entry.links.youtube) html += '<a href="' + entry.links.youtube + '" target="_blank" class="btn btn--ghost">YouTube</a>';
      if (entry.links.blog) html += '<a href="' + entry.links.blog + '" target="_blank" class="btn btn--ghost">Blog</a>';
    }
    html += '</div>';
    infoEl.innerHTML = html;
    infoEl.classList.add('is-visible');
  }

  // ─────────────────────────────────────────────────────────────
  // Wheel / swipe navigation between exhibits
  // ─────────────────────────────────────────────────────────────
  // Desktop: plain wheel walks the tour (Shift+wheel = 3D zoom stays with
  // OrbitControls). At the LAST exhibit one more wheel-down releases the
  // page so the content below stays reachable.
  function initWheelNav() {
    let acc = 0, lastNav = 0;
    renderer.domElement.addEventListener('wheel', function (e) {
      if (e.shiftKey) return;                    // Shift+scroll → 3D zoom (OrbitControls)
      e.stopImmediatePropagation();              // plain scroll never dollies the camera
      const rect = container.getBoundingClientRect();
      if (rect.top < -12) return;                // hall scrolled away → native page scroll
      const dir = e.deltaY > 0 ? 1 : -1;
      if (dir > 0 && currentIndex === pedestals.length - 1) return; // release at the end
      e.preventDefault();                        // we own this scroll step
      const now = performance.now();
      if (camTween || now - lastNav < 650) { acc = 0; return; }
      acc = (acc * dir >= 0 ? acc : 0) + e.deltaY;
      if (Math.abs(acc) < 35) return;            // accumulate small trackpad deltas
      acc = 0; lastNav = now;
      if (currentIndex < 0) goTo(centerIndex);
      else if (dir > 0) goTo(Math.min(currentIndex + 1, pedestals.length - 1));
      else if (currentIndex > 0) goTo(currentIndex - 1);
    }, { capture: true, passive: false });
  }


  // ─────────────────────────────────────────────────────────────
  // Click a pedestal to walk to it
  // ─────────────────────────────────────────────────────────────
  function initRaycast() {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0, downY = 0;

    renderer.domElement.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY;
    });
    renderer.domElement.addEventListener('pointerup', function (e) {
      // Ignore drags — only treat small movements as clicks
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const groups = pedestals.map(function (p) { return p.group; });
      const hits = raycaster.intersectObjects(groups, true);
      if (!hits.length) return;
      // Walk through ALL hits (not just [0]) — skip the currently focused
      // pedestal so its model/beams don't block clicks on exhibits behind it.
      for (let h = 0; h < hits.length; h++) {
        var obj = hits[h].object;
        while (obj) {
          var idx = groups.indexOf(obj);
          if (idx !== -1) {
            if (idx !== currentIndex) { goTo(idx); return; }
            break; // this hit belongs to the focused pedestal — skip to next hit
          }
          obj = obj.parent;
        }
      }
    });
  }

  // Pause rendering while the hall is scrolled out of view
  function initVisibilityPause() {
    if (typeof IntersectionObserver === 'undefined') return;
    new IntersectionObserver(function (entries) {
      isInView = entries[0].isIntersecting;
    }, { threshold: 0.02 }).observe(container);
  }

  // ─────────────────────────────────────────────────────────────
  // Main loop
  // ─────────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    if (!isInView) return;

    const t = clock.getElapsedTime();
    const dt = Math.min(t - lastT, 0.05);
    lastT = t;

    // Camera tween
    if (camTween) {
      const k = Math.min((t - camTween.start) / camTween.dur, 1);
      const e = easeInOutCubic(k);
      camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
      controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
      if (k >= 1) {
        camTween = null;
        controls.enabled = true;
      }
    }

    // Rig breathing - slowed down for smooth transition without stepped flickering
    if (rig) rig.spot.intensity = 1.9 + Math.sin(t * 1.0) * 0.15;

    // Exhibits: rotation, bobbing, grow-in; rings pulse; beams breathe
    pedestals.forEach(function (ped, i) {
      const focused = (i === currentIndex);

      if (ped.modelGroup) {
        const mg = ped.modelGroup;
        if (mg.userData.grow < 1) {
          mg.userData.grow = Math.min(mg.userData.grow + dt * 1.4, 1);
          const g = 1 - Math.pow(1 - mg.userData.grow, 3);
          mg.scale.setScalar(Math.max(g, 0.001));
        }
        mg.rotation.y += focused ? 0.006 : 0.002;
        mg.position.y = (mg.userData.baseY || MODEL_Y) + Math.sin(t * 0.8 + ped.phase) * 0.045;

        // ARMI LED animation (shared module)
        if (ped.armiState && typeof ArmiPcbEnhance !== 'undefined') {
          ArmiPcbEnhance.animate(ped.armiState, t, t);
        }
      }

      if (ped.holo) {
        ped.holo.rotation.y += 0.01;
        ped.holo.children[1].rotation.y -= 0.024;
        ped.holo.children[1].rotation.x += 0.01;
        ped.holo.position.y = MODEL_Y + Math.sin(t * 1.1 + ped.phase) * 0.06;
        const pulse = 0.35 + Math.sin(t * 2 + ped.phase) * 0.2;
        ped.holo.children[0].material.opacity = pulse;
      }

      if (ped.focusProgress === undefined) ped.focusProgress = focused ? 1 : 0;
      ped.focusProgress += ((focused ? 1 : 0) - ped.focusProgress) * Math.min(dt * 4.0, 1.0);

      const ringBase = 0.28 + (0.55 - 0.28) * ped.focusProgress;
      // Slowed down frequency (t * 1.0 instead of 2.0) for a smoother breath
      ped.ringMat.opacity = ringBase + Math.sin(t * 1.0 + ped.phase) * 0.08;

      ped.beamMats.forEach(function (m, bi) {
        const base = bi === 0 ? 0.045 : 0.07;
        const currentBase = base + (base * 1.7 - base) * ped.focusProgress;
        // Slowed down frequency (t * 1.0) and slightly increased amplitude (0.02) to overcome 8-bit alpha stepping
        m.opacity = currentBase + Math.sin(t * 1.0 + ped.phase + bi) * 0.02;
      });
    });

    // Dust drifts upward
    if (dust) {
      let vIdx = 0;
      dust.children.forEach(function (points) {
        const arr = points.geometry.attributes.position.array;
        const count = arr.length / 3;
        for (let i = 0; i < count; i++) {
          arr[i * 3 + 1] += dustVels[vIdx++];
          if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = -1;
        }
        points.geometry.attributes.position.needsUpdate = true;
      });
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // ─────────────────────────────────────────────────────────────
  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
})();
