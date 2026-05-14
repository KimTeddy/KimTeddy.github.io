// armi-pcb.js — A.RM.I Project Page PCB 3D Viewer
(function () {
  const container = document.getElementById('armi-pcb-viewer');
  if (!container || typeof THREE === 'undefined') return;

  let scene, camera, renderer, controls;
  let pcbModel = null;
  let animationId = null;
  let isInView = false;

  init();

  function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.01,
      100
    );
    camera.position.set(0, 0.40, 0.35);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

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

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));

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
    scene.add(dirLight);

    const accentLight = new THREE.PointLight(0x00e5a0, 0.4, 10);
    accentLight.position.set(0, -0.5, 0);
    scene.add(accentLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-3, 3, 5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 0.5);
    rimLight.position.set(-2, 2, -3);
    scene.add(rimLight);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 64),
      new THREE.MeshStandardMaterial({ color: 0x111118, metalness: 0.8, roughness: 0.3, transparent: true, opacity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    scene.add(floor);

    // Glow ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.2, 64),
      new THREE.MeshBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.04;
    scene.add(ring);

    loadModel();
    window.addEventListener('resize', onResize);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isInView = entry.isIntersecting;
        if (isInView && !animationId) animate();
      });
    }, { threshold: 0.1 });
    observer.observe(container);
  }

  function loadModel() {
    const loader = new THREE.GLTFLoader();
    loader.load(
      'assets/models/armi-pcb.glb',
      (gltf) => {
        pcbModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(pcbModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 0.25 / Math.max(size.x, size.y, size.z);
        pcbModel.scale.setScalar(scale);
        pcbModel.position.sub(center.multiplyScalar(scale));
        pcbModel.position.y += 0.02;

        pcbModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => {
              if (m.map) m.map.encoding = THREE.sRGBEncoding;
              if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
              m.needsUpdate = true;
            });
          }
        });

        scene.add(pcbModel);
        renderer.domElement.style.opacity = '1';
        if (isInView) animate();
      },
      null,
      (err) => console.error('GLB load error:', err)
    );
  }

  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate() {
    if (!isInView) { animationId = null; return; }
    animationId = requestAnimationFrame(animate);
    controls.update();
    if (pcbModel) {
      pcbModel.position.y = 0.02 + Math.sin(Date.now() * 0.0012) * 0.005;
    }
    renderer.render(scene, camera);
  }
})();
