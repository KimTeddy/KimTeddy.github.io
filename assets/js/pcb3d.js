// pcb3d.js — A.RM.I PCB 3D Showcase Viewer
(function () {
  const container = document.getElementById('pcb-3d-container');
  if (!container || typeof THREE === 'undefined') return;

  const fallbackImg = document.getElementById('pcb-fallback-img');
  const loadingEl = document.getElementById('pcb-loading');

  let scene, camera, renderer, controls;
  let pcbModel = null;
  let animationId = null;
  let isInView = false;

  const accentColor = new THREE.Color(0x00e5a0);

  init();

  function init() {
    // 1. Scene
    scene = new THREE.Scene();

    // 2. Camera
    camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    camera.position.set(0, 0.15, 0.35);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 4. Controls
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

    // Prevent page scroll interference on desktop
    renderer.domElement.addEventListener('wheel', (e) => {
      if (!e.shiftKey) {
        e.stopImmediatePropagation();
      }
    }, true);

    // 5. Lighting
    // Ambient — soft fill
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    // Main directional — key light with shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(3, 5, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 15;
    dirLight.shadow.camera.left = -0.5;
    dirLight.shadow.camera.right = 0.5;
    dirLight.shadow.camera.top = 0.5;
    dirLight.shadow.camera.bottom = -0.5;
    scene.add(dirLight);

    // Fill light from below — subtle green accent
    const accentLight = new THREE.PointLight(0x00e5a0, 0.4, 10);
    accentLight.position.set(0, -0.5, 0);
    scene.add(accentLight);

    // Rim light — from behind
    const rimLight = new THREE.DirectionalLight(0x3b82f6, 0.3);
    rimLight.position.set(-2, 2, -3);
    scene.add(rimLight);

    // 6. Reflective floor
    const floorGeo = new THREE.CircleGeometry(0.8, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x111118,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.5
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    scene.add(floor);

    // 7. Glow ring on floor
    const ringGeo = new THREE.RingGeometry(0.18, 0.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e5a0,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.04;
    scene.add(ring);

    // 8. Load GLB Model
    loadModel();

    // 9. Resize handler
    window.addEventListener('resize', onResize);

    // 10. IntersectionObserver — only render when visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isInView = entry.isIntersecting;
          if (isInView && !animationId) {
            animate();
          }
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(container);

    // 11. Control hint interaction
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

  function loadModel() {
    const loader = new THREE.GLTFLoader();

    loader.load(
      'assets/models/armi-pcb.glb',
      (gltf) => {
        pcbModel = gltf.scene;

        // Auto-fit: compute bounding box and center/scale model
        const box = new THREE.Box3().setFromObject(pcbModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale to fit within ~0.25 units
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 0.25 / maxDim;
        pcbModel.scale.setScalar(scale);

        // Re-center after scaling
        const scaledCenter = center.multiplyScalar(scale);
        pcbModel.position.sub(scaledCenter);
        pcbModel.position.y += 0.02; // Slight lift above floor

        // Enable shadows and fix texture encoding on all meshes
        pcbModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // Fix texture encoding for proper color display
            const mat = child.material;
            if (mat) {
              // Handle both single materials and material arrays
              const materials = Array.isArray(mat) ? mat : [mat];
              materials.forEach((m) => {
                if (m.map) m.map.encoding = THREE.sRGBEncoding;
                if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
                if (m.aoMap) m.aoMap.encoding = THREE.sRGBEncoding;
                m.needsUpdate = true;
              });
            }
          }
        });

        scene.add(pcbModel);

        // Hide loading, show canvas
        if (loadingEl) loadingEl.style.display = 'none';
        renderer.domElement.style.opacity = '1';

        // Start animation if in view
        if (isInView) animate();
      },
      (progress) => {
        // Loading progress
        if (loadingEl && progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          loadingEl.textContent = `PCB 모델 로딩 중... ${pct}%`;
        }
      },
      (error) => {
        console.error('GLB load error:', error);
        // Fallback to static image
        if (loadingEl) loadingEl.style.display = 'none';
        if (fallbackImg) fallbackImg.style.display = 'block';
        renderer.domElement.style.display = 'none';
      }
    );
  }

  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate() {
    if (!isInView) {
      animationId = null;
      return;
    }
    animationId = requestAnimationFrame(animate);
    controls.update();

    // Subtle floating effect for PCB
    if (pcbModel) {
      const time = Date.now() * 0.001;
      pcbModel.position.y = 0.02 + Math.sin(time * 1.2) * 0.005;
    }

    renderer.render(scene, camera);
  }
})();
