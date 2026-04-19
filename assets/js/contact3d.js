// contact3d.js — Majestic CSS3D Contact Space

(function() {
  const container = document.getElementById('contact-3d-container');
  if (!container || typeof THREE === 'undefined' || typeof THREE.CSS3DRenderer === 'undefined') return;

  const isLightMode = document.body.classList.contains('light-mode');
  
  const NODES = ['github', 'blog', 'youtube', 'instagram', 'email'];

  let sceneWebGL, sceneCSS, camera, rendererWebGL, rendererCSS;
  let particles, majesticStructures = [];
  let cssObjects = [];
  let mouseX = 0, mouseY = 0;
  let targetX = 0, targetY = 0;
  let windowHalfX = window.innerWidth / 2;
  let windowHalfY = window.innerHeight / 2;

  init();
  animate();

  function init() {
    // 1. WebGL Scene (for background particles)
    sceneWebGL = new THREE.Scene();
    sceneWebGL.fog = new THREE.FogExp2(isLightMode ? 0xf0f4f8 : 0x050505, 0.0015);

    // 2. CSS3D Scene (for HTML cards)
    sceneCSS = new THREE.Scene();

    // 3. Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.z = 800;

    // 4. WebGL Renderer
    rendererWebGL = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererWebGL.setPixelRatio(window.devicePixelRatio);
    rendererWebGL.setSize(window.innerWidth, window.innerHeight);
    rendererWebGL.domElement.style.position = 'absolute';
    rendererWebGL.domElement.style.top = '0px';
    rendererWebGL.domElement.style.pointerEvents = 'none'; // Clicks go through to CSS3D
    container.appendChild(rendererWebGL.domElement);

    // 5. CSS3D Renderer
    rendererCSS = new THREE.CSS3DRenderer();
    rendererCSS.setSize(window.innerWidth, window.innerHeight);
    rendererCSS.domElement.style.position = 'absolute';
    rendererCSS.domElement.style.top = '0px';
    container.appendChild(rendererCSS.domElement);

    // 6. Background Particles & Majestic Structures
    createParticles();
    createMajesticBackground();

    // 7. Contact Cards
    document.getElementById('hud-elements').style.display = 'block'; // Make elements available
    createCards();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('mousemove', onMouseMove, false);

    // Hide Loading Screen
    const loader = document.getElementById('contact-loading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.style.display = 'none', 800);
    }
  }

  function createParticles() {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const count = 1000;
    for (let i = 0; i < count; i++) {
      vertices.push(
        THREE.MathUtils.randFloatSpread(2000),
        THREE.MathUtils.randFloatSpread(2000),
        THREE.MathUtils.randFloatSpread(2000)
      );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.PointsMaterial({
      color: isLightMode ? 0x888888 : 0x00e5a0,
      size: 2,
      transparent: true,
      opacity: 0.6
    });
    particles = new THREE.Points(geometry, material);
    sceneWebGL.add(particles);
  }

  function createMajesticBackground() {
    // 1. Giant Wireframe Planet
    const planetGeo = new THREE.IcosahedronGeometry(1200, 2);
    const planetMat = new THREE.MeshBasicMaterial({ 
      color: isLightMode ? 0x000000 : 0x00e5a0, 
      wireframe: true, 
      transparent: true, 
      opacity: 0.03 
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    sceneWebGL.add(planet);
    majesticStructures.push(planet);

    // 2. Massive Orbital Rings
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.TorusGeometry(1500 + i * 200, 2, 16, 100);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.02 + i * 0.01 
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + (Math.random() * 0.5 - 0.25);
      ring.rotation.y = Math.random() * Math.PI;
      sceneWebGL.add(ring);
      majesticStructures.push(ring);
    }
  }

  function createCards() {
    NODES.forEach((id, i) => {
      const cardEl = document.getElementById(`card-${id}`);
      if (!cardEl) return;
      
      cardEl.style.opacity = '0';
      
      const cssObject = new THREE.CSS3DObject(cardEl);
      cssObject.userData = { basePos: { x: 0, y: 0, z: 0 } }; // Initialized by updateCardPositions
      
      sceneCSS.add(cssObject);
      cssObjects.push(cssObject);

      setTimeout(() => {
        cardEl.style.opacity = '1';
        cardEl.style.transition = 'all 0.5s cubic-bezier(0.23,1,0.32,1)';
      }, 500 + i * 150);
    });
    
    updateCardPositions();
  }

  function updateCardPositions() {
    const isMobile = window.innerWidth < 768;
    const shortScreenFactor = Math.max(0, 800 - window.innerHeight) * 0.4; // Push down more if screen is short

    cssObjects.forEach((cssObject, i) => {
      const nodeId = NODES[i];
      let pos = { x: 0, y: 0, z: 0 };
      
      if (isMobile) {
        // Vertical layout for small screens
        const baseShift = 150 + shortScreenFactor;
        const yOffset = (2 - i) * 100 - baseShift;
        const xOffset = (i % 2 === 0) ? -20 : 20; 
        let zOffset = 0;
        switch(nodeId) {
           case 'github': zOffset = -50; break;
           case 'blog': zOffset = -150; break;
           case 'youtube': zOffset = 100; break;
           case 'instagram': zOffset = 0; break;
           case 'email': zOffset = -50; break;
        }
        pos = { x: xOffset, y: yOffset, z: zOffset };
      } else {
        // Desktop horizontal layout
        // Scale Y to be tighter on short screens and push the whole set down
        const scaleY = window.innerHeight < 700 ? 0.6 : 1.0;
        switch(nodeId) {
          case 'github': pos = { x: -300, y: 150 * scaleY, z: -100 }; break;
          case 'blog': pos = { x: 300, y: 200 * scaleY, z: -300 }; break;
          case 'youtube': pos = { x: 0, y: 0 * scaleY, z: 150 }; break;
          case 'instagram': pos = { x: -400, y: -150 * scaleY, z: 0 }; break;
          case 'email': pos = { x: 400, y: -100 * scaleY, z: -50 }; break;
        }
        pos.y -= shortScreenFactor; // shift everything down on short screens
      }
      
      cssObject.userData.basePos = pos;
      cssObject.position.set(pos.x, pos.y, pos.z);
    });
    
    // Dynamic Z calculation to ensure 1:1 pixel mapping or a comfortable fit
    // This prevents zooming in too much on large desktop windows, which caused cutoffs.
    if (isMobile) {
      camera.position.z = 1200; // Pull back slightly for mobile vertical stack
    } else {
      // Standard formula to make 1 unit at Z=0 exactly 1 pixel in size
      const fovRad = THREE.MathUtils.degToRad(camera.fov / 2);
      let optimalZ = (window.innerHeight / 2) / Math.tan(fovRad);
      
      // Clamp to prevent it from getting too close or too far
      camera.position.z = Math.max(800, Math.min(optimalZ, 1500));
    }
  }

  function onWindowResize() {
    windowHalfX = window.innerWidth / 2;
    windowHalfY = window.innerHeight / 2;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    rendererWebGL.setSize(window.innerWidth, window.innerHeight);
    rendererCSS.setSize(window.innerWidth, window.innerHeight);
    updateCardPositions();
  }

  function onMouseMove(event) {
    mouseX = (event.clientX - windowHalfX);
    mouseY = (event.clientY - windowHalfY);
  }

  function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;

    // Parallax Camera
    targetX = mouseX * 0.1;
    targetY = mouseY * 0.1;
    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (-targetY - camera.position.y) * 0.05;
    camera.lookAt(sceneCSS.position);

    // Rotate Particles & Majestic Structures
    particles.rotation.y = time * 0.05;
    particles.rotation.x = time * 0.02;

    majesticStructures.forEach((struct, i) => {
      struct.rotation.y += 0.001 * (i % 2 === 0 ? 1 : -1);
      struct.rotation.x += 0.0005 * (i % 2 === 0 ? 1 : -1);
      struct.rotation.z += 0.0002;
    });

    // Gentle Floating Y and Look-at-Mouse for Cards
    cssObjects.forEach((obj, i) => {
      // Float
      obj.position.y = obj.userData.basePos.y + Math.sin(time * 2 + i) * 15;
      
      // Rotate slightly toward mouse
      const normX = mouseX / windowHalfX;
      const normY = mouseY / windowHalfY;
      
      // Target rotations (up to ~17 degrees)
      const targetRotY = normX * 0.4;
      const targetRotX = normY * 0.4;
      
      // Smooth interpolation
      obj.rotation.y += (targetRotY - obj.rotation.y) * 0.1;
      obj.rotation.x += (targetRotX - obj.rotation.x) * 0.1;
    });

    rendererWebGL.render(sceneWebGL, camera);
    rendererCSS.render(sceneCSS, camera);
  }
})();
